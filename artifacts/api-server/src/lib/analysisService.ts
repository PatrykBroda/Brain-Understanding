import Anthropic from "@anthropic-ai/sdk";
import {
  ANALYSIS_KINDS,
  ANALYSIS_SUBJECTS,
  NERVOUS_SYSTEM_LOADS,
  type AnalysisKind,
  type AnalysisSubject,
  type NervousSystemLoad,
  type AnalysisFinding,
  type AnalysisMetrics,
  type AnalysisKeyframe,
  type AnalysisScore,
  type StyleParallel,
  type AnalysisComparison,
  type Matchup,
  type MatchupEdge,
  type Fighter,
  type AthleteFact,
  type ReplayMoment,
  type ReplayRole,
  REPLAY_ROLES,
} from "@workspace/db";
import { ONTOLOGY_KEYS, isOntologyKey } from "@workspace/ontology";
import { COACH_SYSTEM_PROMPT_STATIC, buildDynamicContext } from "./synochi";

let _anthropic: Anthropic | null = null;
function getAnthropic(): Anthropic {
  if (_anthropic) return _anthropic;
  const baseURL = process.env["AI_INTEGRATIONS_ANTHROPIC_BASE_URL"];
  const apiKey = process.env["AI_INTEGRATIONS_ANTHROPIC_API_KEY"];
  if (!baseURL || !apiKey) {
    throw new Error("analysis: AI_INTEGRATIONS_ANTHROPIC_* env not set");
  }
  _anthropic = new Anthropic({ baseURL, apiKey });
  return _anthropic;
}

const CLAUDE_IMAGE_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

const ANALYSIS_INSTRUCTIONS = `You are FRAME reviewing footage of the athlete. The browser already ran pose tracking on the clip and computed real movement signals AND a set of 0-100 attribute scores (below). You are NOT guessing — every observation must tie back to a computed signal, a computed score, or something visible in the supplied key frames.

CONTENT VALIDATION — MANDATORY FIRST STEP:
Before writing anything else, look at the key frames. Ask: does this footage show a person performing combat sports training? Valid content includes: BJJ, MMA, boxing, Muay Thai, kickboxing, wrestling, judo, sparring, padwork, shadowboxing, drilling, clinchwork, bag work. If the footage clearly shows something else — dancing, general fitness, yoga, stretching without a partner/bag/pads, everyday activity, or no person at all — set contentValid=false. When contentValid=false, write a 1-sentence factual description in summary of what you actually see, leave all other narrative fields empty or minimal, and do not attempt a performance read. The pose signals are meaningless outside a combat sports context and fabricating a read would violate FRAME's honesty contract.

This is a nervous-system reading shaped into a shareable performance breakdown — think tactical fight-analysis, not a gym app. The signature move: take a mechanical observation (guard drops, shoulders rise, balance drifts, output comes in frantic bursts then stalls) and FRAME it as nervous-system behaviour — what the body is doing under load, what it's bracing for or leaking.

You are given the athlete's computed numbers. DO NOT invent or change any number. Your job is the WORDS around them.

HARD RULES:
- The scores, nervousSystemLoad, fragmentationRisk and sessionScore are ALREADY FIXED below. Never output numbers — narrate around them. If you reference a number, use the one given.
- styleProfile: a short, evocative fighting-identity label grounded in the scores (e.g. "Pressure Counter Striker", "Patient Trapper", "Chaos Brawler"). 2-4 words. Must fit what the numbers actually say.
- styleParallels: 1-2 KNOWN fighters whose tendencies this resembles. GROUNDED and HEDGED — never "you ARE X". Each note explains the SPECIFIC resemblance ("your entry timing and stance-switching resembles early McGregor — not identical, but the way you freeze before committing is similar"). Credibility over flattery. If nothing fits, return an empty list.
- aiComment: ONE or TWO sentences of dry, human personality. Observational, lightly wry, never meme-y, never hype. e.g. "You fight like someone who enjoys chaos slightly too much — but people are starting to react to your feints instead of your power." No emojis.
- findings: 3 to 5. Each = a concrete mechanical observation + its nervous-system framing. Order by what matters most. severity low|medium|high, honest. area = short tag ("guard","stance","shoulders","transitions","pacing").
- If a finding is NEW EVIDENCE for one of the athlete's existing recorded observations (listed with ids in the athlete context), set matchesFactId to that id. Only when it is the SAME observation seen again — not merely the same body part or topic. Otherwise omit it.
- For findings without a match, set subcategory to the fitting ontology key when one clearly applies; omit otherwise.
- summary: 2-4 sentences. The through-line of this clip as one nervous-system story. Direct, structural, FRAME's voice. No padding, no emojis.
- If a focus was requested, weight the whole read toward it.
- comparisonNote: ONLY if previous-session deltas are provided below — 1-2 sentences on what changed and what it means ("you're less reactive under pressure than last upload; still overcommitting after combinations"). Omit if no prior session.
- reviewQuestion: ONE short, specific question about THIS session that draws out context the pose cannot see — intent, gameplan, how it felt, whether something was deliberate, who they were working against. Grounded in a finding or the athlete's recorded model, phrased as a coach reviewing film beside them. One sentence. No preamble, no "let me ask you", no numbers. Leave it empty ("") if there is nothing grounded worth asking.
- replay: the "# Key moments" list below enumerates the REAL detected moments in this clip, each with an index. Pick up to THREE of them and cast each as one of these roles: best_decision, worst_habit, biggest_opportunity. Reference the moment ONLY by its keyframeIndex from that list — never invent a moment or a time. Each replay entry needs a one-sentence grounded note explaining what the body did at that moment and why it earns that role. Use at most one entry per role. Do NOT restate the timestamp or any number in the note — the interface shows the real time. Omit any role you cannot ground in a listed moment; if no moments are listed, return an empty replay list.
- Voice: calm, observant, precise. A mirror, not a hype machine. No motivational filler.`;

