import Anthropic from "@anthropic-ai/sdk";
import {
  ANALYSIS_KINDS,
  NERVOUS_SYSTEM_LOADS,
  type AnalysisKind,
  type NervousSystemLoad,
  type AnalysisFinding,
  type AnalysisMetrics,
  type AnalysisKeyframe,
  type AnalysisScore,
  type StyleParallel,
  type AnalysisComparison,
  type Fighter,
  type AthleteFact,
} from "@workspace/db";
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

This is a nervous-system reading shaped into a shareable performance breakdown — think tactical fight-analysis, not a gym app. The signature move: take a mechanical observation (guard drops, shoulders rise, balance drifts, output comes in frantic bursts then stalls) and FRAME it as nervous-system behaviour — what the body is doing under load, what it's bracing for or leaking.

You are given the athlete's computed numbers. DO NOT invent or change any number. Your job is the WORDS around them.

HARD RULES:
- The scores, nervousSystemLoad, fragmentationRisk and sessionScore are ALREADY FIXED below. Never output numbers — narrate around them. If you reference a number, use the one given.
- styleProfile: a short, evocative fighting-identity label grounded in the scores (e.g. "Pressure Counter Striker", "Patient Trapper", "Chaos Brawler"). 2-4 words. Must fit what the numbers actually say.
- styleParallels: 1-2 KNOWN fighters whose tendencies this resembles. GROUNDED and HEDGED — never "you ARE X". Each note explains the SPECIFIC resemblance ("your entry timing and stance-switching resembles early McGregor — not identical, but the way you freeze before committing is similar"). Credibility over flattery. If nothing fits, return an empty list.
- aiComment: ONE or TWO sentences of dry, human personality. Observational, lightly wry, never meme-y, never hype. e.g. "You fight like someone who enjoys chaos slightly too much — but people are starting to react to your feints instead of your power." No emojis.
- findings: 3 to 5. Each = a concrete mechanical observation + its nervous-system framing. Order by what matters most. severity low|medium|high, honest. area = short tag ("guard","stance","shoulders","transitions","pacing").
- summary: 2-4 sentences. The through-line of this clip as one nervous-system story. Direct, structural, FRAME's voice. No padding, no emojis.
- If a focus was requested, weight the whole read toward it.
- comparisonNote: ONLY if previous-session deltas are provided below — 1-2 sentences on what changed and what it means ("you're less reactive under pressure than last upload; still overcommitting after combinations"). Omit if no prior session.
- Voice: calm, observant, precise. A mirror, not a hype machine. No motivational filler, no questions back.`;

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
          },
          required: ["title", "observation", "nervousSystemFraming", "severity", "area"],
        },
      },
      comparisonNote: { type: "string" },
    },
    required: ["styleProfile", "aiComment", "summary", "findings"],
  },
};

// Brand hard-rule: no emojis in coach output. Strip pictographic codepoints defensively.
const EMOJI_RE =
  /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}\u{FE00}-\u{FE0F}\u{200D}]/gu;

function stripEmoji(s: string): string {
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
};

function normalise(raw: Record<string, unknown>): AnalysisNarrative {
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
    aiComment: asStr(raw["aiComment"], 320),
    summary: asStr(raw["summary"], 800),
    findings,
    comparisonNote: asStr(raw["comparisonNote"], 320),
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
}): string {
  const { kind, focus, load, fragmentationRisk, sessionScore, scores, metrics, prevScores } = args;
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
    metricsText({ kind, focus, load, fragmentationRisk, sessionScore, scores, metrics, prevScores });

  const content: Anthropic.ContentBlockParam[] = [];
  for (const kf of keyframes.slice(0, 6)) {
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

  const resp = await getAnthropic().messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2200,
    system: [
      { type: "text", text: COACH_SYSTEM_PROMPT_STATIC, cache_control: { type: "ephemeral" } },
      { type: "text", text: dynamic },
    ],
    tools: [REPORT_TOOL],
    tool_choice: { type: "tool", name: "emit_analysis" },
    messages: [{ role: "user", content }],
  });

  for (const block of resp.content) {
    if (block.type === "tool_use" && block.name === "emit_analysis") {
      const out = normalise(block.input as Record<string, unknown>);
      if (out.findings.length > 0 && out.summary && out.styleProfile) return out;
      throw new Error("analysis returned incomplete narrative");
    }
  }
  throw new Error("analysis: claude returned no tool_use");
}

function parseDataUrl(input: string): { mediaType: string; data: string } | null {
  const m = /^data:([^;]+);base64,(.+)$/s.exec(input);
  if (m && m[1] && m[2]) return { mediaType: m[1], data: m[2] };
  if (/^[A-Za-z0-9+/=\s]+$/.test(input) && input.length > 64) {
    return { mediaType: "image/jpeg", data: input.replace(/\s+/g, "") };
  }
  return null;
}
