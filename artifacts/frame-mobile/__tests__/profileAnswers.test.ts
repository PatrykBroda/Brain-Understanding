import { describe, expect, it } from "vitest";
import {
  answeredCount,
  draftChanged,
  draftFromFighter,
  frequencyChoicesFor,
  newlyAnsweredSteps,
  questionsPatch,
} from "../lib/profileAnswers";

const today = new Date("2026-10-20T00:00:00Z");
const stub = { dateOfBirth: null, primarySport: "", level: "", trainingFrequency: "", goals: "", weaknesses: "" };
const full = { dateOfBirth: "1995-03-14", primarySport: "bjj", level: "Blue", trainingFrequency: "3-4x / week", goals: "win", weaknesses: "" };

describe("ONBOARDING QUESTIONS on Profile", () => {
  it("a stub fighter starts completely blank: nothing pre-selected", () => {
    expect(draftFromFighter(stub)).toEqual({ dob: { day: "", month: "", year: "" }, sport: "", level: "", freq: "", goals: "", weaknesses: "" });
    expect(draftFromFighter(null).sport).toBe("");
    expect(answeredCount(stub)).toBe(0);
    expect(draftChanged(draftFromFighter(stub), stub)).toBe(false);
  });

  it("an answered fighter is pre-filled, and old spellings map onto the chip", () => {
    const d = draftFromFighter({ ...full, trainingFrequency: "3-4" });
    expect(d).toMatchObject({ dob: { day: "14", month: "3", year: "1995" }, sport: "bjj", level: "Blue", freq: "3-4x / week", goals: "win" });
    expect(answeredCount(full)).toBe(4);
    expect(answeredCount({ ...full, level: "" })).toBe(3);
  });

  it("original frequency labels; a value outside them (Daily / pro) is kept as a chip", () => {
    expect(frequencyChoicesFor("").map((c) => c.label)).toEqual(["1-2x / week", "3-4x / week", "5+ / week"]);
    expect(frequencyChoicesFor("Daily / pro").map((c) => c.key)).toContain("Daily / pro");
  });

  it("sends only what changed, with the canonical sport key and art label", () => {
    const d = { ...draftFromFighter(stub), sport: "muay_thai", level: "Advanced", freq: "5-6x / week", goals: "  win my first comp " };
    expect(questionsPatch(d, stub, today)).toEqual({
      ok: true,
      body: { primarySport: "muay_thai", art: "Muay Thai", level: "Advanced", trainingFrequency: "5-6x / week", goals: "win my first comp" },
    });
    expect(questionsPatch(draftFromFighter(full), full, today)).toEqual({ ok: true, body: {} });
  });

  it("a sport needs its belt / level and the other way round", () => {
    const d = draftFromFighter(stub);
    expect(questionsPatch({ ...d, sport: "bjj" }, stub, today)).toEqual({ ok: false, error: "Choose your belt too." });
    expect(questionsPatch({ ...d, level: "Blue" }, stub, today)).toMatchObject({ ok: false });
  });

  it("date of birth uses the onboarding rules and messages", () => {
    const d = draftFromFighter(stub);
    expect(questionsPatch({ ...d, dob: { day: "14", month: "03", year: "1995" } }, stub, today)).toEqual({ ok: true, body: { dateOfBirth: "1995-03-14" } });
    expect(questionsPatch({ ...d, dob: { day: "31", month: "02", year: "1995" } }, stub, today)).toMatchObject({ ok: false, error: "That month only has 28 days." });
    expect(questionsPatch({ ...d, dob: { day: "1", month: "1", year: "2030" } }, stub, today)).toMatchObject({ ok: false, error: "That year is in the future." });
    expect(questionsPatch({ ...d, dob: { day: "14", month: "", year: "" } }, stub, today)).toMatchObject({ ok: false });
  });

  it("goals and weaknesses are optional: clearing them is a valid edit", () => {
    const d = { ...draftFromFighter(full), goals: "   " };
    expect(questionsPatch(d, full, today)).toEqual({ ok: true, body: { goals: "" } });
  });

  it("reports which questions were first answered by a save (for drop-off tracking)", () => {
    expect(newlyAnsweredSteps(stub, full)).toEqual(["dob", "sport", "level", "frequency", "goals"]);
    expect(newlyAnsweredSteps(full, { ...full, level: "Purple" })).toEqual([]);
    expect(newlyAnsweredSteps({ ...stub, primarySport: "bjj", level: "Blue" }, full)).toEqual(["dob", "frequency", "goals"]);
  });
});