const REPORT_TOOL: Anthropic.Tool = {
  name: "emit_analysis",
  description:
    "Emit the structured nervous-system performance read of the clip. Every word must tie to a computed score/signal or a visible key frame. Never output numbers.",
  input_schema: {
    type: "object" as const,
    properties: {
      styleProfile: { type: "string" },
      styleParallels: {
        type: "array",
        items: {
          type: "object",
          properties: { name: { type: "string" }, note: { type: "string" } },
          required: ["name", "note"],
        },
      },
      aiComment: { type: "string" },
      summary: { type: "string" },
      findings: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: { type: "string" },
            observation: { type: "string" },
            nervousSystemFraming: { type: "string" },
            severity: { type: "string", enum: ["low", "medium", "high"] },
            area: { type: "string" },
            matchesFactId: {
              type: "integer",
              description:
                "id of an EXISTING recorded observation this finding is new evidence for (same observation seen again). Omit if none.",
            },
            subcategory: {
              type: "string",
              enum: [...ONTOLOGY_KEYS],
              description: "Ontology key for a NEW observation when one clearly fits. Omit otherwise.",
            },
          },
          required: ["title", "observation", "nervousSystemFraming", "severity", "area"],
        },
      },
      comparisonNote: { type: "string" },
      reviewQuestion: {
        type: "string",
        description:
          "ONE short grounded follow-up question about this session (context the pose can't see). No numbers. Empty string if nothing grounded to ask.",
      },
      replay: {
        type: "array",
        description:
          "Up to 3 curated film-review moments. Reference real moments by keyframeIndex from the '# Key moments' list; never invent a time. At most one per role.",
        items: {
          type: "object",
          properties: {
            role: { type: "string", enum: [...REPLAY_ROLES] },
            keyframeIndex: {
              type: "integer",
              description: "Index of the moment from the '# Key moments' list.",
            },
            note: {
              type: "string",
              description: "One grounded sentence — what the body did. No numbers or timestamps.",
            },
          },
          required: ["role", "keyframeIndex", "note"],
        },
      },
      contentValid: {
        type: "boolean",
        description: "true if the footage shows combat sports training, false otherwise",
      },
    },
    required: ["contentValid", "styleProfile", "aiComment", "summary", "findings"],
  },
};

export const REPLAY_ROLE_LABELS: Record<ReplayRole, string> = {
  best_decision: "Best decision",
  worst_habit: "Worst habit",
  biggest_opportunity: "Biggest opportunity",
};

// The AI's raw, unvalidated replay reference (a keyframe index + role + note).
// buildReplayMoments turns these into ReplayMoments whose timestamps come only
// from real stored keyframes — the AI never emits a timestamp.
export type ReplayRef = { role: ReplayRole; keyframeIndex: number; note: string };

/**
 * Resolve AI replay references against the REAL sanitised keyframes. The
 * timestamp is copied from keyframes[keyframeIndex].timestamp so it always
 * points at a genuine detected moment. Drops out-of-range indices, keeps the
 * first entry per role AND per keyframe, caps at 3. Pure — unit-tested.
 */
export function buildReplayMoments(
  refs: ReplayRef[],
  keyframes: AnalysisKeyframe[],
): ReplayMoment[] {
  const out: ReplayMoment[] = [];
  const usedRoles = new Set<ReplayRole>();
  const usedIndices = new Set<number>();
  for (const ref of refs) {
    if (out.length >= 3) break;
    // A moment with no note is just a labelled frame with no insight — drop it
    // (without consuming the role/index slot) so a later valid ref can take it.
    if (!ref.note || !ref.note.trim()) continue;
    if (usedRoles.has(ref.role) || usedIndices.has(ref.keyframeIndex)) continue;
    const kf = keyframes[ref.keyframeIndex];
    if (!kf) continue;
    usedRoles.add(ref.role);
    usedIndices.add(ref.keyframeIndex);
    out.push({
      role: ref.role,
      timestamp: kf.timestamp,
      label: REPLAY_ROLE_LABELS[ref.role],
      note: ref.note,
    });
  }
  return out;
}

// Brand hard-rule: no emojis in coach output. Strip pictographic codepoints defensively.
const EMOJI_RE =
  /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}\u{FE00}-\u{FE0F}\u{200D}]/gu;

export function stripEmoji(s: string): string {
  return s.replace(EMOJI_RE, "").replace(/[ \t]{2,}/g, " ").trim();
}

function asStr(v: unknown, max: number): string {
  return (typeof v === "string" ? stripEmoji(v) : "").slice(0, max);
}

