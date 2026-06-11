import { Router, type IRouter } from "express";
import {
  db,
  videoAnalysesTable,
  type AnalysisKeyframe,
  type AnalysisMetrics,
  type AnalysisSignal,
  type AnalysisScore,
  type DetectedEvent,
  type NervousSystemLoad,
} from "@workspace/db";
import { and, desc, eq, lt } from "drizzle-orm";
import { getUserFighter } from "../middlewares/authMiddleware";
import { getActiveFacts, addFact } from "../lib/factsService";
import {
  generateAnalysis,
  buildComparison,
  isValidKind,
  isValidLoad,
  hasCanonicalScores,
  recomputeSessionScore,
} from "../lib/analysisService";

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

  if (!hasCanonicalScores(scores)) {
    res.status(400).json({ error: "scores must include the four FRAME REPORT attributes" });
    return;
  }

  const focus = typeof body.focus === "string" ? body.focus.slice(0, 280) : "";
  // The headline SESSION SCORE is the composite of the (deterministic, pose-derived) attribute
  // values. Recompute it server-side from the accepted scores so it can't be a fabricated
  // free-floating value — it is always internally consistent with the attributes shown.
  const sessionScore = recomputeSessionScore(scores, fragmentationRisk);
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

    // previous session (for "what changed") — most recent prior analysis with scores + signals
    const [prev] = await db
      .select({ scores: videoAnalysesTable.scores, metrics: videoAnalysesTable.metrics })
      .from(videoAnalysesTable)
      .where(eq(videoAnalysesTable.fighterId, fighter.id))
      .orderBy(desc(videoAnalysesTable.createdAt))
      .limit(1);
    const prevScores =
      prev && Array.isArray(prev.scores) && prev.scores.length ? prev.scores : null;
    const prevSignals =
      prev?.metrics && Array.isArray(prev.metrics.signals) && prev.metrics.signals.length
        ? prev.metrics.signals
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

    const [row] = await db
      .insert(videoAnalysesTable)
      .values({
        fighterId: fighter.id,
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
        durationSec,
      })
      .returning();

    if (row) {
      // Feed the model: each high/medium finding becomes a low-confidence pattern fact
      // sourced to this analysis so it informs future coaching without overweighting.
      for (const f of narrative.findings) {
        if (f.severity === "low") continue;
        await addFact(fighter.id, {
          category: f.severity === "high" ? "weakness" : "pattern",
          topic: `${body.kind}: ${f.title}`.slice(0, 120),
          content: `${f.observation} ${f.nervousSystemFraming}`.trim().slice(0, 600),
          confidence: 2,
          source: `video:${row.id}`,
        }).catch((err) => req.log.error({ err }, "analysis fact write failed"));
      }
    }

    res.json({ analysis: { ...row, prevSignals } });
  } catch (err) {
    req.log.error({ err }, "analysis generation failed");
    res.status(500).json({ error: err instanceof Error ? err.message : "analysis failed" });
  }
});

router.get("/analysis", async (req, res) => {
  const fighter = await getUserFighter(req);
  if (!fighter) {
    res.json({ analyses: [] });
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
    .where(eq(videoAnalysesTable.fighterId, fighter.id))
    .orderBy(desc(videoAnalysesTable.createdAt))
    .limit(20);
  res.json({ analyses: rows });
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

  const compareIdRaw = req.query["compareId"];
  const compareId = typeof compareIdRaw === "string" ? Number(compareIdRaw) : NaN;

  if (Number.isFinite(compareId) && compareId !== id) {
    // User-specified baseline: fetch signals + scores from that specific analysis
    const [compareRow] = await db
      .select({ metrics: videoAnalysesTable.metrics, scores: videoAnalysesTable.scores, fighterId: videoAnalysesTable.fighterId })
      .from(videoAnalysesTable)
      .where(eq(videoAnalysesTable.id, compareId))
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

  // Default: fetch signals from the analysis that immediately preceded this one
  const [prevRow] = await db
    .select({ metrics: videoAnalysesTable.metrics })
    .from(videoAnalysesTable)
    .where(
      and(
        eq(videoAnalysesTable.fighterId, row.fighterId),
        lt(videoAnalysesTable.createdAt, row.createdAt),
      ),
    )
    .orderBy(desc(videoAnalysesTable.createdAt))
    .limit(1);
  const prevSignals =
    prevRow?.metrics && Array.isArray(prevRow.metrics.signals) && prevRow.metrics.signals.length
      ? prevRow.metrics.signals
      : null;

  res.json({ analysis: { ...row, prevSignals } });
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

export default router;
