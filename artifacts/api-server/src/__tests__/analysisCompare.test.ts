import { describe, it, expect, vi } from "vitest";
import {
  diffScores,
  diffObservations,
  diffAnalyses,
  compareAnalyses,
  fallbackSummary,
  buildCompareContext,
  type CompareSide,
} from "../lib/analysisCompare";
import { compareUpgradeRequired, parseComparePair } from "../lib/analysisAccess";

const sc = (key: string, value: number) => ({ key, label: key.toUpperCase(), value, basis: "" });
const f = (title: string, area = "guard") =>
  ({ title, area, observation: "", nervousSystemFraming: "", severity: "low" }) as never;
const side = (id: number, date: string, over: Partial<CompareSide> = {}): CompareSide => ({
  id,
  createdAt: new Date(date),
  kind: "sparring",
  sessionScore: 60,
  scores: [sc("balance", 50), sc("range", 70)],
  findings: [f("Low guard")],
  summary: "s",
  ...over,
});

describe("diffScores", () => {
  it("computes deltas and handles keys on one side only", () => {
    const d = diffScores([sc("a", 50), sc("b", 40)], [sc("a", 65), sc("c", 10)]);
    expect(d.find((x) => x.key === "a")).toMatchObject({ before: 50, after: 65, delta: 15 });
    expect(d.find((x) => x.key === "b")).toMatchObject({ before: 40, after: null, delta: null });
    expect(d.find((x) => x.key === "c")).toMatchObject({ before: null, after: 10, delta: null });
  });
});

describe("diffObservations", () => {
  it("splits resolved / persisting / new, ignoring case and punctuation", () => {
    const d = diffObservations(
      [f("Low guard"), f("Drops left hand", "hands")],
      [f("low  guard!"), f("Telegraphs jab", "hands")],
    );
    expect(d).toEqual({ resolved: ["Drops left hand"], persisting: ["low  guard!"], new: ["Telegraphs jab"] });
  });
});

describe("diffAnalyses", () => {
  it("orders chronologically whichever way the pair is given", () => {
    const early = side(1, "2026-10-01T00:00:00Z", { sessionScore: 50 });
    const late = side(2, "2026-10-29T00:00:00Z", { sessionScore: 62 });
    for (const [x, y] of [[early, late], [late, early]] as const) {
      const d = diffAnalyses(x, y);
      expect(d).toMatchObject({ earlierId: 1, laterId: 2, daysApart: 28, sessionScore: { before: 50, after: 62, delta: 12 } });
    }
  });
});

describe("compareAnalyses", () => {
  const a = side(1, "2026-10-01T00:00:00Z");
  const b = side(2, "2026-10-29T00:00:00Z", { scores: [sc("balance", 60), sc("range", 65)] });
  it("uses the AI summary when available and sends ordered context", async () => {
    const summarise = vi.fn(async (_ctx: string) => " Better balance. ");
    const r = await compareAnalyses(b, a, summarise);
    expect(r).toMatchObject({ summary: "Better balance.", summarySource: "ai" });
    expect(summarise.mock.calls[0]![0]).toMatch(/EARLIER read \(2026-10-01\)/);
  });
  it("falls back deterministically when the AI throws or returns nothing", async () => {
    const r1 = await compareAnalyses(a, b, async () => {
      throw new Error("down");
    });
    expect(r1.summarySource).toBe("fallback");
    expect(r1.summary).toContain("Biggest gain: BALANCE (+10)");
    expect(r1.summary).toContain("Biggest drop: RANGE (-5)");
    expect((await compareAnalyses(a, b, async () => "  ")).summarySource).toBe("fallback");
  });
  it("keeps internal names out of fallback and prompt text", () => {
    const d = diffAnalyses(a, b);
    expect(`${fallbackSummary(d)} ${buildCompareContext(a, b, d)}`).not.toMatch(/synochi|vault|node/i);
  });
});

describe("access", () => {
  it("is FRAME+ only with the same feature key as compare-track", () => {
    expect(compareUpgradeRequired("free")).toMatchObject({ code: "FRAME_PLUS_REQUIRED", feature: "analysis_history" });
    expect(compareUpgradeRequired("frame_plus")).toBeNull();
  });
  it("parses a valid, distinct id pair only", () => {
    expect(parseComparePair("3", "9")).toEqual([3, 9]);
    expect(parseComparePair("3", "3")).toBeNull();
    expect(parseComparePair("x", "2")).toBeNull();
    expect(parseComparePair("0", "2")).toBeNull();
    expect(parseComparePair(undefined, "2")).toBeNull();
    expect(parseComparePair("1.5", "2")).toBeNull();
  });
});
