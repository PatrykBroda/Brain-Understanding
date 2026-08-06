import { Router, type IRouter } from "express";
import { createReadStream } from "node:fs";
import { stat, rm } from "node:fs/promises";
import {
  db,
  videoAnalysesTable,
  type AnalysisKeyframe,
  type AnalysisMetrics,
  type AnalysisSignal,
  type AnalysisScore,
  type AnalysisSubject,
  type DetectedEvent,
  type NervousSystemLoad,
} from "@workspace/db";
import { and, desc, eq, lt } from "drizzle-orm";
import { getUserFighter } from "../middlewares/authMiddleware";
import { getActiveFacts, addFact, confirmFact, findActiveFactByTopic } from "../lib/factsService";
import { getEntitlementForUserId } from "../lib/subscriptionService";
import { getActiveCompetition } from "../lib/competitionService";
import {
  generateAnalysis,
  generateOpponentAnalysis,
  gateMatchup,
  buildComparison,
  buildReplayMoments,
  isValidKind,
  isValidLoad,
  isValidSubject,
  hasCanonicalScores,
  recomputeSessionScore,
  ContentValidationError,
} from "../lib/analysisService";
import {
  classifySource,
  normalizeForFetch,
  safeStream,
  MAX_REMOTE_BYTES,
  RemoteFetchError,
} from "../lib/remoteFetch";
import { downloadYouTube, YtDlpError } from "../lib/ytdlp";

// The "Athlete Model Updated" payload — every value read back from the DB
// after real writes, never estimated. Rendered under the FRAME REPORT.
export type AnalysisModelUpdate = {
  newObservations: {
    id: number;
    category: string;
    subcategory: string | null;
    topic: string;
    content: string;
    confidence: number;
  }[];
  confirmed: {
    id: number;
    topic: string;
    content: string;
    evidenceCount: number;
    previousConfidence: number;
    confidence: number;
  }[];
  confidencePointsDelta: number;
};

const router: IRouter = Router();

const MAX_KEYFRAMES = 6;
const MAX_KEYFRAME_BYTES = 600_000; // ~600KB of base64 per frame ceiling

function sanitiseSignals(input: unknown): AnalysisSignal[] {
  if (!Array.isArray(input)) return [];
  const out: AnalysisSignal[] = [];
  for (const s of input.slice(0, 24)) {
    const it = s as Record<string, unknown>;
    const key = typeof it["key"] === "string" ? it["key"] : "";
    const label = typeof it["label"] === "string" ? it["label"] : "";
    const value = typeof it["value"] === "string" ? it["value"] : "";
    const detail = typeof it["detail"] === "string" ? it["detail"] : "";
    if (!key || !label) continue;
    out.push({
      key: key.slice(0, 60),
      label: label.slice(0, 80),
      value: value.slice(0, 80),
      detail: detail.slice(0, 240),
    });
  }
  return out;
}

function sanitiseScores(input: unknown): AnalysisScore[] {
  if (!Array.isArray(input)) return [];
  const out: AnalysisScore[] = [];
  for (const s of input.slice(0, 12)) {
    const it = s as Record<string, unknown>;
    const key = typeof it["key"] === "string" ? it["key"] : "";
    const label = typeof it["label"] === "string" ? it["label"] : "";
    if (!key || !label) continue;
    const rawVal = typeof it["value"] === "number" && Number.isFinite(it["value"]) ? it["value"] : 0;
    out.push({
      key: key.slice(0, 40),
      label: label.slice(0, 60),
      value: Math.max(0, Math.min(100, Math.round(rawVal))),
      basis: (typeof it["basis"] === "string" ? it["basis"] : "").slice(0, 240),
    });
  }
  return out;
}

function sanitiseEvents(input: unknown): DetectedEvent[] {
  if (!Array.isArray(input)) return [];
  const out: DetectedEvent[] = [];
  for (const e of input.slice(0, 8)) {
    const it = e as Record<string, unknown>;
    const type = typeof it["type"] === "string" ? it["type"] : "";
    const label = typeof it["label"] === "string" ? it["label"] : "";
    if (!type || !label) continue;
    const sevRaw = typeof it["severity"] === "string" ? it["severity"] : "low";
    const severity = (["low", "medium", "high"].includes(sevRaw) ? sevRaw : "low") as
      | "low"
      | "medium"
      | "high";
    out.push({
      timestamp:
        typeof it["timestamp"] === "number" && Number.isFinite(it["timestamp"]) ? it["timestamp"] : 0,
      type: type.slice(0, 40),
      label: label.slice(0, 60),
      severity,
    });
  }
  return out;
}

