import { describe, expect, it } from "vitest";
import {
  buildFighterPayload,
  describeSaveFailure,
  dobStepError,
  draftHasProgress,
  isDoubleTap,
  nameStepError,
  parseDraft,
  sentenceCaseLabel,
  sportDisplayName,
  withTimeout,
  type OnboardingDraft,
} from "../lib/onboarding";

const TODAY = new Date("2026-10-18T12:00:00Z");
const draft = (over: Partial<OnboardingDraft> = {}): OnboardingDraft => ({
  step: 4,
  name: "  Walker ",
  dob: { day: "14", month: "03", year: "1995" },
  sport: "bjj",
  level: "White",
  freq: "3-4",
  goals: "",
  weaknesses: "   ",
  ...over,
});

describe("buildFighterPayload", () => {
  it("sends blank goals/weaknesses as empty strings, never null (null was a 400 on the server)", () => {
    const p = buildFighterPayload(draft(), "1995-03-14");
    expect(p.goals).toBe("");
    expect(p.weaknesses).toBe("");
    expect(JSON.stringify(p)).not.toContain("null");
  });
  it("trims the name and keeps answers", () => {
    const p = buildFighterPayload(draft({ goals: " Win ", weaknesses: "Cardio" }), "1995-03-14");
    expect(p).toMatchObject({ name: "Walker", goals: "Win", weaknesses: "Cardio", dateOfBirth: "1995-03-14", art: "bjj", primarySport: "bjj", level: "White", trainingFrequency: "3-4" });
  });
});

describe("nameStepError", () => {
  it("explains a blank name", () => expect(nameStepError("   ")).toBe("Enter your name to continue."));
  it("rejects over 60 characters", () => expect(nameStepError("x".repeat(61))).toMatch(/under 61/));
  it("accepts a normal name and exactly 60", () => {
    expect(nameStepError("Walker")).toBeNull();
    expect(nameStepError("y".repeat(60))).toBeNull();
  });
});

describe("dobStepError", () => {
  const p = (day: string, month: string, year: string) => ({ day, month, year });
  it("asks for missing parts", () => expect(dobStepError(p("", "", ""), TODAY)).toMatch(/day, month/));
  it("asks for a four digit year", () => expect(dobStepError(p("14", "03", "95"), TODAY)).toMatch(/four digits/));
  it("names the impossible day", () => expect(dobStepError(p("31", "02", "2000"), TODAY)).toBe("That month only has 29 days."));
  it("flags future years and dates", () => {
    expect(dobStepError(p("14", "03", "2035"), TODAY)).toMatch(/future/);
    expect(dobStepError(p("19", "10", "2026"), TODAY)).toMatch(/future/);
  });
  it("flags month 13 and years before 1900", () => {
    expect(dobStepError(p("10", "13", "1990"), TODAY)).toMatch(/between 1 and 12/);
    expect(dobStepError(p("10", "10", "1850"), TODAY)).toMatch(/too far back/);
  });
  it("accepts a valid date, including today", () => {
    expect(dobStepError(p("14", "03", "1995"), TODAY)).toBeNull();
    expect(dobStepError(p("18", "10", "2026"), TODAY)).toBeNull();
  });
});

describe("describeSaveFailure", () => {
  const api = (status: number, message: string) => Object.assign(new Error(message), { status });
  it("never shows a raw server string for a 500 and keeps the answers", () => {
    const f = describeSaveFailure(api(500, "Internal Server Error"));
    expect(f.message).toMatch(/answers are kept/);
    expect(f.message).not.toMatch(/Internal Server Error/);
  });
  it("treats a non-JSON 502 like any server problem", () => {
    expect(describeSaveFailure(api(502, "Request failed with status 502.")).message).toMatch(/server hit a problem/);
  });
  it("sends a rejected name back to step 1", () => {
    const f = describeSaveFailure(api(400, "invalid fighter"));
    expect(f.goToStep).toBeUndefined();
    const g = describeSaveFailure(api(400, "name is required"));
    expect(g.goToStep).toBe(0);
    expect(g.message).toMatch(/1 to 60/);
  });
  it("sends a rejected date back to step 2", () => {
    expect(describeSaveFailure(api(400, "invalid date of birth")).goToStep).toBe(1);
  });
  it("explains expired sessions, rate limits, timeouts and offline", () => {
    expect(describeSaveFailure(api(401, "Unauthorized")).message).toMatch(/Sign in again/);
    expect(describeSaveFailure(api(429, "Too many")).message).toMatch(/Too many attempts/);
    expect(describeSaveFailure(new Error("Request timed out")).message).toMatch(/couldn't reach FRAME/);
    expect(describeSaveFailure(new TypeError("Network request failed")).message).toMatch(/couldn't reach FRAME/);
    expect(describeSaveFailure(new Error("The operation was aborted")).message).toMatch(/couldn't reach FRAME/);
  });
});

describe("withTimeout", () => {
  it("rejects a request that never settles", async () => {
    await expect(withTimeout(new Promise(() => {}), 20)).rejects.toThrow(/timed out/);
  });
  it("passes a fast result through", async () => {
    await expect(withTimeout(Promise.resolve(7), 50)).resolves.toBe(7);
  });
});

describe("isDoubleTap", () => {
  it("ignores a second tap inside the gap and allows one after it", () => {
    expect(isDoubleTap(1000, 1100)).toBe(true);
    expect(isDoubleTap(1000, 1400)).toBe(false);
    expect(isDoubleTap(0, 1_700_000_000_000)).toBe(false);
  });
});

describe("draft", () => {
  it("round-trips and clamps the step", () => {
    const raw = JSON.stringify({ ...draft({ goals: "Win" }), step: 99 });
    const d = parseDraft(raw)!;
    expect(d.step).toBe(4);
    expect(d.goals).toBe("Win");
    expect(draftHasProgress(d)).toBe(true);
  });
  it("returns null for junk instead of throwing", () => {
    expect(parseDraft(null)).toBeNull();
    expect(parseDraft("{nope")).toBeNull();
    expect(parseDraft("42")).toBeNull();
  });
  it("falls back to a known sport and empty fields for a corrupt draft", () => {
    const d = parseDraft(JSON.stringify({ step: "x", sport: "quidditch", name: 5 }))!;
    expect(d.sport).toBe("bjj");
    expect(d.step).toBe(0);
    expect(d.name).toBe("");
    expect(draftHasProgress(d)).toBe(false);
  });
  it("caps the stored name at 60", () => {
    expect(parseDraft(JSON.stringify({ name: "n".repeat(80) }))!.name).toHaveLength(60);
  });
});

describe("display names", () => {
  it("shows sports the way the lists spell them", () => {
    expect(sportDisplayName("bjj")).toBe("BJJ");
    expect(sportDisplayName("mma")).toBe("MMA");
    expect(sportDisplayName("muay_thai")).toBe("Muay Thai");
    expect(sportDisplayName("sambo")).toBe("Sambo");
    expect(sportDisplayName("capoeira")).toBe("Capoeira");
    expect(sportDisplayName(null)).toBe("");
  });
  it("keeps the BJJ acronym upper-case in sentence-cased labels", () => {
    expect(sentenceCaseLabel("BJJ BELT")).toBe("BJJ belt");
    expect(sentenceCaseLabel("EXPERIENCE LEVEL")).toBe("Experience level");
    expect(sentenceCaseLabel("RANK")).toBe("Rank");
  });
});