export type AnalysisNarrative = {
  styleProfile: string;
  styleParallels: StyleParallel[];
  aiComment: string;
  summary: string;
  findings: AnalysisFinding[];
  comparisonNote: string;
  reviewQuestion: string;
  // Raw AI references — the route resolves these against the real keyframes.
  replay: ReplayRef[];
};

export class ContentValidationError extends Error {
  constructor(description: string) {
    super(description || "FRAME REPORT requires combat sports footage.");
    this.name = "ContentValidationError";
  }
}

function normalise(raw: Record<string, unknown>): AnalysisNarrative {
  if (raw["contentValid"] === false) {
    const desc = typeof raw["summary"] === "string" && raw["summary"]
      ? raw["summary"]
      : "The footage does not appear to show combat sports training.";
    throw new ContentValidationError(desc);
  }
  const findings: AnalysisFinding[] = [];
  if (Array.isArray(raw["findings"])) {
    for (const f of (raw["findings"] as unknown[]).slice(0, 5)) {
      const it = f as Record<string, unknown>;
      const title = asStr(it["title"], 120);
      const observation = asStr(it["observation"], 600);
      if (!title || !observation) continue;
      const sevRaw = typeof it["severity"] === "string" ? it["severity"] : "medium";
      const severity = (["low", "medium", "high"].includes(sevRaw) ? sevRaw : "medium") as
        | "low"
        | "medium"
        | "high";
      const finding: AnalysisFinding = {
        title,
        observation,
        nervousSystemFraming: asStr(it["nervousSystemFraming"], 600),
        severity,
        area: asStr(it["area"], 40) || "general",
      };
      // AI-proposed merge target — the route validates it belongs to this
      // fighter and is active before anything is written.
      const matchId = it["matchesFactId"];
      if (typeof matchId === "number" && Number.isInteger(matchId) && matchId > 0) {
        finding.matchesFactId = matchId;
      }
      const sub = it["subcategory"];
      if (typeof sub === "string" && isOntologyKey(sub)) {
        finding.subcategory = sub;
      }
      findings.push(finding);
    }
  }

  const styleParallels: StyleParallel[] = [];
  if (Array.isArray(raw["styleParallels"])) {
    for (const p of (raw["styleParallels"] as unknown[]).slice(0, 2)) {
      const it = p as Record<string, unknown>;
      const name = asStr(it["name"], 60);
      if (!name) continue;
      styleParallels.push({ name, note: asStr(it["note"], 240) });
    }
  }

  const validRoles = new Set<string>(REPLAY_ROLES);
  const replay: ReplayRef[] = [];
  if (Array.isArray(raw["replay"])) {
    for (const r of (raw["replay"] as unknown[]).slice(0, 6)) {
      const it = r as Record<string, unknown>;
      const role = typeof it["role"] === "string" ? it["role"] : "";
      const idx = it["keyframeIndex"];
      const note = asStr(it["note"], 200);
      if (!validRoles.has(role) || typeof idx !== "number" || !Number.isInteger(idx) || idx < 0) {
        continue;
      }
      replay.push({ role: role as ReplayRole, keyframeIndex: idx, note });
    }
  }

  return {
    styleProfile: asStr(raw["styleProfile"], 48),
    styleParallels,
    aiComment: asStr(raw["aiComment"], 320),
    summary: asStr(raw["summary"], 800),
    findings,
    comparisonNote: asStr(raw["comparisonNote"], 320),
    reviewQuestion: asStr(raw["reviewQuestion"], 240),
    replay,
  };
}

function metricsText(args: {
  kind: AnalysisKind;
  focus: string;
  load: NervousSystemLoad;
  fragmentationRisk: NervousSystemLoad;
  sessionScore: number;
  scores: AnalysisScore[];
  metrics: AnalysisMetrics;
  prevScores: AnalysisScore[] | null;
  keyframes: AnalysisKeyframe[];
}): string {
  const { kind, focus, load, fragmentationRisk, sessionScore, scores, metrics, prevScores, keyframes } =
    args;
  const sig = metrics.signals.map((s) => `- ${s.label}: ${s.value} — ${s.detail}`);
  const sc = scores.map((s) => `- ${s.label}: ${s.value}/100 — ${s.basis}`);
  const parts = [
    `# Clip`,
    `kind: ${kind}`,
    focus ? `athlete asked to focus on: ${focus}` : `no specific focus requested`,
    `duration analysed: ${metrics.durationSec.toFixed(1)}s`,
    `frames sampled: ${metrics.framesAnalysed}, frames with a clear pose lock: ${metrics.poseFrames}`,
    ``,
    `# FIXED numbers (DO NOT OVERRIDE, DO NOT EMIT)`,
    `nervous-system load: ${load.toUpperCase()}`,
    `fragmentation risk: ${fragmentationRisk.toUpperCase()}`,
    `session score: ${sessionScore}/100`,
    `load basis: ${metrics.loadBasis}`,
    ``,
    `# Computed 0-100 attributes (FIXED)`,
    ...sc,
    ``,
    `# Computed movement signals`,
    ...sig,
  ];

  if (prevScores && prevScores.length) {
    const prevByKey = new Map(prevScores.map((s) => [s.key, s.value]));
    const deltaLines = scores
      .map((s) => {
        const p = prevByKey.get(s.key);
        if (p == null) return null;
        const d = s.value - p;
        const sign = d > 0 ? `+${d}` : `${d}`;
        return `- ${s.label}: ${sign} vs last session (${p} -> ${s.value})`;
      })
      .filter((x): x is string => x != null);
    if (deltaLines.length) {
      parts.push(``, `# Change vs previous session`, ...deltaLines);
    }
  }

  // Enumerate EVERY real detected keyframe by index so the AI can cite genuine
  // moments for FRAME Replay. Only the first few carry images (below), but the
  // AI may reference any listed index — the timestamp is resolved server-side.
  if (keyframes.length) {
    const kfLines = keyframes.map((kf, i) => {
      const evt = kf.eventType ? ` [${kf.eventType}]` : "";
      const img = i < 4 ? " (image supplied)" : "";
      return `- index ${i}: @ ${kf.timestamp.toFixed(1)}s${evt} — ${kf.caption}${img}`;
    });
    parts.push(
      ``,
      `# Key moments (reference by index for replay)`,
      ...kfLines,
    );
  }

  return parts.join("\n");
}

