import Anthropic from "@anthropic-ai/sdk";
import {
  ANALYSIS_KINDS,
  NERVOUS_SYSTEM_LOADS,
  type AnalysisKind,
  type NervousSystemLoad,
  type AnalysisFinding,
  type AnalysisMetrics,
  type AnalysisKeyframe,
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

const ANALYSIS_INSTRUCTIONS = `You are FRAME reviewing footage of the athlete. The browser has already run pose tracking on the clip and computed real movement signals (below). You are NOT guessing — every observation must tie back to a computed signal or something visible in the supplied key frames.

This is a nervous-system reading, not a technique nitpick. The signature move here: take a mechanical observation (guard drops, shoulders rise, balance drifts, output comes in frantic bursts then stalls) and FRAME it as nervous-system behaviour — what the body is doing under load, what the system is bracing for or leaking. e.g. "your guard doesn't drop because you're tired — it drops the instant the exchange ends, the system exhaling the second it thinks it's safe."

HARD RULES:
- Anchor every finding in a real signal from the computed metrics or a visible key frame. Name the signal. No inventing biomechanics you cannot see.
- nervousSystemLoad MUST equal the load value already computed below. Do not override it — narrate around it.
- 3 to 5 findings. Each: a concrete mechanical observation + its nervous-system framing. Order by what matters most.
- severity: low | medium | high — honest, not inflated.
- area: short tag for where on the body / phase (e.g. "guard", "stance", "shoulders", "transitions", "pacing").
- summary: 2-4 sentences. The through-line of this clip read as one nervous-system story. Direct, structural, FRAME's voice. No padding, no praise-for-the-sake-of-it, no emojis.
- Voice: calm, observant, precise. You are a mirror, not a hype machine. No motivational language. No questions back.`;

const REPORT_TOOL: Anthropic.Tool = {
  name: "emit_analysis",
  description:
    "Emit the structured nervous-system reading of the clip. Every finding must tie to a computed signal or visible key frame.",
  input_schema: {
    type: "object" as const,
    properties: {
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
    },
    required: ["summary", "findings"],
  },
};

// Brand hard-rule: no emojis in coach output. Strip pictographic codepoints
// defensively in case the model leaks one past the prompt instruction.
const EMOJI_RE =
  /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}\u{FE00}-\u{FE0F}\u{200D}]/gu;

function stripEmoji(s: string): string {
  return s.replace(EMOJI_RE, "").replace(/[ \t]{2,}/g, " ").trim();
}

type RawReport = { summary?: unknown; findings?: unknown };

function normaliseFindings(raw: RawReport): { summary: string; findings: AnalysisFinding[] } {
  const summary = typeof raw.summary === "string" ? stripEmoji(raw.summary) : "";
  const findings: AnalysisFinding[] = [];
  if (Array.isArray(raw.findings)) {
    for (const f of raw.findings.slice(0, 5)) {
      const it = f as Record<string, unknown>;
      const title = typeof it["title"] === "string" ? stripEmoji(it["title"]) : "";
      const observation = typeof it["observation"] === "string" ? stripEmoji(it["observation"]) : "";
      const framing =
        typeof it["nervousSystemFraming"] === "string" ? stripEmoji(it["nervousSystemFraming"]) : "";
      if (!title || !observation) continue;
      const sevRaw = typeof it["severity"] === "string" ? it["severity"] : "medium";
      const severity = (["low", "medium", "high"].includes(sevRaw) ? sevRaw : "medium") as
        | "low"
        | "medium"
        | "high";
      findings.push({
        title: title.slice(0, 120),
        observation: observation.slice(0, 600),
        nervousSystemFraming: framing.slice(0, 600),
        severity,
        area: (typeof it["area"] === "string" ? stripEmoji(it["area"]) : "general").slice(0, 40),
      });
    }
  }
  return { summary, findings };
}

function metricsText(kind: AnalysisKind, load: NervousSystemLoad, metrics: AnalysisMetrics): string {
  const lines = metrics.signals.map((s) => `- ${s.label}: ${s.value} — ${s.detail}`);
  return [
    `# Clip`,
    `kind: ${kind}`,
    `duration analysed: ${metrics.durationSec.toFixed(1)}s`,
    `frames sampled: ${metrics.framesAnalysed}, frames with a clear pose lock: ${metrics.poseFrames}`,
    ``,
    `# Computed nervous-system load (DO NOT OVERRIDE): ${load.toUpperCase()}`,
    `load basis: ${metrics.loadBasis}`,
    ``,
    `# Computed movement signals`,
    ...lines,
  ].join("\n");
}

export function isValidKind(k: unknown): k is AnalysisKind {
  return typeof k === "string" && (ANALYSIS_KINDS as readonly string[]).includes(k);
}

export function isValidLoad(l: unknown): l is NervousSystemLoad {
  return typeof l === "string" && (NERVOUS_SYSTEM_LOADS as readonly string[]).includes(l);
}

export async function generateAnalysis(args: {
  fighter: Fighter;
  facts: AthleteFact[];
  kind: AnalysisKind;
  load: NervousSystemLoad;
  metrics: AnalysisMetrics;
  keyframes: AnalysisKeyframe[];
}): Promise<{ summary: string; findings: AnalysisFinding[] }> {
  const { fighter, facts, kind, load, metrics, keyframes } = args;

  const dynamic =
    buildDynamicContext(fighter, facts, [], []) +
    "\n\n" +
    ANALYSIS_INSTRUCTIONS +
    "\n\n" +
    metricsText(kind, load, metrics);

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
      content.push({
        type: "text",
        text: `key frame @ ${kf.timestamp.toFixed(1)}s — ${kf.caption}`,
      });
    }
  }
  content.push({
    type: "text",
    text: "Read this clip now. Use the emit_analysis tool. nervousSystemLoad is already fixed above — narrate around it.",
  });

  const resp = await getAnthropic().messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2000,
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
      const out = normaliseFindings(block.input as RawReport);
      if (out.findings.length > 0 && out.summary) return out;
      throw new Error("analysis returned empty findings/summary");
    }
  }
  throw new Error("analysis: claude returned no tool_use");
}

function parseDataUrl(input: string): { mediaType: string; data: string } | null {
  const m = /^data:([^;]+);base64,(.+)$/s.exec(input);
  if (m && m[1] && m[2]) return { mediaType: m[1], data: m[2] };
  // already raw base64 — assume jpeg
  if (/^[A-Za-z0-9+/=\s]+$/.test(input) && input.length > 64) {
    return { mediaType: "image/jpeg", data: input.replace(/\s+/g, "") };
  }
  return null;
}
