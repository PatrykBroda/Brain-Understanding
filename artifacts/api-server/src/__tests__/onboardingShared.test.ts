/**
 * The shared onboarding package (@workspace/onboarding): the canonical value
 * set, the normaliser that maps every older spelling onto it, the 4-question
 * personality composition, and the funnel aggregation. One test file for the
 * package, kept next to the server tests that consume it.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ALL_LEVELS,
  FLOWS,
  FREQUENCIES,
  QUESTIONS,
  SPORTS,
  EVENT_TIMEOUT_MS,
  MAX_IN_FLIGHT,
  buildFunnel,
  createStepTracker,
  composePersonality,
  formatFunnel,
  isClientStep,
  levelsForSport,
  normaliseArt,
  normaliseFighterAnswers,
  normaliseFrequency,
  normaliseLevel,
  normalisePrimarySport,
  sanitiseAnswers,
  sportKeyFrom,
} from "@workspace/onboarding";

describe("normaliser: old strings -> canonical", () => {
  it.each([
    ["1-2", "1-2x / week"],
    ["3-4", "3-4x / week"],
    ["5+", "5-6x / week"],
    ["5+ / week", "5-6x / week"],
    ["3-4x / week", "3-4x / week"],
    ["  3-4X / WEEK ", "3-4x / week"],
    ["5-6x / week", "5-6x / week"],
    ["Daily / pro", "Daily / pro"],
    ["daily", "Daily / pro"],
  ])("frequency %j -> %j", (raw, want) => {
    expect(normaliseFrequency(raw)).toBe(want);
  });

  it("is idempotent for every canonical frequency", () => {
    for (const f of FREQUENCIES) expect(normaliseFrequency(f)).toBe(f);
  });

  it("keeps a frequency it does not recognise (never invents one)", () => {
    expect(normaliseFrequency("twice a day")).toBe("twice a day");
  });

  it.each([
    ["bjj", "BJJ"],
    ["BJJ", "BJJ"],
    ["BJJ / Grappling", "BJJ"],
    ["mma", "MMA"],
    ["MMA", "MMA"],
    ["muay_thai", "Muay Thai"],
    ["Muay Thai", "Muay Thai"],
    ["karate", "Karate"],
    ["mixed", "Mixed / multiple"],
  ])("art %j -> %j", (raw, want) => {
    expect(normaliseArt(raw)).toBe(want);
  });

  it("keeps a styled art value from the profile editor", () => {
    expect(normaliseArt("MMA (Wrestling-heavy)")).toBe("MMA (Wrestling-heavy)");
    expect(normaliseArt("Guard player")).toBe("Guard player");
  });

  it.each([
    ["bjj", "bjj"],
    ["BJJ / Grappling", "bjj"],
    ["BJJ", "bjj"],
    ["Muay Thai", "muay_thai"],
    ["MMA", "mma"],
    ["", ""],
  ])("primarySport %j -> %j", (raw, want) => {
    expect(normalisePrimarySport(raw)).toBe(want);
  });

  it.each([
    ["beginner", "Beginner"],
    ["Amateur competitor", "Amateur Competitor"],
    ["No rank / other", "No belt / other"],
    ["white", "White"],
    ["Black", "Black"],
  ])("level %j -> %j", (raw, want) => {
    expect(normaliseLevel(raw)).toBe(want);
  });

  it("maps a whole mobile-era payload and a whole coach-era payload to the same values", () => {
    const mobileOld = normaliseFighterAnswers({ art: "bjj", primarySport: "bjj", level: "White", trainingFrequency: "3-4" });
    const coachOld = normaliseFighterAnswers({ art: "BJJ / Grappling", primarySport: "bjj", level: "White", trainingFrequency: "3-4x / week" });
    expect(mobileOld).toEqual(coachOld);
    expect(mobileOld).toEqual({ art: "BJJ", primarySport: "bjj", level: "White", trainingFrequency: "3-4x / week" });
  });

  it("is idempotent: normalising twice changes nothing (the backfill can be re-run)", () => {
    const olds = [
      { art: "bjj", primarySport: "bjj", level: "white", trainingFrequency: "3-4" },
      { art: "BJJ / Grappling", primarySport: "BJJ / Grappling", level: "Amateur competitor", trainingFrequency: "5+ / week" },
      { art: "MMA (Wrestling-heavy)", primarySport: "mma", level: "Beginner", trainingFrequency: "Daily / pro" },
      { art: "", primarySport: "", level: "", trainingFrequency: "" },
    ];
    for (const o of olds) {
      const once = normaliseFighterAnswers(o);
      expect(normaliseFighterAnswers(once)).toEqual(once);
    }
  });

  it("only touches fields that are present", () => {
    expect(normaliseFighterAnswers({ trainingFrequency: "1-2" })).toEqual({ trainingFrequency: "1-2x / week" });
    expect(normaliseFighterAnswers({})).toEqual({});
  });

  it("every sport and level the apps offer is already canonical", () => {
    for (const s of SPORTS) {
      expect(sportKeyFrom(s.key)).toBe(s.key);
      expect(normalisePrimarySport(s.key)).toBe(s.key);
      expect(normaliseArt(s.label)).toBe(s.label);
      for (const l of levelsForSport(s.key)) expect(normaliseLevel(l)).toBe(l);
    }
    for (const l of ALL_LEVELS) expect(normaliseLevel(l)).toBe(l);
  });
});

describe("personality composition (same on both apps)", () => {
  it("composes the reads in question order with no boilerplate", () => {
    const text = composePersonality({ tired: 0, imposed: 1, proud: 2, chaos: 3 });
    expect(text).toBe(
      [
        QUESTIONS[0].choices[0].read,
        QUESTIONS[1].choices[1].read,
        QUESTIONS[2].choices[2].read,
        QUESTIONS[3].choices[3].read,
      ].join(" "),
    );
    expect(text).not.toMatch(/Training .* per week/);
  });

  it("skips unanswered questions and appends trimmed free text", () => {
    expect(composePersonality({ chaos: 0 }, "  Left-handed.  ")).toBe(`${QUESTIONS[3].choices[0].read} Left-handed.`);
    expect(composePersonality({}, "")).toBe("");
  });

  it("ignores out-of-range indexes instead of throwing", () => {
    expect(composePersonality({ tired: 9 })).toBe("");
  });

  it("sanitiseAnswers drops junk", () => {
    expect(sanitiseAnswers({ tired: 1, imposed: 7, proud: "x", other: 0, chaos: 2.5 })).toEqual({ tired: 1 });
    expect(sanitiseAnswers(null)).toEqual({});
  });

  it("has four questions with four answers each", () => {
    expect(QUESTIONS).toHaveLength(4);
    for (const q of QUESTIONS) expect(q.choices).toHaveLength(4);
  });
});

describe("flows", () => {
  it("are sign-up, the Profile questions and a server-recorded finish; no onboarding screen steps", () => {
    expect(FLOWS.mobile).toEqual(["signup", "home", "questions_view", "dob", "sport", "level", "frequency", "goals", "finish"]);
    expect(FLOWS.coach).toEqual([
      "signup", "home", "questions_view", "dob", "sport", "level", "frequency", "goals",
      "q_tired", "q_imposed", "q_proud", "q_chaos", "finish",
    ]);
  });
});

describe("step keys", () => {
  it("clients may report real steps but not the server-only ones", () => {
    expect(isClientStep("mobile", "dob")).toBe(true);
    expect(isClientStep("mobile", "questions_view")).toBe(true);
    expect(isClientStep("mobile", "q_tired")).toBe(false); // the four behavioural questions are coach web only
    expect(isClientStep("coach", "q_tired")).toBe(true);
    expect(isClientStep("coach", "home")).toBe(true);
    expect(isClientStep("coach", "details")).toBe(false); // old onboarding-screen steps are gone
    expect(isClientStep("mobile", "name")).toBe(false);
    expect(isClientStep("coach", "signup")).toBe(false);
    expect(isClientStep("coach", "finish")).toBe(false);
    expect(isClientStep("mobile", "nope")).toBe(false);
  });
});

describe("funnel aggregation", () => {
  const ev = (userId: string, step: string, event = "view", app = "mobile") => ({ userId, app, step, event });

  it("counts people reached and dropped per step, in flow order", () => {
    const rows = [
      // A: signs up, opens the questions, quits on the sport
      ev("A", "signup", "complete"),
      ev("A", "questions_view"),
      ev("A", "dob", "complete"),
      ev("A", "sport"),
      // B: answers most of it and quits before the frequency
      ev("B", "signup", "complete"),
      ev("B", "home"),
      ev("B", "dob", "complete"),
      ev("B", "sport", "complete"),
      ev("B", "level", "complete"),
      // C: finishes
      ev("C", "signup", "complete"),
      ev("C", "goals", "complete"),
      ev("C", "finish", "complete"),
      // D: signs up and never comes back
      ev("D", "signup", "complete"),
    ];
    const [mobile, coach] = buildFunnel(rows);
    expect(mobile.app).toBe("mobile");
    expect(mobile.started).toBe(4);
    expect(mobile.finished).toBe(1);
    const row = (s: string) => mobile.steps.find((x) => x.step === s)!;
    expect(row("signup")).toMatchObject({ reached: 4, dropped: 1 }); // D stopped here
    expect(row("home")).toMatchObject({ reached: 3 });
    expect(row("dob")).toMatchObject({ reached: 3, dropped: 0 });
    expect(row("sport")).toMatchObject({ reached: 3, dropped: 1 }); // A stopped here
    expect(row("level")).toMatchObject({ reached: 2, dropped: 1 }); // B stopped here
    // C answered goals first (any order in Profile): still counted as having passed every earlier step.
    expect(row("goals")).toMatchObject({ reached: 1, dropped: 0 });
    expect(row("finish")).toMatchObject({ reached: 1, dropped: 0 });
    expect(row("dob").pctOfStart).toBe(75);
    expect(row("goals").pctOfStart).toBe(25);
    expect(coach.started).toBe(0);
  });

  it("sums to the number who started: dropped across steps + finished", () => {
    const rows = [ev("A", "home"), ev("B", "dob"), ev("C", "finish", "complete"), ev("D", "goals")];
    const [mobile] = buildFunnel(rows);
    const dropped = mobile.steps.reduce((n, s) => n + s.dropped, 0);
    expect(dropped + mobile.finished).toBe(mobile.started);
  });

  it("keeps the two apps apart and ignores unknown steps, apps and duplicate events", () => {
    const rows = [
      ev("A", "home", "view", "coach"),
      ev("A", "home", "view", "coach"),
      ev("A", "q_tired", "view", "coach"),
      ev("B", "home", "view", "mobile"),
      ev("B", "bogus", "view", "mobile"),
      ev("C", "home", "view", "desktop"),
    ];
    const [mobile, coach] = buildFunnel(rows);
    expect(mobile.started).toBe(1);
    expect(coach.started).toBe(1);
    expect(coach.steps.find((s) => s.step === "q_tired")).toMatchObject({ reached: 1, dropped: 1 });
  });

  it("counts errors per step", () => {
    const [mobile] = buildFunnel([ev("A", "goals"), ev("A", "goals", "error"), ev("A", "goals", "error")]);
    expect(mobile.steps.find((s) => s.step === "goals")!.errors).toBe(2);
  });

  it("an empty table gives zeros, not NaN", () => {
    for (const r of buildFunnel([])) {
      expect(r.started).toBe(0);
      expect(r.steps).toHaveLength(FLOWS[r.app].length);
      for (const s of r.steps) expect(s.pctOfStart).toBe(0);
    }
  });

  it("formats a readable table", () => {
    const text = formatFunnel(buildFunnel([ev("A", "home"), ev("A", "dob")]));
    expect(text).toContain("MOBILE  started 1");
    expect(text).toMatch(/dob\s+1\s+1\s+100\.0%/);
  });
});

describe("step tracker never starves the real request", () => {
  afterEach(() => vi.useRealTimers());

  it("caps in-flight tracking calls when the endpoint hangs, and frees the slots after the timeout", () => {
    vi.useFakeTimers();
    const send = vi.fn(() => new Promise<never>(() => {}));
    const t = createStepTracker(send);
    for (const step of ["home", "dob", "sport", "frequency", "level", "goals"]) t.track(step, "view");
    expect(send).toHaveBeenCalledTimes(MAX_IN_FLIGHT);
    expect(MAX_IN_FLIGHT).toBeLessThan(6); // a browser keeps ~6 connections per host: leave room for the save
    vi.advanceTimersByTime(EVENT_TIMEOUT_MS + 1);
    t.track("questions_view", "view");
    expect(send).toHaveBeenCalledTimes(MAX_IN_FLIGHT + 1);
  });

  it("frees a slot as soon as a request settles", async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const t = createStepTracker(send);
    for (let i = 0; i < 3; i++) t.track("s" + i, "view");
    await new Promise((r) => setTimeout(r, 5));
    t.track("s3", "view");
    expect(send).toHaveBeenCalledTimes(4);
  });

  it("dropping an over-cap event does not throw", () => {
    const t = createStepTracker(() => new Promise(() => {}));
    expect(() => {
      for (let i = 0; i < 10; i++) t.track("s" + i, "view");
    }).not.toThrow();
  });
});