function sanitiseKeyframes(input: unknown): AnalysisKeyframe[] {
  if (!Array.isArray(input)) return [];
  const out: AnalysisKeyframe[] = [];
  for (const k of input.slice(0, MAX_KEYFRAMES)) {
    const it = k as Record<string, unknown>;
    const img = typeof it["imageBase64"] === "string" ? it["imageBase64"] : "";
    if (!img || img.length > MAX_KEYFRAME_BYTES) continue;
    const eventType = typeof it["eventType"] === "string" ? it["eventType"].slice(0, 40) : undefined;
    out.push({
      timestamp: typeof it["timestamp"] === "number" && Number.isFinite(it["timestamp"]) ? it["timestamp"] : 0,
      imageBase64: img,
      caption: (typeof it["caption"] === "string" ? it["caption"] : "").slice(0, 200),
      ...(eventType ? { eventType } : {}),
    });
  }
  return out;
}

router.post("/analysis", async (req, res) => {
  const fighter = await getUserFighter(req);
  if (!fighter) {
    res.status(400).json({ error: "no fighter — complete onboarding first" });
    return;
  }

  const body = req.body as {
    kind?: unknown;
    subject?: unknown;
    opponentName?: unknown;
    focus?: unknown;
    load?: unknown;
    fragmentationRisk?: unknown;
    loadBasis?: unknown;
    sessionScore?: unknown;
    durationSec?: unknown;
    framesAnalysed?: unknown;
    poseFrames?: unknown;
    signals?: unknown;
    scores?: unknown;
    detectedEvents?: unknown;
    keyframes?: unknown;
  };

  // "self" = the athlete's own footage (scored FRAME REPORT). "opponent" = a
  // scouting read of someone they may face (categorical only, matchup vs the
  // athlete's recorded model). Defaults to self for older clients.
  const subject: AnalysisSubject = isValidSubject(body.subject) ? body.subject : "self";

  // Entitlement. Self: the FIRST self analysis is a free one-time taster, then
  // FRAME+. Opponent scouting is FRAME+ from the first upload — it only earns
  // its keep once the athlete has a model to contrast against.
  const entitlement = await getEntitlementForUserId(req.userId as string);
  if (entitlement.plan === "free") {
    if (subject === "opponent") {
      res.status(402).json({
        error: "Opponent scouting is a FRAME+ feature.",
        code: "FRAME_PLUS_REQUIRED",
        feature: "opponent_analysis",
      });
      return;
    }
    const [existing] = await db
      .select({ id: videoAnalysesTable.id })
      .from(videoAnalysesTable)
      .where(
        and(
          eq(videoAnalysesTable.fighterId, fighter.id),
          // Only the athlete's OWN reads consume the free taster — an opponent
          // scout (FRAME+ only anyway) never burns it.
          eq(videoAnalysesTable.subject, "self"),
        ),
      )
      .limit(1);
    if (existing) {
      res.status(402).json({
        error: "Your free analysis is used. FRAME+ makes video analysis unlimited.",
        code: "FRAME_PLUS_REQUIRED",
        feature: "video_analysis",
      });
      return;
    }
  }

  if (!isValidKind(body.kind)) {
    res.status(400).json({ error: "invalid or missing kind" });
    return;
  }
  if (!isValidLoad(body.load)) {
    res.status(400).json({ error: "invalid or missing load" });
    return;
  }
  const fragmentationRisk: NervousSystemLoad = isValidLoad(body.fragmentationRisk)
    ? body.fragmentationRisk
    : body.load;

  const signals = sanitiseSignals(body.signals);
  const scores = sanitiseScores(body.scores);
  const detectedEvents = sanitiseEvents(body.detectedEvents);
  const keyframes = sanitiseKeyframes(body.keyframes);
  if (signals.length === 0) {
    res.status(400).json({ error: "no movement signals — could not read a pose from this clip" });
    return;
  }

  // Self reads carry the four-attribute FRAME REPORT scorecard. Opponent reads are
  // deliberately categorical — no 0-100 scores — so their scorecard is empty and the
  // canonical-score requirement does not apply.
  if (subject === "self" && !hasCanonicalScores(scores)) {
    res.status(400).json({ error: "scores must include the four FRAME REPORT attributes" });
    return;
  }

  const focus = typeof body.focus === "string" ? body.focus.slice(0, 280) : "";
  const opponentName =
    subject === "opponent" && typeof body.opponentName === "string"
      ? body.opponentName.trim().slice(0, 80)
      : "";
  // The headline SESSION SCORE is the composite of the (deterministic, pose-derived) attribute
  // values. Recompute it server-side from the accepted scores so it can't be a fabricated
  // free-floating value — it is always internally consistent with the attributes shown. Opponent
  // reads have no scorecard, so there is no session score (stored as 0, never shown).
  const sessionScore = subject === "opponent" ? 0 : recomputeSessionScore(scores, fragmentationRisk);
  const durationSec =
    typeof body.durationSec === "number" && Number.isFinite(body.durationSec) ? body.durationSec : 0;

  const metrics: AnalysisMetrics = {
    framesAnalysed:
      typeof body.framesAnalysed === "number" && Number.isFinite(body.framesAnalysed)
        ? Math.round(body.framesAnalysed)
        : 0,
    poseFrames:
      typeof body.poseFrames === "number" && Number.isFinite(body.poseFrames)
        ? Math.round(body.poseFrames)
        : 0,
    durationSec,
    loadBasis: typeof body.loadBasis === "string" ? body.loadBasis.slice(0, 240) : "",
    signals,
  };

  try {
    const facts = await getActiveFacts(fighter.id);

    // ---- Opponent scouting branch: categorical read + matchup, no scorecard,
    // no knowledge-loop writes, no self progression. Returns before any of the
    // self-only progression queries below. ----
    if (subject === "opponent") {
      const oppNarrative = await generateOpponentAnalysis({
        fighter,
        facts,
        kind: body.kind,
        focus,
        opponentName,
        load: body.load,
        metrics,
        keyframes,
      });
      // Deterministic honesty gate: keep the matchup only when the athlete has a
      // real recorded model AND the opponent clip has enough tracked movement.
      const matchup = gateMatchup(oppNarrative.matchup, facts.length, signals.length);
      // Stamp the live camp so the scout is filed under this fight, but opponent
      // rows are excluded from the camp REVIEW (that's self-progression only).
      const activeCamp = await getActiveCompetition(fighter.id);
      const [row] = await db
        .insert(videoAnalysesTable)
        .values({
          fighterId: fighter.id,
          campId: activeCamp?.id ?? null,
          subject: "opponent",
          opponentName,
          kind: body.kind,
          focus,
          nervousSystemLoad: body.load,
          fragmentationRisk,
          sessionScore: 0,
          styleProfile: oppNarrative.styleProfile,
          aiComment: "",
          summary: oppNarrative.summary,
          findings: oppNarrative.findings,
          scores: [],
          styleParallels: oppNarrative.styleParallels,
          detectedEvents,
          comparison: null,
          matchup,
          metrics,
          keyframes,
          reviewQuestion: "",
          replayMoments: [],
          durationSec,
        })
        .returning();
      res.json({ analysis: row });
      return;
    }

    // Up to 5 prior sessions — used for "what changed" and the signal history trail.
    // Self rows only: opponent scouts never enter the athlete's own progression.
    const prevRows = await db
      .select({
        id: videoAnalysesTable.id,
        createdAt: videoAnalysesTable.createdAt,
        scores: videoAnalysesTable.scores,
        metrics: videoAnalysesTable.metrics,
      })
      .from(videoAnalysesTable)
      .where(
        and(
          eq(videoAnalysesTable.fighterId, fighter.id),
          eq(videoAnalysesTable.subject, "self"),
        ),
      )
      .orderBy(desc(videoAnalysesTable.createdAt))
      .limit(5);
    const prevScores =
      prevRows[0] && Array.isArray(prevRows[0].scores) && prevRows[0].scores.length
        ? prevRows[0].scores
        : null;
    const prevSignals =
      prevRows[0]?.metrics &&
      Array.isArray(prevRows[0].metrics.signals) &&
      prevRows[0].metrics.signals.length
        ? prevRows[0].metrics.signals
        : null;

    const narrative = await generateAnalysis({
      fighter,
      facts,
      kind: body.kind,
      focus,
      load: body.load,
      fragmentationRisk,
      sessionScore,
      scores,
      prevScores,
      metrics,
      keyframes,
    });

    const comparison = buildComparison(scores, prevScores, narrative.comparisonNote);
    // Replay timestamps are resolved against the SAME sanitised keyframes that
    // are persisted below, so every moment points at a real stored frame.
    const replayMoments = buildReplayMoments(narrative.replay, keyframes);

    // Camp intelligence: stamp the camp that is live RIGHT NOW so this footage
    // rolls up into that camp's review. Null when no camp is active — camp
    // membership is decided once, at write time, never re-derived by date later.
    const activeCamp = await getActiveCompetition(fighter.id);

    const [row] = await db
      .insert(videoAnalysesTable)
      .values({
        fighterId: fighter.id,
        campId: activeCamp?.id ?? null,
        kind: body.kind,
        focus,
        nervousSystemLoad: body.load,
        fragmentationRisk,
        sessionScore,
        styleProfile: narrative.styleProfile,
        aiComment: narrative.aiComment,
        summary: narrative.summary,
        findings: narrative.findings,
        scores,
        styleParallels: narrative.styleParallels,
        detectedEvents,
        comparison,
        metrics,
        keyframes,
        reviewQuestion: narrative.reviewQuestion,
        replayMoments,
        durationSec,
      })
      .returning();

    // Knowledge Loop: feed the athlete model. A finding that matches an
    // existing observation STRENGTHENS it (new evidence appended, confidence
    // recomputed server-side); only genuinely new observations create rows.
    // The resulting modelUpdate is computed from real before/after DB state.
    const modelUpdate: AnalysisModelUpdate = {
      newObservations: [],
      confirmed: [],
      confidencePointsDelta: 0,
    };
    if (row) {
      const source = { type: "video", ref: `video:${row.id}` };
      // One clip = one sighting. If several findings map to the same fact,
      // only the first counts — otherwise a single video would inflate
      // evidenceCount as if it were independent corroboration.
      const touchedFactIds = new Set<number>();
      for (const f of narrative.findings) {
        if (f.severity === "low") continue;
        const topic = `${body.kind}: ${f.title}`.slice(0, 120);
        const content = `${f.observation} ${f.nervousSystemFraming}`.trim().slice(0, 600);
        try {
          // 1. AI-proposed merge target — confirmFact validates the id
          //    belongs to this fighter and is still active; invalid ids fall
          //    through to the deterministic paths.
          if (f.matchesFactId && touchedFactIds.has(f.matchesFactId)) continue;
          if (f.matchesFactId) {
            const confirmed = await confirmFact(fighter.id, f.matchesFactId, source);
            if (confirmed) {
              touchedFactIds.add(confirmed.fact.id);
              modelUpdate.confirmed.push({
                id: confirmed.fact.id,
                topic: confirmed.fact.topic,
                content: confirmed.fact.content,
                evidenceCount: confirmed.fact.evidenceCount,
                previousConfidence: confirmed.previousConfidence,
                confidence: confirmed.fact.confidence,
              });
              modelUpdate.confidencePointsDelta +=
                confirmed.fact.confidence - confirmed.previousConfidence;
              continue;
            }
          }
          // 2. Deterministic merge: an identical normalized topic from a prior
          //    analysis is the same observation seen again.
          const existing = await findActiveFactByTopic(fighter.id, topic);
          if (existing) {
            if (touchedFactIds.has(existing.id)) continue;
            const confirmed = await confirmFact(fighter.id, existing.id, source);
            if (confirmed) {
              touchedFactIds.add(confirmed.fact.id);
              modelUpdate.confirmed.push({
                id: confirmed.fact.id,
                topic: confirmed.fact.topic,
                content: confirmed.fact.content,
                evidenceCount: confirmed.fact.evidenceCount,
                previousConfidence: confirmed.previousConfidence,
                confidence: confirmed.fact.confidence,
              });
              modelUpdate.confidencePointsDelta +=
                confirmed.fact.confidence - confirmed.previousConfidence;
              continue;
            }
          }
          // 3. Genuinely new observation.
          const created = await addFact(fighter.id, {
            category: f.severity === "high" ? "weakness" : "pattern",
            topic,
            content,
            source,
            subcategory: f.subcategory ?? null,
          });
          touchedFactIds.add(created.id);
          modelUpdate.newObservations.push({
            id: created.id,
            category: created.category,
            subcategory: created.subcategory,
            topic: created.topic,
            content: created.content,
            confidence: created.confidence,
          });
        } catch (err) {
          req.log.error({ err }, "analysis fact write failed");
        }
      }
    }

    // Signal history trail: prior sessions oldest-first so the client can render a path
    const signalHistory = prevRows
      .slice()
      .reverse()
      .map((r) => ({
        id: r.id,
        createdAt: r.createdAt.toISOString(),
        signals:
          r.metrics && Array.isArray(r.metrics.signals) ? (r.metrics.signals as AnalysisSignal[]) : [],
      }))
      .filter((r) => r.signals.length > 0);

    res.json({ analysis: { ...row, prevSignals, signalHistory }, modelUpdate });
  } catch (err) {
    if (err instanceof ContentValidationError) {
      res.status(422).json({ error: err.message, code: "INVALID_CONTENT" });
      return;
    }
    req.log.error({ err }, "analysis generation failed");
    res.status(500).json({ error: err instanceof Error ? err.message : "analysis failed" });
  }
});