export function isValidKind(k: unknown): k is AnalysisKind {
  return typeof k === "string" && (ANALYSIS_KINDS as readonly string[]).includes(k);
}

export function isValidLoad(l: unknown): l is NervousSystemLoad {
  return typeof l === "string" && (NERVOUS_SYSTEM_LOADS as readonly string[]).includes(l);
}

// The FRAME REPORT contract: exactly these four attributes, always. The per-attribute
// values are necessarily computed on-device (pose runs in the browser), but the server
// enforces the schema so a tampered payload can't introduce fabricated attributes.
export const CANONICAL_SCORE_KEYS = [
  "aggression",
  "composure",
  "reaction_speed",
  "defensive_recovery",
] as const;

export function hasCanonicalScores(scores: AnalysisScore[]): boolean {
  const keys = new Set(scores.map((s) => s.key));
  return CANONICAL_SCORE_KEYS.every((k) => keys.has(k));
}

// Recompute the composite SESSION SCORE server-side from the (canonical) attribute values,
// ignoring whatever the client sent. This is the headline number on the share card, so it
// must be internally consistent with the attributes — never a free-floating client value.
// Mirrors the client weighting in analysis-metrics.ts.
export function recomputeSessionScore(
  scores: AnalysisScore[],
  fragmentationRisk: NervousSystemLoad,
): number {
  const byKey = new Map(scores.map((s) => [s.key, s.value]));
  const composure = byKey.get("composure") ?? 50;
  const recovery = byKey.get("defensive_recovery") ?? 50;
  const reaction = byKey.get("reaction_speed") ?? 50;
  const aggression = byKey.get("aggression") ?? 50;
  const fragPenalty = { low: 0, moderate: 8, elevated: 16, high: 26 }[fragmentationRisk];
  return Math.max(
    0,
    Math.min(
      100,
      Math.round(composure * 0.34 + recovery * 0.26 + reaction * 0.2 + aggression * 0.2 - fragPenalty),
    ),
  );
}

// ---- Camp review: cross-analysis intelligence, real evidence only ----
//
// Everything below is derived deterministically from the camp's OWN analyses.
// No aggregate score is invented: the "biggest improvement" is two real recorded
// endpoint values (first vs last analysis in the camp) and the dates they were
// measured; the "most persistent leak" is a real count of how many of the camp's
// sessions flagged the same area at medium/high severity. Honest nulls when there
// isn't enough evidence (one honesty pillar applied to the camp summary itself).

// The slim analysis shape the review needs — the route selects only these columns
// (never keyframes: those are huge base64 blobs).
export type CampReviewAnalysis = {
  id: number;
  kind: AnalysisKind;
  scores: AnalysisScore[];
  findings: AnalysisFinding[];
  createdAt: Date | string;
};

export type CampReviewImprovement = {
  key: string;
  label: string;
  from: number; // earliest recorded value in the camp
  to: number; // latest recorded value in the camp
  delta: number; // to - from (always > 0 when present)
  fromAt: string; // ISO date of the earliest analysis compared
  toAt: string; // ISO date of the latest analysis compared
};

export type CampReviewLeak = {
  area: string; // normalized area tag (e.g. "guard")
  label: string; // representative finding title (most recent occurrence)
  sessions: number; // how many camp analyses flagged this area at med/high
  total: number; // total analyses in the camp
};

export type CampReview = {
  totalAnalyses: number;
  countsByKind: { kind: AnalysisKind; label: string; count: number }[];
  biggestImprovement: CampReviewImprovement | null;
  mostPersistentLeak: CampReviewLeak | null;
  spanFrom: string | null; // ISO date of the first analysis in the camp
  spanTo: string | null; // ISO date of the most recent analysis in the camp
};

function kindLabel(kind: string): string {
  return kind ? kind.charAt(0).toUpperCase() + kind.slice(1) : kind;
}

function toMs(v: Date | string): number {
  return v instanceof Date ? v.getTime() : new Date(v).getTime();
}

function toIso(v: Date | string): string {
  return v instanceof Date ? v.toISOString() : new Date(v).toISOString();
}

