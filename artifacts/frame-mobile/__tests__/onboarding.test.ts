import { describe, expect, it } from "vitest";
import { describeSaveFailure, dobStepError, sentenceCaseLabel, sportDisplayName, withTimeout } from "../lib/onboarding";

const TODAY = new Date("2026-10-18T12:00:00Z");

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
    const m = describeSaveFailure(api(500, "Internal Server Error"));
    expect(m).toMatch(/answers are kept/);
    expect(m).not.toMatch(/Internal Server Error/);
  });
  it("treats a non-JSON 502 like any server problem", () => {
    expect(describeSaveFailure(api(502, "Request failed with status 502."))).toMatch(/server hit a problem/);
  });
  it("explains a rejected date of birth and other rejected answers", () => {
    expect(describeSaveFailure(api(400, "invalid date of birth"))).toMatch(/date of birth/);
    expect(describeSaveFailure(api(400, "invalid fighter"))).toMatch(/Check each answer/);
  });
  it("explains expired sessions, rate limits, timeouts and offline", () => {
    expect(describeSaveFailure(api(401, "Unauthorized"))).toMatch(/Sign in again/);
    expect(describeSaveFailure(api(429, "Too many"))).toMatch(/Too many attempts/);
    expect(describeSaveFailure(new Error("Request timed out"))).toMatch(/couldn't reach FRAME/);
    expect(describeSaveFailure(new TypeError("Network request failed"))).toMatch(/couldn't reach FRAME/);
    expect(describeSaveFailure(new Error("The operation was aborted"))).toMatch(/couldn't reach FRAME/);
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

describe("display names", () => {
  it("shows sports the way the lists spell them", () => {
    expect(sportDisplayName("bjj")).toBe("BJJ");
    expect(sportDisplayName("muay_thai")).toBe("Muay Thai");
    expect(sportDisplayName("sambo")).toBe("Sambo");
    expect(sportDisplayName("capoeira")).toBe("Capoeira");
    expect(sportDisplayName(null)).toBe("");
  });
  it("keeps the BJJ acronym upper-case in sentence-cased labels", () => {
    expect(sentenceCaseLabel("BJJ BELT")).toBe("BJJ belt");
    expect(sentenceCaseLabel("RANK")).toBe("Rank");
  });
});