// Film-review loop: record the athlete's answer to the ONE grounded follow-up
// question FRAME asked. No entitlement gate — this is the free half of the loop
// (the analysis it belongs to was already paid for or was the free taster).
router.post("/analysis/:id/answer", async (req, res) => {
  const fighter = await getUserFighter(req);
  if (!fighter) {
    res.status(400).json({ error: "no fighter" });
    return;
  }
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "bad id" });
    return;
  }
  const body = req.body as { answer?: unknown };
  const answer = typeof body.answer === "string" ? body.answer.trim().slice(0, 500) : "";
  if (!answer) {
    res.status(400).json({ error: "answer required" });
    return;
  }

  // Load first so we can 404 cleanly and recover the question text for the fact.
  const [current] = await db
    .select()
    .from(videoAnalysesTable)
    .where(and(eq(videoAnalysesTable.id, id), eq(videoAnalysesTable.fighterId, fighter.id)))
    .limit(1);
  if (!current) {
    res.status(404).json({ error: "not found" });
    return;
  }
  if (!current.reviewQuestion) {
    // No grounded question was ever posed for this read — nothing to answer.
    res.status(409).json({ error: "no review question for this analysis" });
    return;
  }

  // Race-safe first-writer-wins: only the UPDATE that flips an EMPTY answer to
  // this one returns a row. A concurrent duplicate submit finds review_answer
  // already set, gets no row back, and skips the fact write — so a single
  // review can never double-record the athlete_fact.
  const [updated] = await db
    .update(videoAnalysesTable)
    .set({ reviewAnswer: answer })
    .where(
      and(
        eq(videoAnalysesTable.id, id),
        eq(videoAnalysesTable.fighterId, fighter.id),
        eq(videoAnalysesTable.reviewAnswer, ""),
      ),
    )
    .returning();

  if (!updated) {
    // Already answered — idempotent no-op: return the stored row, no new fact.
    res.json({ analysis: current, fact: null });
    return;
  }

  // The athlete's own words about this session are durable context. athleteStated
  // marks it as self-reported (a categorical marker, never a fabricated number).
  let fact = null;
  try {
    const question = current.reviewQuestion || "Film review reflection";
    fact = await addFact(fighter.id, {
      category: "context",
      topic: question.slice(0, 120),
      content: answer,
      source: { type: "video", ref: `video:${id}` },
      athleteStated: true,
    });
  } catch (err) {
    req.log.error({ err }, "review answer fact write failed");
  }

  res.json({ analysis: updated, fact });
});

