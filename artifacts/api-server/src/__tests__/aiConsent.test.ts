import { describe, expect, it } from "vitest";
import {
  AI_CONSENT_DISCLOSURE,
  AI_CONSENT_VERSION,
  AI_PROVIDER_MAX_RETRIES,
  AI_ANALYSIS_CONSENT_VERSION,
  hasCurrentAiConsent,
  minimiseAnalysisContext,
} from "../lib/aiConsent";

describe("AI analysis consent", () => {
  it("disables provider SDK retries so every retry can re-check consent", () => {
    expect(AI_PROVIDER_MAX_RETRIES).toBe(0);
  });

  it("uses the broadened AI consent contract while retaining old exports", () => {
    expect(AI_CONSENT_VERSION).toBe("2026-09-12");
    expect(AI_ANALYSIS_CONSENT_VERSION).toBe(AI_CONSENT_VERSION);
    expect(AI_CONSENT_DISCLOSURE.providers).toEqual(
      expect.arrayContaining(["Anthropic (Claude)", "OpenAI"]),
    );
    expect(AI_CONSENT_DISCLOSURE.sharedData.join(" ")).toMatch(/chat messages/i);
    expect(AI_CONSENT_DISCLOSURE.sharedData.join(" ")).toMatch(/athlete profile/i);
    expect(AI_CONSENT_DISCLOSURE.sharedData.join(" ")).toMatch(/images.*video stills/i);
    expect(AI_CONSENT_DISCLOSURE.sharedData.join(" ")).toMatch(/other user-provided/i);
  });

  it("accepts only the current disclosure version with a timestamp", () => {
    expect(hasCurrentAiConsent(AI_ANALYSIS_CONSENT_VERSION, new Date())).toBe(true);
    expect(
      hasCurrentAiConsent(AI_CONSENT_VERSION, "2026-09-12T00:00:00.000Z"),
    ).toBe(true);
    expect(hasCurrentAiConsent(AI_ANALYSIS_CONSENT_VERSION, null)).toBe(false);
    expect(hasCurrentAiConsent(AI_ANALYSIS_CONSENT_VERSION, "")).toBe(false);
    expect(hasCurrentAiConsent(AI_ANALYSIS_CONSENT_VERSION, undefined)).toBe(false);
    expect(hasCurrentAiConsent(AI_ANALYSIS_CONSENT_VERSION, "not-a-date")).toBe(false);
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