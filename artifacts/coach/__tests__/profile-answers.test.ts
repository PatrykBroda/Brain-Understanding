import { describe, expect, it } from "vitest";
import { QUESTIONS, composePersonality } from "@workspace/onboarding";
import {
  answeredCount,
  answeredSteps,
  chosenLabel,
  formFromFighter,
  formsEqual,
  newlyAnsweredSteps,
  personalityNoteOf,
  savePatch,
} from "../src/lib/profile-answers";

const TODAY = new Date("2026-10-20T00:00:00Z");
const STUB = { dateOfBirth: null, primarySport: "", level: "", trainingFrequency: "", goals: "", weaknesses: "", onboardingAnswers: {} };

describe("Onboarding Questions form", () => {
  it("a stub fighter gives a blank form: nothing pre-selected", () => {
    const f = formFromFighter(STUB);
    expect(f).toMatchObject({ dateOfBirth: "", primarySport: "", level: "", trainingFrequency: "", goals: "", competes: false, answers: {}, background: [] });
    expect(answeredSteps(f)).toEqual([]);
    expect(chosenLabel(STUB, "tired")).toBeNull();
    expect(answeredCount(STUB)).toBe(0);
  });

  it("pre-fills from an answered fighter, including the note after the composed reads", () => {
    const answers = { tired: 0, imposed: 1 };
    const fighter = {
      ...STUB,
      dateOfBirth: "1995-03-14",
      primarySport: "bjj",
      level: "Blue",
      trainingFrequency: "3-4x / week",
      trainingBackground: "Boxing, Judo",
      onboardingAnswers: answers,
      personality: composePersonality(answers, "Left-handed"),
    };
    const f = formFromFighter(fighter);
    expect(f).toMatchObject({ primarySport: "bjj", level: "Blue", background: ["Boxing", "Judo"], note: "Left-handed", answers });
    expect(personalityNoteOf({ personality: "just a note", onboardingAnswers: {} })).toBe("just a note");
  });

  it("an untouched form is equal to the stored one; an edit is not", () => {
    const f = formFromFighter(STUB);
    expect(formsEqual(f, formFromFighter(STUB))).toBe(true);
    expect(formsEqual({ ...f, goals: "win" }, f)).toBe(false);
  });
});

describe("savePatch", () => {
  it("sends only answered choices, always the clearable text, and all behavioural answers", () => {
    const f = { ...formFromFighter(STUB), primarySport: "muay_thai", level: "Advanced", answers: { tired: 1 }, note: " hi " };
    const r = savePatch(f, TODAY);
    expect(r).toEqual({
      ok: true,
      body: {
        goals: "",
        weaknesses: "",
        bio: "",
        competes: false,
        trainingBackground: "",
        primarySport: "muay_thai",
        art: "Muay Thai",
        level: "Advanced",
        onboardingAnswers: { tired: 1 },
        personalityNote: "hi",
      },
    });
    expect(r.ok && "dateOfBirth" in r.body).toBe(false);
    expect(r.ok && "trainingFrequency" in r.body).toBe(false);
  });

  it("with no behavioural answers the note is the personality text", () => {
    const r = savePatch({ ...formFromFighter(STUB), note: "calm" }, TODAY);
    expect(r.ok && r.body.personality).toBe("calm");
    expect(r.ok && "onboardingAnswers" in r.body).toBe(false);
  });

  it("rejects a bad date of birth and a level from another sport's ladder", () => {
    expect(savePatch({ ...formFromFighter(STUB), dateOfBirth: "2030-01-01" }, TODAY)).toMatchObject({ ok: false, errors: { dateOfBirth: "That date is in the future." } });
    expect(savePatch({ ...formFromFighter(STUB), dateOfBirth: "0002-01-01" }, TODAY)).toMatchObject({ ok: false });
    expect(savePatch({ ...formFromFighter(STUB), primarySport: "boxing", level: "Purple" }, TODAY)).toMatchObject({ ok: false, errors: { level: expect.any(String) } });
    expect(savePatch({ ...formFromFighter(STUB), dateOfBirth: "1995-03-14", primarySport: "bjj", level: "Purple" }, TODAY).ok).toBe(true);
  });
});

describe("funnel steps", () => {
  it("reports each answer the first time it is saved, using the shared step keys", () => {
    const after = { ...formFromFighter(STUB), dateOfBirth: "1995-03-14", primarySport: "bjj", level: "Blue", trainingFrequency: "3-4x / week", goals: "x", answers: { chaos: 2 } };
    expect(answeredSteps(after)).toEqual(["dob", "sport", "level", "frequency", "goals", "q_chaos"]);
    expect(newlyAnsweredSteps(STUB, after)).toEqual(["dob", "sport", "level", "frequency", "goals", "q_chaos"]);
    expect(newlyAnsweredSteps({ ...STUB, primarySport: "bjj", onboardingAnswers: { chaos: 2 } }, after)).toEqual(["dob", "level", "frequency", "goals"]);
  });

  it("every behavioural question has a step", () => {
    const all = Object.fromEntries(QUESTIONS.map((q) => [q.id, 0]));
    expect(answeredSteps({ ...formFromFighter(STUB), answers: all })).toEqual(QUESTIONS.map((q) => `q_${q.id}`));
  });
});