router.get("/analysis", async (req, res) => {
  const fighter = await getUserFighter(req);
  if (!fighter) {
    res.json({ analyses: [] });
    return;
  }

  // Opponent scouting list — a separate, clearly-distinct track from the self
  // timeline. Categorical only (no scores), FRAME+ only, so no free-tier taster
  // gating applies (free users have no opponent rows to begin with).
  if (req.query.subject === "opponent") {
    const oppRows = await db
      .select({
        id: videoAnalysesTable.id,
        kind: videoAnalysesTable.kind,
        opponentName: videoAnalysesTable.opponentName,
        nervousSystemLoad: videoAnalysesTable.nervousSystemLoad,
        durationSec: videoAnalysesTable.durationSec,
        createdAt: videoAnalysesTable.createdAt,
        matchup: videoAnalysesTable.matchup,
      })
      .from(videoAnalysesTable)
      .where(
        and(
          eq(videoAnalysesTable.fighterId, fighter.id),
          eq(videoAnalysesTable.subject, "opponent"),
        ),
      )
      .orderBy(desc(videoAnalysesTable.createdAt))
      .limit(20);
    res.json({
      opponents: oppRows.map((r) => ({
        id: r.id,
        kind: r.kind,
        opponentName: r.opponentName,
        nervousSystemLoad: r.nervousSystemLoad,
        durationSec: r.durationSec,
        createdAt: r.createdAt,
        hasMatchup: r.matchup != null,
      })),
    });
    return;
  }

  const rows = await db
    .select({
      id: videoAnalysesTable.id,
      kind: videoAnalysesTable.kind,
      nervousSystemLoad: videoAnalysesTable.nervousSystemLoad,
      sessionScore: videoAnalysesTable.sessionScore,
      styleProfile: videoAnalysesTable.styleProfile,
      summary: videoAnalysesTable.summary,
      durationSec: videoAnalysesTable.durationSec,
      createdAt: videoAnalysesTable.createdAt,
      scores: videoAnalysesTable.scores,
    })
    .from(videoAnalysesTable)
    // Athlete's own history only — opponent scouting rows live outside the
    // self timeline (their own view, never the progression list).
    .where(
      and(
        eq(videoAnalysesTable.fighterId, fighter.id),
        eq(videoAnalysesTable.subject, "self"),
      ),
    )
    .orderBy(desc(videoAnalysesTable.createdAt))
    .limit(20);

  // Free tier: latest analysis only. Older rows come back as locked stubs —
  // id + date survive so the history list can render upgrade affordances,
  // but scores/summary/profile are stripped server-side.
  const entitlement = await getEntitlementForUserId(req.userId as string);
  if (entitlement.plan === "free") {
    const gated = rows.map((r, i) =>
      i === 0
        ? { ...r, locked: false }
        : {
            id: r.id,
            kind: r.kind,
            nervousSystemLoad: null,
            sessionScore: null,
            styleProfile: null,
            summary: null,
            durationSec: r.durationSec,
            createdAt: r.createdAt,
            scores: null,
            locked: true,
          },
    );
    res.json({ analyses: gated });
    return;
  }
  res.json({ analyses: rows.map((r) => ({ ...r, locked: false })) });
});