/**
 * Summarise a camp from its own analyses. Pure — unit-tested. Every field is
 * grounded in real records; there is no fabricated aggregate. Callers pass the
 * camp's analyses in any order.
 */
export function buildCampReview(analyses: CampReviewAnalysis[]): CampReview {
  const sorted = analyses.slice().sort((a, b) => toMs(a.createdAt) - toMs(b.createdAt));
  const total = sorted.length;

  // Counts by kind — ordered by the canonical ANALYSIS_KINDS, only kinds present.
  const kindCounts = new Map<AnalysisKind, number>();
  for (const a of sorted) kindCounts.set(a.kind, (kindCounts.get(a.kind) ?? 0) + 1);
  const countsByKind = (ANALYSIS_KINDS as readonly AnalysisKind[])
    .filter((k) => kindCounts.has(k))
    .map((k) => ({ kind: k, label: kindLabel(k), count: kindCounts.get(k) as number }));

  const spanFrom = total ? toIso(sorted[0]!.createdAt) : null;
  const spanTo = total ? toIso(sorted[total - 1]!.createdAt) : null;

  // Biggest improvement: earliest-with-scores vs latest-with-scores. First and
  // last are two REAL recorded values shown verbatim — never an average that
  // exists in no record. Needs >=2 scored analyses and a positive delta.
  let biggestImprovement: CampReviewImprovement | null = null;
  const scored = sorted.filter((a) => hasCanonicalScores(a.scores));
  if (scored.length >= 2) {
    const first = scored[0]!;
    const last = scored[scored.length - 1]!;
    const firstByKey = new Map(first.scores.map((s) => [s.key, s]));
    const lastByKey = new Map(last.scores.map((s) => [s.key, s]));
    for (const key of CANONICAL_SCORE_KEYS) {
      const f = firstByKey.get(key);
      const l = lastByKey.get(key);
      if (!f || !l) continue;
      const delta = l.value - f.value;
      // Strict > keeps the first canonical key on ties — deterministic.
      if (delta > 0 && (!biggestImprovement || delta > biggestImprovement.delta)) {
        biggestImprovement = {
          key,
          label: l.label,
          from: f.value,
          to: l.value,
          delta,
          fromAt: toIso(first.createdAt),
          toAt: toIso(last.createdAt),
        };
      }
    }
  }

  // Most persistent leak: how many DISTINCT camp sessions flagged the same area
  // at medium/high severity. One analysis counts an area at most once. The
  // "general" fallback area is meaningless as a leak, so it is excluded.
  const areaSessions = new Map<string, number>();
  const areaLabel = new Map<string, string>();
  for (const a of sorted) {
    const seen = new Set<string>();
    for (const f of a.findings) {
      if (f.severity !== "medium" && f.severity !== "high") continue;
      const area = (f.area || "").trim().toLowerCase();
      if (!area || area === "general") continue;
      if (!seen.has(area)) {
        seen.add(area);
        areaSessions.set(area, (areaSessions.get(area) ?? 0) + 1);
      }
      // sorted ascending, so the last write is the most recent finding title.
      if (f.title) areaLabel.set(area, f.title);
    }
  }
  let mostPersistentLeak: CampReviewLeak | null = null;
  for (const [area, sessions] of areaSessions) {
    if (sessions < 2) continue; // persistent = recurred across >=2 sessions
    if (!mostPersistentLeak || sessions > mostPersistentLeak.sessions) {
      mostPersistentLeak = { area, label: areaLabel.get(area) ?? area, sessions, total };
    }
  }

  return {
    totalAnalyses: total,
    countsByKind,
    biggestImprovement,
    mostPersistentLeak,
    spanFrom,
    spanTo,
  };
}

export function buildComparison(
  scores: AnalysisScore[],
  prevScores: AnalysisScore[] | null,
  note: string,
): AnalysisComparison | null {
  if (!prevScores || !prevScores.length) return null;
  const prevByKey = new Map(prevScores.map((s) => [s.key, s.value]));
  const deltas = scores
    .map((s) => {
      const p = prevByKey.get(s.key);
      if (p == null) return null;
      return { key: s.key, label: s.label, delta: s.value - p };
    })
    .filter((x): x is { key: string; label: string; delta: number } => x != null);
  if (!deltas.length) return null;
  return { deltas, note };
}

