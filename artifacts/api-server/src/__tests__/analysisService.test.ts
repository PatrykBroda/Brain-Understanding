import { describe, it, expect, vi } from "vitest";

vi.mock("@workspace/db", () => ({
  ANALYSIS_KINDS: ["sparring", "drilling", "padwork", "bag_work"],
  NERVOUS_SYSTEM_LOADS: ["low", "moderate", "elevated", "high"],
  REPLAY_ROLES: ["best_decision", "worst_habit", "biggest_opportunity"],
}));

vi.mock("../synochi", () => ({
  COACH_SYSTEM_PROMPT_STATIC: "static",
  buildDynamicContext: () => "dynamic",
}));

vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn(function() {
    return {};
  }),
}));

import {
  hasCanonicalScores,
  recomputeSessionScore,
  buildComparison,
  stripEmoji,
  buildReplayMoments,
  REPLAY_ROLE_LABELS,
  CANONICAL_SCORE_KEYS,
  type ReplayRef,
} from "../lib/analysisService";

import type { AnalysisScore, AnalysisKeyframe } from "@workspace/db";

function makeScores(overrides: Partial<Record<string, number>> = {}): AnalysisScore[] {
  const defaults: Record<string, number> = {
    aggression: 60,
    composure: 70,
    reaction_speed: 55,
    defensive_recovery: 65,
  };
  const merged = { ...defaults, ...overrides };
  const labels: Record<string, string> = {
    aggression: "AGGRESSION",
    composure: "COMPOSURE",
    reaction_speed: "REACTION SPEED",
    defensive_recovery: "DEFENSIVE RECOVERY",
  };
  return Object.entries(merged).map(([key, value]) => ({
    key,
    label: labels[key] ?? key.toUpperCase(),
    value: value as number,
    basis: `computed from ${key} signals`,
  }));
}

describe("CANONICAL_SCORE_KEYS", () => {
  it("contains exactly the four required keys", () => {
    expect([...CANONICAL_SCORE_KEYS].sort()).toEqual(
      ["aggression", "composure", "defensive_recovery", "reaction_speed"].sort(),
    );
  });
});

describe("hasCanonicalScores", () => {
  it("returns true when all four canonical keys are present", () => {
    expect(hasCanonicalScores(makeScores())).toBe(true);
  });

  it("returns false when a canonical key is missing", () => {
    const scores = makeScores().filter((s) => s.key !== "composure");
    expect(hasCanonicalScores(scores)).toBe(false);
  });

  it("returns false for an empty array", () => {
    expect(hasCanonicalScores([])).toBe(false);
  });

  it("returns true with extra non-canonical keys present", () => {
    const extra: AnalysisScore = { key: "footwork", label: "FOOTWORK", value: 72, basis: "extra" };
    expect(hasCanonicalScores([...makeScores(), extra])).toBe(true);
  });

  it("returns false when all four keys are missing", () => {
    const none: AnalysisScore[] = [{ key: "footwork", label: "FOOTWORK", value: 72, basis: "x" }];
    expect(hasCanonicalScores(none)).toBe(false);
  });
});

describe("recomputeSessionScore — weighting formula", () => {
  it("matches the documented weighting: composure*0.34 + recovery*0.26 + reaction*0.2 + aggression*0.2", () => {
    const scores = makeScores({ aggression: 60, composure: 70, reaction_speed: 55, defensive_recovery: 65 });
    const expected = Math.round(70 * 0.34 + 65 * 0.26 + 55 * 0.2 + 60 * 0.2);
    expect(recomputeSessionScore(scores, "low")).toBe(expected);
  });

  it("applies no fragmentation penalty for 'low' risk", () => {
    const scores = makeScores({ aggression: 50, composure: 50, reaction_speed: 50, defensive_recovery: 50 });
    const base = Math.round(50 * 0.34 + 50 * 0.26 + 50 * 0.2 + 50 * 0.2);
    expect(recomputeSessionScore(scores, "low")).toBe(base);
  });

  it("subtracts 8 for 'moderate' fragmentation risk", () => {
    const scores = makeScores({ aggression: 50, composure: 50, reaction_speed: 50, defensive_recovery: 50 });
    const base = Math.round(50 * 0.34 + 50 * 0.26 + 50 * 0.2 + 50 * 0.2);
    expect(recomputeSessionScore(scores, "moderate")).toBe(base - 8);
  });

  it("subtracts 16 for 'elevated' fragmentation risk", () => {
    const scores = makeScores({ aggression: 50, composure: 50, reaction_speed: 50, defensive_recovery: 50 });
    const base = Math.round(50 * 0.34 + 50 * 0.26 + 50 * 0.2 + 50 * 0.2);
    expect(recomputeSessionScore(scores, "elevated")).toBe(base - 16);
  });

  it("subtracts 26 for 'high' fragmentation risk", () => {
    const scores = makeScores({ aggression: 50, composure: 50, reaction_speed: 50, defensive_recovery: 50 });
    const base = Math.round(50 * 0.34 + 50 * 0.26 + 50 * 0.2 + 50 * 0.2);
    expect(recomputeSessionScore(scores, "high")).toBe(base - 26);
  });

  it("clamps the result to a minimum of 0 when penalty exceeds the raw score", () => {
    const scores = makeScores({ aggression: 0, composure: 0, reaction_speed: 0, defensive_recovery: 0 });
    expect(recomputeSessionScore(scores, "high")).toBe(0);
  });

  it("clamps the result to a maximum of 100", () => {
    const scores = makeScores({ aggression: 100, composure: 100, reaction_speed: 100, defensive_recovery: 100 });
    expect(recomputeSessionScore(scores, "low")).toBe(100);
  });

  it("falls back to 50 for a missing canonical key", () => {
    const partial = makeScores().filter((s) => s.key !== "composure");
    const expected = Math.round(50 * 0.34 + 65 * 0.26 + 55 * 0.2 + 60 * 0.2);
    expect(recomputeSessionScore(partial, "low")).toBe(expected);
  });

  it("returns an integer (no fractional session score)", () => {
    const scores = makeScores({ aggression: 73, composure: 61, reaction_speed: 48, defensive_recovery: 82 });
    const result = recomputeSessionScore(scores, "moderate");
    expect(Number.isInteger(result)).toBe(true);
  });
});