router.get("/analysis/:id", async (req, res) => {
  const fighter = await getUserFighter(req);
  if (!fighter) {
    res.status(400).json({ error: "no fighter" });
    return;
  }
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "bad id" });
    return;
  }
  const [row] = await db
    .select()
    .from(videoAnalysesTable)
    .where(eq(videoAnalysesTable.id, id))
    .limit(1);
  if (!row || row.fighterId !== fighter.id) {
    res.status(404).json({ error: "not found" });
    return;
  }

  // Opponent scouting rows are self-contained categorical reads — no session
  // scorecard, no progression trail, no comparison. Return as-is (opponent mode
  // is FRAME+ only, so no free-tier gating applies).
  if (row.subject === "opponent") {
    res.json({ analysis: { ...row, prevSignals: null, signalHistory: [] } });
    return;
  }

  // Free tier: only the most recent analysis is viewable in full.
  const entitlement = await getEntitlementForUserId(req.userId as string);
  const isFreeTier = entitlement.plan === "free";
  if (isFreeTier) {
    const [latest] = await db
      .select({ id: videoAnalysesTable.id })
      .from(videoAnalysesTable)
      .where(
        and(
          eq(videoAnalysesTable.fighterId, fighter.id),
          eq(videoAnalysesTable.subject, "self"),
        ),
      )
      .orderBy(desc(videoAnalysesTable.createdAt))
      .limit(1);
    if (latest && latest.id !== row.id) {
      res.status(402).json({
        error: "Analysis history is a FRAME+ feature. Your latest session stays free.",
        code: "FRAME_PLUS_REQUIRED",
        feature: "analysis_history",
      });
      return;
    }
  }

  // Session-over-session comparison + the signal-history trail are FRAME+
  // features — a free user's latest report must not leak prior-session data.
  if (isFreeTier) {
    res.json({ analysis: { ...row, prevSignals: null, signalHistory: [] } });
    return;
  }

  const compareIdRaw = req.query["compareId"];
  const compareId = typeof compareIdRaw === "string" ? Number(compareIdRaw) : NaN;

  if (Number.isFinite(compareId) && compareId !== id) {
    // User-specified baseline: fetch signals + scores from that specific analysis
    const [compareRow] = await db
      .select({ metrics: videoAnalysesTable.metrics, scores: videoAnalysesTable.scores, fighterId: videoAnalysesTable.fighterId })
      .from(videoAnalysesTable)
      // Comparison baselines are always the athlete's own scored sessions.
      .where(and(eq(videoAnalysesTable.id, compareId), eq(videoAnalysesTable.subject, "self")))
      .limit(1);

    // Security: only allow comparisons within the same fighter's data
    if (!compareRow || compareRow.fighterId !== fighter.id) {
      res.status(404).json({ error: "compare target not found" });
      return;
    }

    const prevSignals =
      compareRow.metrics && Array.isArray(compareRow.metrics.signals) && compareRow.metrics.signals.length
        ? compareRow.metrics.signals
        : null;
    const compareScores =
      Array.isArray(compareRow.scores) && compareRow.scores.length ? compareRow.scores : null;
    const liveComparison = buildComparison(
      Array.isArray(row.scores) ? row.scores : [],
      compareScores,
      "",
    );

    res.json({ analysis: { ...row, prevSignals, liveComparison } });
    return;
  }

  // Default: fetch up to 5 prior sessions for the signal history trail
  const priorRows = await db
    .select({
      id: videoAnalysesTable.id,
      createdAt: videoAnalysesTable.createdAt,
      metrics: videoAnalysesTable.metrics,
    })
    .from(videoAnalysesTable)
    .where(
      and(
        eq(videoAnalysesTable.fighterId, row.fighterId),
        // Self progression trail only — never fold an opponent scout's signals in.
        eq(videoAnalysesTable.subject, "self"),
        lt(videoAnalysesTable.createdAt, row.createdAt),
      ),
    )
    .orderBy(desc(videoAnalysesTable.createdAt))
    .limit(5);

  // Oldest-first for the client trail
  const signalHistory = priorRows
    .slice()
    .reverse()
    .map((r) => ({
      id: r.id,
      createdAt: r.createdAt.toISOString(),
      signals:
        r.metrics && Array.isArray(r.metrics.signals) ? (r.metrics.signals as AnalysisSignal[]) : [],
    }))
    .filter((r) => r.signals.length > 0);

  const prevSignals =
    signalHistory.length > 0 ? (signalHistory[signalHistory.length - 1]?.signals ?? null) : null;

  res.json({ analysis: { ...row, prevSignals, signalHistory } });
});