export async function generateAnalysis(args: {
  fighter: Fighter;
  facts: AthleteFact[];
  kind: AnalysisKind;
  focus: string;
  load: NervousSystemLoad;
  fragmentationRisk: NervousSystemLoad;
  sessionScore: number;
  scores: AnalysisScore[];
  prevScores: AnalysisScore[] | null;
  metrics: AnalysisMetrics;
  keyframes: AnalysisKeyframe[];
}): Promise<AnalysisNarrative> {
  const { fighter, facts, kind, focus, load, fragmentationRisk, sessionScore, scores, prevScores, metrics, keyframes } =
    args;

  const dynamic =
    buildDynamicContext(fighter, facts, [], []) +
    "\n\n" +
    ANALYSIS_INSTRUCTIONS +
    "\n\n" +
    metricsText({ kind, focus, load, fragmentationRisk, sessionScore, scores, metrics, prevScores, keyframes });

  const content: Anthropic.ContentBlockParam[] = [];
  for (const kf of keyframes.slice(0, 4)) {
    const parsed = parseDataUrl(kf.imageBase64);
    if (parsed && CLAUDE_IMAGE_MIME.has(parsed.mediaType)) {
      content.push({
        type: "image",
        source: {
          type: "base64",
          media_type: parsed.mediaType as "image/jpeg" | "image/png" | "image/webp",
          data: parsed.data,
        },
      });
      content.push({ type: "text", text: `key frame @ ${kf.timestamp.toFixed(1)}s — ${kf.caption}` });
    }
  }
  content.push({
    type: "text",
    text: "Read this clip now. Use the emit_analysis tool. All numbers above are fixed — do not emit numbers, only the words around them.",
  });

  const resp = await getAnthropic().messages.create(
    {
      model: "claude-sonnet-4-6",
      max_tokens: 2200,
      system: [
        { type: "text", text: COACH_SYSTEM_PROMPT_STATIC, cache_control: { type: "ephemeral" } },
        { type: "text", text: dynamic },
      ],
      tools: [REPORT_TOOL],
      tool_choice: { type: "tool", name: "emit_analysis" },
      messages: [{ role: "user", content }],
    },
    // Bound the AI round-trip so a hung upstream call fails fast with a clear
    // error instead of holding the request open until the client gives up.
    // maxRetries:0 — a retry on a slow/rate-limited call (e.g. under concurrent
    // load) silently doubled latency toward ~150s, blowing past the client's
    // request window and leaving the user on an endless spinner. A single 55s
    // attempt surfaces a genuine timeout as a clean 500 the client renders,
    // instead of a request that outlives the caller and hangs. If cold-cache
    // calls (full vault prompt uncached) start tripping this, the durable fix is
    // a slim analysis-only system prompt, not a longer timeout.
    { timeout: 55_000, maxRetries: 0 },
  );

  for (const block of resp.content) {
    if (block.type === "tool_use" && block.name === "emit_analysis") {
      const out = normalise(block.input as Record<string, unknown>);
      if (out.findings.length > 0 && out.summary && out.styleProfile) return out;
      throw new Error("analysis returned incomplete narrative");
    }
  }
  throw new Error("analysis: claude returned no tool_use");
}

// ---- Opponent Mode: scouting read + matchup (categorical only) ----
//
// An opponent upload runs the SAME on-device pose pass, but the read is
// deliberately categorical: NO 0-100 scorecard, no composite session score. The
// opponent's tendencies are the deterministic movement signals (each with a real
// basis) plus the AI's grounded narrative. The matchup contrasts the athlete's
// RECORDED model against those tendencies. Opponent reads never write athlete_facts.

export function isValidSubject(s: unknown): s is AnalysisSubject {
  return typeof s === "string" && (ANALYSIS_SUBJECTS as readonly string[]).includes(s);
}

// The matchup is only honest when there's enough real evidence on BOTH sides: the
// athlete needs a recorded model to contrast against, and the opponent clip needs
// enough tracked movement to describe. Below either floor we return null and the
// UI shows an honest empty state instead of a fabricated read.
export const MIN_FACTS_FOR_MATCHUP = 3;
export const MIN_SIGNALS_FOR_MATCHUP = 2;

export type OpponentNarrative = {
  styleProfile: string;
  styleParallels: StyleParallel[];
  summary: string;
  // The opponent's exploitable habits (= the athlete's openings). Describes the
  // OPPONENT, never the athlete, and never feeds athlete_facts.
  findings: AnalysisFinding[];
  matchup: Matchup;
};

const OPPONENT_INSTRUCTIONS = `You are FRAME scouting an OPPONENT from footage the athlete uploaded. The browser ran pose tracking and computed real categorical movement signals (below). This is a SCOUTING read, not the athlete's own report — you are describing someone the athlete may have to face.

CONTENT VALIDATION — MANDATORY FIRST STEP:
Look at the key frames. Does the footage show a person performing combat sports (BJJ, MMA, boxing, Muay Thai, kickboxing, wrestling, judo, sparring, padwork, shadowboxing, drilling, clinchwork, bag work)? If it clearly shows something else — dancing, general fitness, yoga, everyday activity, or no person at all — set contentValid=false, write a 1-sentence factual description of what you actually see in summary, and do not attempt a read.

HARD RULES — this is a categorical scouting read:
- NEVER output numbers, scores, percentages or ratings of any kind. No "70% aggressive", no "/100". Describe tendencies in words only, grounded in the computed signals and what is visible in the key frames.
- Every claim about the opponent must tie back to a computed movement signal or a visible key frame. If the footage is thin, say so and hedge — do not invent tendencies.
- styleProfile: a short scouting label for how this opponent fights (e.g. "Pressure Forward Pusher", "Reactive Counter Fighter", "Stalling Grappler"). 2-4 words, must fit the signals.
- styleParallels: 0-2 KNOWN fighters this opponent's tendencies resemble. GROUNDED and HEDGED, never "they ARE X". Empty list if nothing fits.
- summary: 2-4 sentences — the opponent's fighting shape as one read. FRAME's voice, direct, structural, no hype, no emojis.
- findings: 2-4 of the opponent's EXPLOITABLE HABITS. Each = a concrete mechanical tendency (observation) + why it is an opening the athlete can attack (nervousSystemFraming). severity = how reliably exploitable (low|medium|high). area = short tag ("guard","pressure","base","pace","exits"). These describe the OPPONENT, not the athlete.
- matchup: contrast the athlete's OWN recorded model (their strengths, weaknesses, patterns — listed in the athlete context above) against this opponent's tendencies:
    - advantage: the athlete's single biggest edge in this matchup — title (a few words) + note (1-2 sentences on why, tied to a REAL recorded strength of the athlete AND a real opponent tendency).
    - risk: the athlete's single biggest danger — title + note (1-2 sentences, tied to a REAL recorded weakness of the athlete AND a real opponent tendency).
    - notes: 0-3 short tactical lines, each grounded.
  If the athlete's recorded model is too thin to contrast honestly, leave the matchup fields empty — never fabricate a matchup.
- Voice: calm, precise, tactical. A scout, not a hype machine. No motivational filler, no emojis.`;

