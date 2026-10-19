import { describe, expect, it } from "vitest";
import { QUESTIONS, composePersonality } from "@workspace/onboarding";
import { levelsForSport } from "../src/lib/fighter-options";
import {
  describeSaveError,
  detailsChoiceProblems,
  dobProblem,
  nameProblem,
  validateSignUp,
} from "../src/lib/onboarding-form";

const TODAY = new Date("2026-10-18T12:00:00Z");
const QUESTION_IDS = ["tired", "imposed", "proud", "chaos"];

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
    const e = validateSignUp({ name: "Pat", email: "me@example.com", password: "password1", acceptedLegal: false });
    expect(Object.keys(e)).toEqual(["legal"]);
    expect(validateSignUp({ name: "", email: "", password: "", acceptedLegal: false })).toMatchObject({
      name: expect.stringMatching(/Enter your name/),
      email: expect.any(String),
      password: expect.any(String),
      legal: expect.any(String),
    });
    expect(validateSignUp({ name: "Pat", email: "me@gmail", password: "short", acceptedLegal: true })).toMatchObject({
      email: expect.stringMatching(/typos/),
      password: expect.stringMatching(/at least 8/),
    });
    expect(validateSignUp({ name: "Pat", email: " a@b.co ", password: "12345678", acceptedLegal: true })).toEqual({});
  });
  it("sign-up asks for name, email and password and nothing else (plus the consent tick)", () => {
    expect(Object.keys(validateSignUp({ name: " ", email: "a@b.co", password: "password1", acceptedLegal: true }))).toEqual(["name"]);
    expect(validateSignUp({ name: "x".repeat(61), email: "a@b.co", password: "password1", acceptedLegal: true }).name).toMatch(/60/);
  });
});

describe("describeSaveError", () => {
  it("never leaks a raw JSON body (400 invalid fighter / 500)", () => {
    const bad = Object.assign(new Error('Request failed: {"error":"invalid fighter"}'), { status: 400, kind: "unknown", detail: '{"error":"invalid fighter","details":{"fieldErrors":{"name":["Too big: expected string to have <=60 characters"]}}}' });
    expect(describeSaveError(bad)).toMatch(/1 to 60 characters/);
    const boom = Object.assign(new Error('Something broke on the server: {"error":"Internal Server Error"}'), { status: 500, kind: "server" });
    const msg = describeSaveError(boom);
    expect(msg).toMatch(/answers are kept/);
    expect(msg).not.toMatch(/Enter FRAME/);
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
    expect(QUESTIONS.map((q) => q.id)).toEqual(QUESTION_IDS);
    const text = composePersonality({ tired: 0, imposed: 0, proud: 0, chaos: 0 }, "Left-handed");
    expect(text.startsWith(QUESTIONS[0].choices[0].read)).toBe(true);
    expect(text.endsWith("Left-handed")).toBe(true);
  });
});