router.patch("/analysis/:id/notes", async (req, res) => {
  const fighter = await getUserFighter(req);
  if (!fighter) {
    res.status(400).json({ error: "no fighter" });
    return;
  }
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "bad id" });
    return;
  }
  const body = req.body as { notes?: unknown };
  if (typeof body.notes !== "object" || body.notes === null || Array.isArray(body.notes)) {
    res.status(400).json({ error: "notes must be an object" });
    return;
  }
  const raw = body.notes as Record<string, unknown>;
  const sanitised: Record<number, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    const idx = Number(k);
    if (!Number.isFinite(idx) || idx < 0 || idx > 99) continue;
    if (typeof v !== "string") continue;
    sanitised[idx] = v.trim().slice(0, 150);
  }

  const [updated] = await db
    .update(videoAnalysesTable)
    .set({ keyframeNotes: sanitised })
    .where(and(eq(videoAnalysesTable.id, id), eq(videoAnalysesTable.fighterId, fighter.id)))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "not found" });
    return;
  }
  res.json({ analysis: updated });
});

// ---------------------------------------------------------------------------
// POST /analysis/fetch-remote — fetch a pasted video link server-side and stream
// the raw bytes back same-origin. The browser turns the response into a
// Blob→File and runs the EXISTING on-device pose pass — scoring never moves to
// the server. SSRF is the one serious surface (see lib/remoteFetch.ts).
// ---------------------------------------------------------------------------

