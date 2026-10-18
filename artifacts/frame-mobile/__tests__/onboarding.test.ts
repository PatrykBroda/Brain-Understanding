import { describe, expect, it } from "vitest";
import { QUESTIONS, composePersonality } from "@workspace/onboarding";
import {
  FIRST_QUESTION_STEP,
  STEP_KEYS,
  TOTAL_STEPS,
  buildFighterPayload,
  choiceStepError,
  draftKeyFor,
  emptyDraft,
  questionForStep,
  stepAfter,
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
  step: 8,
  name: "  Walker ",
  dob: { day: "14", month: "03", year: "1995" },
  sport: "bjj",
  level: "White",
  freq: "3-4x / week",
  answers: { tired: 0, imposed: 1, proud: 2, chaos: 3 },
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
    expect(p).toMatchObject({ name: "Walker", goals: "Win", weaknesses: "Cardio", dateOfBirth: "1995-03-14", art: "BJJ", primarySport: "bjj", level: "White", trainingFrequency: "3-4x / week" });
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
    expect(d.step).toBe(TOTAL_STEPS - 1);
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
    expect(d.sport).toBe(""); // never falls back to BJJ
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

describe("no silent defaults", () => {
  it("a blank draft has nothing selected", () => {
    const d = emptyDraft();
    expect([d.sport, d.level, d.freq]).toEqual(["", "", ""]);
    expect(d.answers).toEqual({});
    expect(draftHasProgress(d)).toBe(false);
  });

  it("a corrupt or old draft never invents BJJ / White / 3-4", () => {
    const d = parseDraft(JSON.stringify({ step: 3, name: "A", sport: "quidditch", level: "Grand", freq: "whenever", answers: { tired: 9 } }))!;
    expect([d.sport, d.level, d.freq]).toEqual(["", "", ""]);
    expect(d.answers).toEqual({});
  });

  it("restores real choices, and maps an old frequency draft onto the canonical string", () => {
    const d = parseDraft(JSON.stringify({ step: 5, sport: "judo", level: "Yellow", freq: "3-4", answers: { tired: 2, imposed: 0 } }))!;
    expect(d).toMatchObject({ sport: "judo", level: "Yellow", freq: "3-4x / week", step: 5 });
    expect(d.answers).toEqual({ tired: 2, imposed: 0 });
  });

  it("drops a level that does not belong to the restored sport", () => {
    expect(parseDraft(JSON.stringify({ sport: "boxing", level: "Purple" }))!.level).toBe("");
  });

  it("uses a new draft key so drafts holding the old pre-selected defaults are not restored", () => {
    expect(draftKeyFor("u1")).toBe("frame:onboarding-draft:v2:u1");
  });

  it("the payload carries exactly what was chosen: canonical strings, no null", () => {
    const p = buildFighterPayload(draft({ sport: "muay_thai", level: "Amateur Competitor", freq: "5-6x / week" }), "1995-03-14");
    expect(p).toMatchObject({ art: "Muay Thai", primarySport: "muay_thai", level: "Amateur Competitor", trainingFrequency: "5-6x / week" });
    expect(JSON.stringify(p)).not.toContain("null");
  });
});

describe("choiceStepError says exactly what is missing", () => {
  const at = (key: string) => STEP_KEYS.indexOf(key);
  it("sport, then the belt for that sport", () => {
    expect(choiceStepError(emptyDraft(), at("sport"))).toBe("Choose what you train to continue.");
    expect(choiceStepError({ ...emptyDraft(), sport: "bjj" }, at("sport"))).toBe("Choose your belt to continue.");
    expect(choiceStepError({ ...emptyDraft(), sport: "judo" }, at("sport"))).toBe("Choose your rank to continue.");
    expect(choiceStepError({ ...emptyDraft(), sport: "boxing" }, at("sport"))).toBe("Choose your experience level to continue.");
    expect(choiceStepError({ ...emptyDraft(), sport: "bjj", level: "Blue" }, at("sport"))).toBeNull();
  });
  it("frequency", () => {
    expect(choiceStepError(emptyDraft(), at("frequency"))).toBe("Choose how often you train to continue.");
    expect(choiceStepError({ ...emptyDraft(), freq: "3-4x / week" }, at("frequency"))).toBeNull();
  });
  it("each of the four questions", () => {
    for (const q of QUESTIONS) {
      const step = at(`q_${q.id}`);
      expect(choiceStepError(emptyDraft(), step)).toBe("Pick an answer to continue.");
      expect(choiceStepError({ ...emptyDraft(), answers: { [q.id]: 0 } }, step)).toBeNull();
    }
  });
  it("goals and the typed steps are not choice steps", () => {
    expect(choiceStepError(emptyDraft(), at("goals"))).toBeNull();
    expect(choiceStepError(emptyDraft(), at("name"))).toBeNull();
  });
});

describe("the 9-step flow", () => {
  it("is name, dob, sport, frequency, 4 questions, goals", () => {
    expect(STEP_KEYS).toEqual(["name", "dob", "sport", "frequency", "q_tired", "q_imposed", "q_proud", "q_chaos", "goals"]);
    expect(TOTAL_STEPS).toBe(9);
    expect(FIRST_QUESTION_STEP).toBe(4);
  });
  it("maps question steps to the shared questions and nothing else", () => {
    expect(questionForStep(3)).toBeNull();
    expect(questionForStep(4)).toBe(QUESTIONS[0]);
    expect(questionForStep(7)).toBe(QUESTIONS[3]);
    expect(questionForStep(8)).toBeNull();
    expect(questionForStep(-1)).toBeNull();
  });
  it("step clamping: an extra advance can never run past the last step or before the first", () => {
    expect(stepAfter(0)).toBe(1);
    expect(stepAfter(7)).toBe(8);
    expect(stepAfter(8)).toBe(8);
    expect(stepAfter(99)).toBe(8);
    expect(stepAfter(-5)).toBe(0);
  });
  it("a saved draft on a new step comes back on that step, and a stale high step is clamped", () => {
    expect(parseDraft(JSON.stringify({ step: 6, name: "A" }))!.step).toBe(6);
    expect(parseDraft(JSON.stringify({ step: 50, name: "A" }))!.step).toBe(8);
    expect(parseDraft(JSON.stringify({ step: -3, name: "A" }))!.step).toBe(0);
  });
});

describe("personality is composed from the 4 answers, like the coach web", () => {
  it("equals the shared composer: reads in order, no boilerplate sentence", () => {
    const p = buildFighterPayload(draft(), "1995-03-14");
    expect(p.personality).toBe(composePersonality({ tired: 0, imposed: 1, proud: 2, chaos: 3 }));
    expect(p.personality).toContain(QUESTIONS[0].choices[0].read);
    expect(p.personality).toContain(QUESTIONS[3].choices[3].read);
    expect(p.personality).not.toMatch(/Training .* per week|Sport:|BELT/);
  });
  it("a partial set of answers only includes the answered reads", () => {
    const p = buildFighterPayload(draft({ answers: { proud: 1 } }), "1995-03-14");
    expect(p.personality).toBe(QUESTIONS[2].choices[1].read);
  });
  it("no answers at all gives an empty string, not null", () => {
    expect(buildFighterPayload(draft({ answers: {} }), "1995-03-14").personality).toBe("");
  });
});