const OPPONENT_REPORT_TOOL: Anthropic.Tool = {
  name: "emit_opponent_read",
  description:
    "Emit the structured categorical scouting read of the opponent plus a grounded matchup vs the athlete's recorded model. Never output numbers or scores.",
  input_schema: {
    type: "object" as const,
    properties: {
      styleProfile: { type: "string" },
      styleParallels: {
        type: "array",
        items: {
          type: "object",
          properties: { name: { type: "string" }, note: { type: "string" } },
          required: ["name", "note"],
        },
      },
      summary: { type: "string" },
      findings: {
        type: "array",
        description: "2-4 of the OPPONENT's exploitable habits (the athlete's openings).",
        items: {
          type: "object",
          properties: {
            title: { type: "string" },
            observation: { type: "string" },
            nervousSystemFraming: {
              type: "string",
              description: "Why this tendency is an opening the athlete can attack.",
            },
            severity: { type: "string", enum: ["low", "medium", "high"] },
            area: { type: "string" },
          },
          required: ["title", "observation", "severity", "area"],
        },
      },
      matchup: {
        type: "object",
        description:
          "Grounded contrast of the athlete's recorded model vs this opponent. Omit entirely if the athlete's model is too thin to call honestly.",
        properties: {
          advantage: {
            type: "object",
            properties: { title: { type: "string" }, note: { type: "string" } },
            required: ["title", "note"],
          },
          risk: {
            type: "object",
            properties: { title: { type: "string" }, note: { type: "string" } },
            required: ["title", "note"],
          },
          notes: { type: "array", items: { type: "string" } },
        },
      },
      contentValid: {
        type: "boolean",
        description: "true if the footage shows combat sports, false otherwise",
      },
    },
    required: ["contentValid", "styleProfile", "summary", "findings"],
  },
};

function normaliseMatchup(raw: unknown): Matchup {
  if (!raw || typeof raw !== "object") return null;
  const m = raw as Record<string, unknown>;
  const edge = (v: unknown): MatchupEdge | null => {
    if (!v || typeof v !== "object") return null;
    const e = v as Record<string, unknown>;
    const title = asStr(e["title"], 80);
    const note = asStr(e["note"], 400);
    if (!title || !note) return null;
    return { title, note };
  };
  const advantage = edge(m["advantage"]);
  const risk = edge(m["risk"]);
  // A one-sided matchup (only an edge or only a risk) reads as spin. Require both.
  if (!advantage || !risk) return null;
  const notes: string[] = [];
  if (Array.isArray(m["notes"])) {
    for (const n of (m["notes"] as unknown[]).slice(0, 3)) {
      const s = asStr(n, 240);
      if (s) notes.push(s);
    }
  }
  return { advantage, risk, notes };
}

function normaliseOpponent(raw: Record<string, unknown>): OpponentNarrative {
  if (raw["contentValid"] === false) {
    const desc =
      typeof raw["summary"] === "string" && raw["summary"]
        ? raw["summary"]
        : "The footage does not appear to show combat sports.";
    throw new ContentValidationError(desc);
  }
  const findings: AnalysisFinding[] = [];
  if (Array.isArray(raw["findings"])) {
    for (const f of (raw["findings"] as unknown[]).slice(0, 4)) {
      const it = f as Record<string, unknown>;
      const title = asStr(it["title"], 120);
      const observation = asStr(it["observation"], 600);
      if (!title || !observation) continue;
      const sevRaw = typeof it["severity"] === "string" ? it["severity"] : "medium";
      const severity = (["low", "medium", "high"].includes(sevRaw) ? sevRaw : "medium") as
        | "low"
        | "medium"
        | "high";
      findings.push({
        title,
        observation,
        nervousSystemFraming: asStr(it["nervousSystemFraming"], 600),
        severity,
        area: asStr(it["area"], 40) || "general",
      });
    }
  }

  const styleParallels: StyleParallel[] = [];
  if (Array.isArray(raw["styleParallels"])) {
    for (const p of (raw["styleParallels"] as unknown[]).slice(0, 2)) {
      const it = p as Record<string, unknown>;
      const name = asStr(it["name"], 60);
      if (!name) continue;
      styleParallels.push({ name, note: asStr(it["note"], 240) });
    }
  }

  return {
    styleProfile: asStr(raw["styleProfile"], 48),
    styleParallels,
    summary: asStr(raw["summary"], 800),
    findings,
    matchup: normaliseMatchup(raw["matchup"]),
  };
}