// Small in-flight cap: yt-dlp + large downloads are heavy, and /tmp is tmpfs
// (RAM) on autoscale. Beyond this we shed load with 429 rather than OOM.
const MAX_INFLIGHT_REMOTE = 2;
let inFlightRemote = 0;

router.post("/analysis/fetch-remote", async (req, res) => {
  // Gate BEFORE any heavy work (yt-dlp / large downloads land in RAM-backed
  // /tmp). Mirrors POST /analysis: the first analysis is a free taster, so a
  // free user with no prior analysis may fetch; after that it's FRAME+.
  const remoteEntitlement = await getEntitlementForUserId(req.userId as string);
  if (remoteEntitlement.plan === "free") {
    const remoteFighter = await getUserFighter(req);
    const [existing] = remoteFighter
      ? await db
          .select({ id: videoAnalysesTable.id })
          .from(videoAnalysesTable)
          .where(
            and(
              eq(videoAnalysesTable.fighterId, remoteFighter.id),
              // Only the athlete's own reads consume the free taster.
              eq(videoAnalysesTable.subject, "self"),
            ),
          )
          .limit(1)
      : [];
    if (existing) {
      res.status(402).json({
        error: "Your free analysis is used. FRAME+ makes video analysis unlimited.",
        code: "FRAME_PLUS_REQUIRED",
        feature: "video_analysis",
      });
      return;
    }
  }

  const raw = typeof (req.body as { url?: unknown })?.url === "string" ? (req.body as { url: string }).url.trim() : "";
  if (!raw) {
    res.status(400).json({ error: "No link provided." });
    return;
  }

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    res.status(422).json({ error: "That doesn't look like a valid link." });
    return;
  }
  if (parsed.protocol !== "https:") {
    res.status(422).json({ error: "Only https links are supported." });
    return;
  }

  if (inFlightRemote >= MAX_INFLIGHT_REMOTE) {
    res.status(429).json({ error: "The server is fetching other clips right now — try again in a moment." });
    return;
  }

  inFlightRemote += 1;
  let released = false;
  const release = () => {
    if (!released) {
      released = true;
      inFlightRemote -= 1;
    }
  };
  res.on("close", release);

  const source = classifySource(parsed);

  try {
    if (source === "youtube") {
      const dl = await downloadYouTube(parsed.toString());
      // If the client aborted during the (up to 90s) download, `res` already
      // fired "close" — a listener registered now would never run, leaking the
      // temp dir (autoscale /tmp is RAM). Clean up immediately in that case.
      if (res.destroyed) {
        await rm(dl.dir, { recursive: true, force: true }).catch(() => {});
        return;
      }
      // Clean the temp dir once the response is done (autoscale /tmp is RAM).
      res.on("close", () => {
        void rm(dl.dir, { recursive: true, force: true }).catch(() => {});
      });
      try {
        const info = await stat(dl.file);
        if (info.size > MAX_REMOTE_BYTES) {
          throw new RemoteFetchError("That clip is too large after download. Try a shorter video.");
        }
        res.setHeader("Content-Type", "video/mp4");
        res.setHeader("Content-Length", String(info.size));
        const stream = createReadStream(dl.file);
        stream.on("error", () => res.destroy());
        stream.pipe(res);
      } catch (err) {
        await rm(dl.dir, { recursive: true, force: true }).catch(() => {});
        throw err;
      }
      return;
    }

    const target = normalizeForFetch(parsed, source);
    if (!target) {
      res.status(422).json({ error: "Couldn't turn that into a direct video link. Paste a direct video URL." });
      return;
    }

    const { res: upstream } = await safeStream(target);
    const contentType = String(upstream.headers["content-type"] ?? "");

    if (!/^video\//i.test(contentType)) {
      upstream.resume(); // drain
      const hint =
        source === "drive"
          ? "Google Drive returned a permission or virus-scan page, not the video. Share the file as 'Anyone with the link' and make sure it isn't too large for a direct download."
          : "That link didn't return a video file. Paste a direct video URL (e.g. ending in .mp4) or a share link.";
      res.status(422).json({ error: hint });
      return;
    }

    const declared = Number(upstream.headers["content-length"] ?? "");
    if (Number.isFinite(declared) && declared > MAX_REMOTE_BYTES) {
      upstream.resume();
      res.status(422).json({ error: "That video is too large. Try a shorter clip (first 75s is analysed anyway)." });
      return;
    }

    res.setHeader("Content-Type", contentType);
    if (Number.isFinite(declared) && declared > 0) res.setHeader("Content-Length", String(declared));

    let bytes = 0;
    upstream.on("data", (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > MAX_REMOTE_BYTES) {
        upstream.destroy();
        res.destroy(); // headers already sent — abort the socket
      }
    });
    upstream.on("error", () => res.destroy());
    upstream.pipe(res);
  } catch (err) {
    if (res.headersSent) {
      res.destroy();
    } else if (err instanceof RemoteFetchError || err instanceof YtDlpError) {
      res.status(422).json({ error: err.message });
    } else {
      req.log.error({ err }, "fetch-remote failed");
      res.status(502).json({ error: "Couldn't fetch that video link." });
    }
  }
});

export default router;
