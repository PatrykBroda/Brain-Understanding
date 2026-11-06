import Anthropic from "@anthropic-ai/sdk";
import type { AnalysisFinding, AnalysisScore } from "@workspace/db";

export type CompareSide = {
  id: number;
  createdAt: Date;
  kind: string;
  sessionScore: number;
  scores: AnalysisScore[];
  findings: AnalysisFinding[];
  summary: string;
};

export type ScoreDiff = { key: string; label: string; before: number | null; after: number | null; delta: number | null };
export type ObservationDiff = { resolved: string[]; persisting: string[]; new: string[] };

export type AnalysisDiff = {
  earlierId: number;
  laterId: number;
  daysApart: number;
  sessionScore: { before: number; after: number; delta: number };
  scores: ScoreDiff[];
  observations: ObservationDiff;
};

const DAY_MS = 86_400_000;

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}

/** Orders the pair oldest-first so "before" and "after" always read chronologically. */
export function orderPair(a: CompareSide, b: CompareSide): [CompareSide, CompareSide] {
  return a.createdAt.getTime() <= b.createdAt.getTime() ? [a, b] : [b, a];
}

export function diffScores(before: AnalysisScore[], after: AnalysisScore[]): ScoreDiff[] {
  const b = new Map(before.map((s) => [s.key, s]));
  const a = new Map(after.map((s) => [s.key, s]));
  const keys = [...new Set([...a.keys(), ...b.keys()])];
  return keys.map((key) => {
    const bs = b.get(key);
    const as = a.get(key);
    return {
      key,
      label: (as ?? bs)!.label,
      before: bs ? bs.value : null,
      after: as ? as.value : null,
      delta: bs && as ? as.value - bs.value : null,
    };
  });
}

/** Findings are matched by area + title text; no model call is needed for the structural diff. */
export function diffObservations(before: AnalysisFinding[], after: AnalysisFinding[]): ObservationDiff {
  const key = (f: AnalysisFinding) => `${norm(f.area)}|${norm(f.title)}`;
  const beforeKeys = new Set(before.map(key));
  const afterKeys = new Set(after.map(key));
  return {
    resolved: before.filter((f) => !afterKeys.has(key(f))).map((f) => f.title),
    persisting: after.filter((f) => beforeKeys.has(key(f))).map((f) => f.title),
    new: after.filter((f) => !beforeKeys.has(key(f))).map((f) => f.title),
  };
}

export function diffAnalyses(x: CompareSide, y: CompareSide): AnalysisDiff {
  const [earlier, later] = orderPair(x, y);
  return {
    earlierId: earlier.id,
    laterId: later.id,
    daysApart: Math.round((later.createdAt.getTime() - earlier.createdAt.getTime()) / DAY_MS),
    sessionScore: {
      before: earlier.sessionScore,
      after: later.sessionScore,
      delta: later.sessionScore - earlier.sessionScore,
    },
    scores: diffScores(earlier.scores, later.scores),
    observations: diffObservations(earlier.findings, later.findings),
  };
}

/** Deterministic summary used when the AI call is unavailable, so the screen never goes blank. */
export function fallbackSummary(d: AnalysisDiff): string {
  const moved = d.scores.filter((s) => s.delta != null && s.delta !== 0);
  const up = moved.filter((s) => s.delta! > 0).sort((p, q) => q.delta! - p.delta!)[0];
  const down = moved.filter((s) => s.delta! < 0).sort((p, q) => p.delta! - q.delta!)[0];
  const parts = [`Over ${d.daysApart} day${d.daysApart === 1 ? "" : "s"}, your session score moved ${d.sessionScore.before} → ${d.sessionScore.after}.`];
  if (up) parts.push(`Biggest gain: ${up.label} (+${up.delta}).`);
  if (down) parts.push(`Biggest drop: ${down.label} (${down.delta}).`);
  if (d.observations.resolved.length) parts.push(`No longer showing: ${d.observations.resolved.slice(0, 2).join("; ")}.`);
  if (d.observations.persisting.length) parts.push(`Still showing: ${d.observations.persisting.slice(0, 2).join("; ")}.`);
  return parts.join(" ");
}

export function buildCompareContext(earlier: CompareSide, later: CompareSide, d: AnalysisDiff): string {
  const lines = [
    `EARLIER read (${earlier.createdAt.toISOString().slice(0, 10)}): ${earlier.summary}`,
    `LATER read (${later.createdAt.toISOString().slice(0, 10)}): ${later.summary}`,
    `Days apart: ${d.daysApart}. Session score ${d.sessionScore.before} -> ${d.sessionScore.after}.`,
    "Score changes:",
    ...d.scores.map((s) => `- ${s.label}: ${s.before ?? "n/a"} -> ${s.after ?? "n/a"}`),
    `Observations no longer showing: ${d.observations.resolved.join("; ") || "none"}`,
    `Observations still showing: ${d.observations.persisting.join("; ") || "none"}`,
    `New observations: ${d.observations.new.join("; ") || "none"}`,
  ];
  return lines.join("\n");
}

const COMPARE_SYSTEM =
  "You are FRAME, a combat-sports coach. Compare two of this athlete's video analyses. " +
  "Write 3-4 plain sentences: what improved, what did not, and the one thing to work on next. " +
  "Use only the numbers and observations given; never invent figures. " +
  "Say FRAME or FRAME library; never mention vault, nodes, or Synochi. No markdown, no emoji.";

export type CompareSummariser = (context: string) => Promise<string>;

let _client: Anthropic | null = null;
export const anthropicCompareSummariser: CompareSummariser = async (context) => {
  const baseURL = process.env["AI_INTEGRATIONS_ANTHROPIC_BASE_URL"];
  const apiKey = process.env["AI_INTEGRATIONS_ANTHROPIC_API_KEY"];
  if (!baseURL || !apiKey) throw new Error("compare: AI env not set");
  _client ??= new Anthropic({ baseURL, apiKey });
  const resp = await _client.messages.create(
    { model: "claude-sonnet-4-6", max_tokens: 400, system: COMPARE_SYSTEM, messages: [{ role: "user", content: context }] },
    { timeout: 30_000, maxRetries: 0 },
  );
  return resp.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim();
};

/** Structural diff plus an AI summary; falls back to the deterministic summary on any AI failure. */
export async function compareAnalyses(
  x: CompareSide,
  y: CompareSide,
  summarise: CompareSummariser = anthropicCompareSummariser,
): Promise<AnalysisDiff & { summary: string; summarySource: "ai" | "fallback" }> {
  const diff = diffAnalyses(x, y);
  const [earlier, later] = orderPair(x, y);
  try {
    const text = (await summarise(buildCompareContext(earlier, later, diff))).trim();
    if (text) return { ...diff, summary: text, summarySource: "ai" };
  } catch {
    // fall through to the deterministic summary
  }
  return { ...diff, summary: fallbackSummary(diff), summarySource: "fallback" };
}
