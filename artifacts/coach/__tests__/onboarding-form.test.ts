import { describe, expect, it } from "vitest";
import { QUESTIONS, composePersonality } from "@workspace/onboarding";
import { levelsForSport } from "../src/lib/fighter-options";
import {
  describeSaveError,
  detailsChoiceProblems,
  draftKeyFor,
  dobProblem,
  draftHasProgress,
  nameProblem,
  nextStep,
  parseDraft,
  prevStep,
  validateSignUp,
} from "../src/lib/onboarding-form";

const TODAY = new Date("2026-10-18T12:00:00Z");
const OPTS = {
  questionIds: ["tired", "imposed", "proud", "chaos"],
  choicesPerQuestion: 4,
  sports: ["mma", "bjj", "boxing"],
  frequencies: ["1-2x / week", "3-4x / week", "5-6x / week"],
};

describe("nextStep / prevStep", () => {
  it("never moves past the details step (a stray extra advance used to land on a blank page)", () => {
    expect(nextStep(0, 4)).toBe(1);
    expect(nextStep(3, 4)).toBe(4);
    expect(nextStep(4, 4)).toBe(4);
    expect(nextStep(9, 4)).toBe(4);
  });
  it("never goes below the first question", () => {
    expect(prevStep(2)).toBe(1);
    expect(prevStep(0)).toBe(0);
  });
});