describe("buildComparison", () => {
  const current = makeScores({ aggression: 70, composure: 80, reaction_speed: 60, defensive_recovery: 75 });
  const prev = makeScores({ aggression: 60, composure: 70, reaction_speed: 65, defensive_recovery: 70 });

  it("returns null when prevScores is null", () => {
    expect(buildComparison(current, null, "no prior session")).toBeNull();
  });

  it("returns null when prevScores is an empty array", () => {
    expect(buildComparison(current, [], "no prior session")).toBeNull();
  });

  it("includes a delta entry for each score present in both sessions", () => {
    const result = buildComparison(current, prev, "some note");
    expect(result).not.toBeNull();
    expect(result!.deltas.length).toBe(4);
  });

  it("computes positive deltas correctly", () => {
    const result = buildComparison(current, prev, "note");
    const aggrDelta = result!.deltas.find((d) => d.key === "aggression");
    expect(aggrDelta!.delta).toBe(10);
  });

  it("computes negative deltas correctly", () => {
    const result = buildComparison(current, prev, "note");
    const reactionDelta = result!.deltas.find((d) => d.key === "reaction_speed");
    expect(reactionDelta!.delta).toBe(-5);
  });

  it("computes zero delta when scores are unchanged", () => {
    const same = makeScores({ aggression: 60, composure: 70, reaction_speed: 65, defensive_recovery: 70 });
    const result = buildComparison(same, prev, "note");
    for (const d of result!.deltas) {
      expect(d.delta).toBe(0);
    }
  });

  it("passes the note through to the comparison object", () => {
    const result = buildComparison(current, prev, "less reactive under pressure");
    expect(result!.note).toBe("less reactive under pressure");
  });

  it("omits a score from deltas when its key is absent from the previous session", () => {
    const prevPartial = prev.filter((s) => s.key !== "composure");
    const result = buildComparison(current, prevPartial, "note");
    expect(result).not.toBeNull();
    const composureDelta = result!.deltas.find((d) => d.key === "composure");
    expect(composureDelta).toBeUndefined();
    expect(result!.deltas.length).toBe(3);
  });

  it("returns null when no keys overlap between current and previous", () => {
    const differentScores: AnalysisScore[] = [
      { key: "footwork", label: "FOOTWORK", value: 60, basis: "x" },
    ];
    expect(buildComparison(differentScores, prev, "note")).toBeNull();
  });
});

describe("stripEmoji", () => {
  it("removes a common pictographic emoji", () => {
    expect(stripEmoji("Great work 🔥 stay sharp")).toBe("Great work stay sharp");
  });

  it("removes multiple emojis", () => {
    expect(stripEmoji("🏆 You won 🎉")).toBe("You won");
  });

  it("returns a plain string unchanged", () => {
    expect(stripEmoji("Keep your guard up.")).toBe("Keep your guard up.");
  });

  it("collapses double spaces left after emoji removal", () => {
    expect(stripEmoji("Go  hard")).toBe("Go hard");
  });

  it("trims leading and trailing whitespace after stripping", () => {
    expect(stripEmoji("  🔥  hello  ")).toBe("hello");
  });

  it("handles an empty string", () => {
    expect(stripEmoji("")).toBe("");
  });

  it("removes variation-selector codepoints (U+FE0F)", () => {
    expect(stripEmoji("good\uFE0F")).toBe("good");
  });

  it("removes the zero-width joiner (U+200D)", () => {
    expect(stripEmoji("family\u200Dunit")).toBe("familyunit");
  });

  it("strips emoji from within a longer paragraph", () => {
    const input = "Your stance is solid 💪 but your guard drops 👇 under pressure.";
    const result = stripEmoji(input);
    expect(result).not.toMatch(/[\u{1F000}-\u{1FAFF}]/u);
    expect(result).toContain("Your stance is solid");
    expect(result).toContain("but your guard drops");
    expect(result).toContain("under pressure.");
  });
});

