import { describe, expect, it } from "vitest";
import {
  AI_ANALYSIS_CONSENT_VERSION,
  hasCurrentAiConsent,
  minimiseAnalysisContext,
} from "../lib/aiConsent";

describe("AI analysis consent", () => {
  it("accepts only the current disclosure version with a timestamp", () => {
    expect(hasCurrentAiConsent(AI_ANALYSIS_CONSENT_VERSION, new Date())).toBe(true);
    expect(hasCurrentAiConsent(AI_ANALYSIS_CONSENT_VERSION, null)).toBe(false);
    expect(hasCurrentAiConsent("older-version", new Date())).toBe(false);
    expect(hasCurrentAiConsent(null, null)).toBe(false);
  });

  it("removes direct identifiers and unrelated history from AI context", () => {
    const fighter = {
      name: "Private Name",
      age: 29,
      gym: "Private Gym",
      bio: "Private bio",
      goals: "Private goal",
      weaknesses: "Private weakness",
      heightCm: 180,
      weightKg: 80,
      primarySport: "bjj",
      level: "advanced",
      trainingFrequency: "4x",
    } as never;
    const facts = [
      { category: "pattern", content: "guard opens" },
      { category: "context", content: "private life event" },
      { category: "event", content: "private event" },
    ] as never;
    const result = minimiseAnalysisContext(fighter, facts);
    expect(result.fighter.name).toBe("");
    expect(result.fighter.gym).toBe("");
    expect(result.fighter.bio).toBe("");
    expect(result.fighter.heightCm).toBeNull();
    expect(result.facts).toHaveLength(1);
    expect(result.facts[0]?.category).toBe("pattern");
  });
});