describe("dobProblem", () => {
  it("asks for a missing date", () => expect(dobProblem("", TODAY)).toMatch(/Enter your date of birth/));
  it("rejects year 0002, which used to fail silently", () => expect(dobProblem("0002-01-01", TODAY)).toMatch(/too far back/));
  it("rejects a future date and an impossible one", () => {
    expect(dobProblem("2026-10-19", TODAY)).toMatch(/future/);
    expect(dobProblem("2030-01-01", TODAY)).toMatch(/future/);
    expect(dobProblem("2000-02-31", TODAY)).toMatch(/doesn't exist/);
  });
  it("accepts a real date, today included", () => {
    expect(dobProblem("1995-03-14", TODAY)).toBeNull();
    expect(dobProblem("2026-10-18", TODAY)).toBeNull();
  });
});

describe("nameProblem", () => {
  it("explains blank and whitespace-only names (the button used to just disable)", () => {
    expect(nameProblem("")).toMatch(/Enter a name/);
    expect(nameProblem("   ")).toMatch(/Enter a name/);
  });
  it("caps at 60", () => {
    expect(nameProblem("x".repeat(61))).toMatch(/60 characters/);
    expect(nameProblem("y".repeat(60))).toBeNull();
  });
});

describe("validateSignUp", () => {
  it("names what is missing instead of leaving Create account greyed out", () => {
    const e = validateSignUp({ email: "me@example.com", password: "password1", acceptedLegal: false });
    expect(Object.keys(e)).toEqual(["legal"]);
    expect(validateSignUp({ email: "", password: "", acceptedLegal: false })).toMatchObject({
      email: expect.any(String),
      password: expect.any(String),
      legal: expect.any(String),
    });
    expect(validateSignUp({ email: "me@gmail", password: "short", acceptedLegal: true })).toMatchObject({
      email: expect.stringMatching(/typos/),
      password: expect.stringMatching(/at least 8/),
    });
    expect(validateSignUp({ email: " a@b.co ", password: "12345678", acceptedLegal: true })).toEqual({});
  });
});

describe("describeSaveError", () => {
  it("never leaks a raw JSON body (400 invalid fighter / 500)", () => {
    const bad = Object.assign(new Error('Request failed: {"error":"invalid fighter"}'), { status: 400, kind: "unknown", detail: '{"error":"invalid fighter","details":{"fieldErrors":{"name":["Too big: expected string to have <=60 characters"]}}}' });
    expect(describeSaveError(bad)).toMatch(/1 to 60 characters/);
    const boom = Object.assign(new Error('Something broke on the server: {"error":"Internal Server Error"}'), { status: 500, kind: "server" });
    const msg = describeSaveError(boom);
    expect(msg).toMatch(/answers are kept/);
    expect(msg).not.toMatch(/\{/);
  });
  it("covers timeout, offline, auth and rate limit", () => {
    expect(describeSaveError({ kind: "timeout" })).toMatch(/couldn't reach FRAME/);
    expect(describeSaveError({ kind: "network" })).toMatch(/Your answers are kept/);
    expect(describeSaveError({ kind: "auth" })).toMatch(/Sign in again/);
    expect(describeSaveError({ kind: "rate_limit" })).toMatch(/Too many attempts/);
    expect(describeSaveError(null)).toMatch(/couldn't save/);
  });
});

describe("parseDraft", () => {
  const good = JSON.stringify({
    started: true,
    step: 2,
    answers: { tired: 1, proud: 3 },
    background: ["Boxing"],
    form: { name: "Walker", dateOfBirth: "1995-03-14", primarySport: "bjj", level: "Blue", trainingFrequency: "5-6x / week", goals: "Win", competes: true },
  });
  it("restores progress", () => {
    const d = parseDraft(good, OPTS)!;
    expect(d).toMatchObject({ started: true, step: 2, answers: { tired: 1, proud: 3 }, background: ["Boxing"] });
    expect(d.form).toMatchObject({ name: "Walker", primarySport: "bjj", level: "Blue", competes: true });
    expect(draftHasProgress(d)).toBe(true);
  });
  it("drops out-of-range answers, clamps the step, falls back on unknown sport/frequency", () => {
    const d = parseDraft(JSON.stringify({ step: 99, answers: { tired: 9, chaos: 0, nope: 1 }, form: { primarySport: "quidditch", trainingFrequency: "daily" } }), OPTS)!;
    expect(d.step).toBe(4);
    expect(d.answers).toEqual({ chaos: 0 });
    // unknown values mean "not chosen", never a default
    expect(d.form.primarySport).toBe("");
    expect(d.form.trainingFrequency).toBe("");
  });
  it("returns null for junk and an untouched draft has no progress", () => {
    expect(parseDraft(null, OPTS)).toBeNull();
    expect(parseDraft("{x", OPTS)).toBeNull();
    expect(parseDraft("7", OPTS)).toBeNull();
    expect(draftHasProgress(parseDraft("{}", OPTS)!)).toBe(false);
  });
});

describe("no silent defaults", () => {
  it("restores a real choice from a draft", () => {
    const d = parseDraft(
      JSON.stringify({ step: 4, form: { primarySport: "bjj", level: "Blue", trainingFrequency: "5-6x / week" } }),
      OPTS,
    )!;
    expect(d.form).toMatchObject({ primarySport: "bjj", level: "Blue", trainingFrequency: "5-6x / week" });
  });

  it("a draft with no choices comes back with none (not MMA / Beginner / 3-4x)", () => {
    const d = parseDraft(JSON.stringify({ started: true, step: 2, answers: { tired: 1 } }), OPTS)!;
    expect(d.form.primarySport).toBe("");
    expect(d.form.level).toBe("");
    expect(d.form.trainingFrequency).toBe("");
  });

  it("uses a new draft key so drafts holding the old pre-selected defaults are not restored", () => {
    expect(draftKeyFor("u1")).toBe("frame:onboarding-draft:v2:u1");
  });
});

describe("detailsChoiceProblems says exactly what is missing", () => {
  it("everything missing on an untouched form", () => {
    expect(detailsChoiceProblems({ primarySport: "", level: "", trainingFrequency: "" }, levelsForSport)).toEqual({
      sport: "Choose your primary sport.",
      level: "Choose your sport first, then your level.",
      frequency: "Choose how often you train.",
    });
  });
  it("names the level for the chosen sport", () => {
    const f = (sport: string) => detailsChoiceProblems({ primarySport: sport, level: "", trainingFrequency: "3-4x / week" }, levelsForSport);
    expect(f("bjj")).toEqual({ level: "Choose your belt." });
    expect(f("judo")).toEqual({ level: "Choose your rank." });
    expect(f("mma")).toEqual({ level: "Choose your experience level." });
  });
  it("a level that does not belong to the sport counts as missing", () => {
    expect(detailsChoiceProblems({ primarySport: "boxing", level: "Purple", trainingFrequency: "1-2x / week" }, levelsForSport)).toEqual({
      level: "Choose your experience level.",
    });
  });
  it("is empty when all three are chosen", () => {
    expect(detailsChoiceProblems({ primarySport: "bjj", level: "White", trainingFrequency: "3-4x / week" }, levelsForSport)).toEqual({});
  });
});

describe("the 4 questions are the shared set", () => {
  it("coach composes personality with the shared composer (same text mobile sends)", () => {
    expect(QUESTIONS.map((q) => q.id)).toEqual(OPTS.questionIds);
    const text = composePersonality({ tired: 0, imposed: 0, proud: 0, chaos: 0 }, "Left-handed");
    expect(text.startsWith(QUESTIONS[0].choices[0].read)).toBe(true);
    expect(text.endsWith("Left-handed")).toBe(true);
  });
});
