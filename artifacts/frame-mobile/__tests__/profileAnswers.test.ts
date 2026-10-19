import { describe, expect, it } from "vitest";
import { QUESTIONS, composePersonality } from "@workspace/onboarding";
import {
  answeredCount,
  chosenLabel,
  dobParts,
  dobPatch,
  frequencyPatch,
  questionPatch,
  sportPatch,
  textPatch,
} from "../lib/profileAnswers";
import { buildFighterPayload, emptyDraft } from "../lib/onboarding";

const today = new Date("2026-10-20T00:00:00Z");

describe("Profile questionnaire edits use the same fields and validation as onboarding", () => {
  it("a sport needs its level; the body carries the canonical sport key and art label", () => {
    expect(sportPatch("bjj", "")).toMatchObject({ ok: false });
    expect(sportPatch("", "Blue")).toMatchObject({ ok: false });
    expect(sportPatch("muay_thai", "Advanced")).toEqual({
      ok: true,
      body: { primarySport: "muay_thai", art: "Muay Thai", level: "Advanced" },
    });
  });

  it("frequency, goals, weaknesses", () => {
    expect(frequencyPatch("3-4x / week")).toEqual({ ok: true, body: { trainingFrequency: "3-4x / week" } });
    expect(frequencyPatch("")).toMatchObject({ ok: false });
    expect(textPatch("goals", "  win my first comp ")).toEqual({ ok: true, body: { goals: "win my first comp" } });
    // Both are optional in onboarding, so a blank is a valid edit (clears it).
    expect(textPatch("weaknesses", "   ")).toEqual({ ok: true, body: { weaknesses: "" } });
  });

  it("date of birth uses the onboarding rules and messages", () => {
    expect(dobPatch({ day: "14", month: "03", year: "1995" }, today)).toEqual({ ok: true, body: { dateOfBirth: "1995-03-14" } });
    expect(dobPatch({ day: "31", month: "02", year: "1995" }, today)).toMatchObject({ ok: false, error: "That month only has 28 days." });
    expect(dobPatch({ day: "1", month: "1", year: "2030" }, today)).toMatchObject({ ok: false, error: "That year is in the future." });
    expect(dobParts("1995-03-04")).toEqual({ day: "4", month: "3", year: "1995" });
  });

  it("changing one behavioural answer sends all of them, never dropping the others", () => {
    const current = { onboardingAnswers: { tired: 0, imposed: 1 } };
    const r = questionPatch(current, "chaos", 2);
    expect(r).toEqual({ ok: true, body: { onboardingAnswers: { tired: 0, imposed: 1, chaos: 2 } } });
    expect(questionPatch(current, "chaos", 9)).toMatchObject({ ok: false });
    expect(questionPatch(current, "nope", 0)).toMatchObject({ ok: false });
  });

  it("shows the chosen label and counts answers; unanswered stays unanswered", () => {
    const f = { onboardingAnswers: { tired: 2 } };
    expect(chosenLabel(f, "tired")).toBe(QUESTIONS[0]!.choices[2]!.label);
    expect(chosenLabel(f, "imposed")).toBeNull();
    expect(answeredCount(f)).toBe(1);
    expect(answeredCount({})).toBe(0);
  });

  it("onboarding saves the answers themselves, so Profile can show them later", () => {
    const answers = { tired: 0, imposed: 1, proud: 2, chaos: 3 };
    const body = buildFighterPayload({ ...emptyDraft(), name: "A", sport: "bjj", level: "Blue", freq: "3-4x / week", answers }, "1995-03-14");
    expect(body.onboardingAnswers).toEqual(answers);
    expect(body.personality).toBe(composePersonality(answers));
  });
});