// Deterministic honesty gate — the matchup is only kept when there's enough real
// evidence on both sides. The AI may emit a matchup, but if the athlete's model or
// the opponent read is too thin, we drop it (never fabricate a contrast). Pure.
export function gateMatchup(
  matchup: Matchup,
  athleteFactCount: number,
  opponentSignalCount: number,
): Matchup {
  if (!matchup) return null;
  if (athleteFactCount < MIN_FACTS_FOR_MATCHUP) return null;
  if (opponentSignalCount < MIN_SIGNALS_FOR_MATCHUP) return null;
  return matchup;
}

function opponentMetricsText(args: {
  kind: AnalysisKind;
  focus: string;
  opponentName: string;
  load: NervousSystemLoad;
  metrics: AnalysisMetrics;
  keyframes: AnalysisKeyframe[];
}): string {
  const { kind, focus, opponentName, load, metrics, keyframes } = args;
  const sig = metrics.signals.map((s) => `- ${s.label}: ${s.value} — ${s.detail}`);
  const parts = [
    `# Opponent clip`,
    opponentName ? `opponent: ${opponentName}` : `opponent: (unnamed)`,
    `kind: ${kind}`,
    focus ? `athlete asked to focus the scout on: ${focus}` : `no specific focus requested`,
    `duration analysed: ${metrics.durationSec.toFixed(1)}s`,
    `frames sampled: ${metrics.framesAnalysed}, frames with a clear pose lock: ${metrics.poseFrames}`,
    ``,
    `# Opponent nervous-system read (categorical — describe in words, NEVER as a number)`,
    `load: ${load.toUpperCase()}`,
    `basis: ${metrics.loadBasis}`,
    ``,
    `# Opponent movement signals (the real detected tendencies — ground every claim here)`,
    ...sig,
  ];
  if (keyframes.length) {
    const kfLines = keyframes.map((kf, i) => {
      const evt = kf.eventType ? ` [${kf.eventType}]` : "";
      const img = i < 4 ? " (image supplied)" : "";
      return `- index ${i}: @ ${kf.timestamp.toFixed(1)}s${evt} — ${kf.caption}${img}`;
    });
    parts.push(``, `# Key moments`, ...kfLines);
  }
  return parts.join("\n");
}

export async function generateOpponentAnalysis(args: {
  fighter: Fighter;
  facts: AthleteFact[];
  kind: AnalysisKind;
  focus: string;
  opponentName: string;
  load: NervousSystemLoad;
  metrics: AnalysisMetrics;
  keyframes: AnalysisKeyframe[];
}): Promise<OpponentNarrative> {
  const { fighter, facts, kind, focus, opponentName, load, metrics, keyframes } = args;

  const dynamic =
    buildDynamicContext(fighter, facts, [], []) +
    "\n\n" +
    OPPONENT_INSTRUCTIONS +
    "\n\n" +
    opponentMetricsText({ kind, focus, opponentName, load, metrics, keyframes });

  const content: Anthropic.ContentBlockParam[] = [];
  for (const kf of keyframes.slice(0, 4)) {
    const parsed = parseDataUrl(kf.imageBase64);
    if (parsed && CLAUDE_IMAGE_MIME.has(parsed.mediaType)) {
      content.push({
        type: "image",
        source: {
          type: "base64",
          media_type: parsed.mediaType as "image/jpeg" | "image/png" | "image/webp",
          data: parsed.data,
        },
      });
      content.push({
        type: "text",
        text: `opponent key frame @ ${kf.timestamp.toFixed(1)}s — ${kf.caption}`,
      });
    }
  }
  content.push({
    type: "text",
    text: "Scout this opponent now. Use the emit_opponent_read tool. Categorical only — never emit numbers or scores.",
  });

  const resp = await getAnthropic().messages.create(
    {
      model: "claude-sonnet-4-6",
      max_tokens: 2200,
      system: [
        { type: "text", text: COACH_SYSTEM_PROMPT_STATIC, cache_control: { type: "ephemeral" } },
        { type: "text", text: dynamic },
      ],
      tools: [OPPONENT_REPORT_TOOL],
      tool_choice: { type: "tool", name: "emit_opponent_read" },
      messages: [{ role: "user", content }],
    },
    { timeout: 55_000, maxRetries: 0 },
  );

  for (const block of resp.content) {
    if (block.type === "tool_use" && block.name === "emit_opponent_read") {
      const out = normaliseOpponent(block.input as Record<string, unknown>);
      if (out.summary && out.styleProfile) return out;
      throw new Error("opponent analysis returned incomplete narrative");
    }
  }
  throw new Error("opponent analysis: claude returned no tool_use");
}

function parseDataUrl(input: string): { mediaType: string; data: string } | null {
  const m = /^data:([^;]+);base64,(.+)$/s.exec(input);
  if (m && m[1] && m[2]) return { mediaType: m[1], data: m[2] };
  if (/^[A-Za-z0-9+/=\s]+$/.test(input) && input.length > 64) {
    return { mediaType: "image/jpeg", data: input.replace(/\s+/g, "") };
  }
  return null;
}