function makeKeyframes(timestamps: number[]): AnalysisKeyframe[] {
  return timestamps.map((t, i) => ({
    timestamp: t,
    imageBase64: `img-${i}`,
    caption: `frame ${i}`,
  }));
}

describe("buildReplayMoments", () => {
  const keyframes = makeKeyframes([1.2, 3.4, 5.6, 7.8]);

  it("returns an empty array for no refs", () => {
    expect(buildReplayMoments([], keyframes)).toEqual([]);
  });

  it("returns an empty array when there are no keyframes", () => {
    const refs: ReplayRef[] = [{ role: "best_decision", keyframeIndex: 0, note: "clean entry" }];
    expect(buildReplayMoments(refs, [])).toEqual([]);
  });

  it("copies the timestamp from the referenced real keyframe (AI never emits it)", () => {
    const refs: ReplayRef[] = [{ role: "best_decision", keyframeIndex: 1, note: "clean entry" }];
    const out = buildReplayMoments(refs, keyframes);
    expect(out).toHaveLength(1);
    expect(out[0].timestamp).toBe(3.4);
    expect(out[0].note).toBe("clean entry");
  });

  it("labels each moment from REPLAY_ROLE_LABELS", () => {
    const refs: ReplayRef[] = [
      { role: "worst_habit", keyframeIndex: 0, note: "guard drops" },
    ];
    const out = buildReplayMoments(refs, keyframes);
    expect(out[0].label).toBe(REPLAY_ROLE_LABELS.worst_habit);
  });

  it("drops a ref whose keyframeIndex is out of range (too high)", () => {
    const refs: ReplayRef[] = [{ role: "best_decision", keyframeIndex: 99, note: "x" }];
    expect(buildReplayMoments(refs, keyframes)).toEqual([]);
  });

  it("drops a ref whose keyframeIndex is negative", () => {
    const refs: ReplayRef[] = [{ role: "best_decision", keyframeIndex: -1, note: "x" }];
    expect(buildReplayMoments(refs, keyframes)).toEqual([]);
  });

  it("keeps only the first ref for a duplicated role", () => {
    const refs: ReplayRef[] = [
      { role: "best_decision", keyframeIndex: 0, note: "first" },
      { role: "best_decision", keyframeIndex: 1, note: "second" },
    ];
    const out = buildReplayMoments(refs, keyframes);
    expect(out).toHaveLength(1);
    expect(out[0].note).toBe("first");
    expect(out[0].timestamp).toBe(1.2);
  });

  it("keeps only the first ref for a duplicated keyframe index", () => {
    const refs: ReplayRef[] = [
      { role: "best_decision", keyframeIndex: 2, note: "first" },
      { role: "worst_habit", keyframeIndex: 2, note: "second" },
    ];
    const out = buildReplayMoments(refs, keyframes);
    expect(out).toHaveLength(1);
    expect(out[0].role).toBe("best_decision");
  });

  it("maps all three distinct roles when each cites a distinct keyframe", () => {
    const refs: ReplayRef[] = [
      { role: "best_decision", keyframeIndex: 0, note: "a" },
      { role: "worst_habit", keyframeIndex: 1, note: "b" },
      { role: "biggest_opportunity", keyframeIndex: 2, note: "c" },
    ];
    const out = buildReplayMoments(refs, keyframes);
    expect(out).toHaveLength(3);
    expect(out.map((m) => m.role)).toEqual([
      "best_decision",
      "worst_habit",
      "biggest_opportunity",
    ]);
  });

  it("caps output at three moments", () => {
    const refs: ReplayRef[] = [
      { role: "best_decision", keyframeIndex: 0, note: "a" },
      { role: "worst_habit", keyframeIndex: 1, note: "b" },
      { role: "biggest_opportunity", keyframeIndex: 2, note: "c" },
      { role: "best_decision", keyframeIndex: 3, note: "d" },
    ];
    expect(buildReplayMoments(refs, keyframes).length).toBeLessThanOrEqual(3);
  });
});
