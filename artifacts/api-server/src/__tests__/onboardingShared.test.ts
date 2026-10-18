/**
 * The shared onboarding package (@workspace/onboarding): the canonical value
 * set, the normaliser that maps every older spelling onto it, the 4-question
 * personality composition, and the funnel aggregation. One test file for the
 * package, kept next to the server tests that consume it.
 */
import { describe, expect, it } from "vitest";
import {
  ALL_LEVELS,
  FLOWS,
  FREQUENCIES,
  QUESTIONS,
  SPORTS,
  buildFunnel,
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

describe("step keys", () => {
  it("clients may report real steps but not the server-only ones", () => {
    expect(isClientStep("mobile", "q_tired")).toBe(true);
    expect(isClientStep("mobile", "details")).toBe(false);
    expect(isClientStep("coach", "details")).toBe(true);
    expect(isClientStep("coach", "signup")).toBe(false);
    expect(isClientStep("coach", "finish")).toBe(false);
    expect(isClientStep("mobile", "nope")).toBe(false);
  });
});

describe("funnel aggregation", () => {
  const ev = (userId: string, step: string, event = "view", app = "mobile") => ({ userId, app, step, event });

  it("counts people reached and dropped per step, in flow order", () => {
    const rows = [
      // A: signs up, quits on the date of birth
      ev("A", "signup", "complete"),
      ev("A", "name"),
      ev("A", "name", "complete"),
      ev("A", "dob"),
      // B: reaches the quiz and quits on the second question
      ev("B", "signup", "complete"),
      ev("B", "name"),
      ev("B", "dob"),
      ev("B", "sport"),
      ev("B", "frequency"),
      ev("B", "q_tired"),
      ev("B", "q_tired", "complete"),
      ev("B", "q_imposed"),
      // C: finishes
      ev("C", "signup", "complete"),
      ev("C", "goals"),
      ev("C", "finish", "complete"),
    ];
    const [mobile, coach] = buildFunnel(rows);
    expect(mobile.app).toBe("mobile");
    expect(mobile.started).toBe(3);
    expect(mobile.finished).toBe(1);
    const row = (s: string) => mobile.steps.find((x) => x.step === s)!;
    expect(row("signup")).toMatchObject({ reached: 3, dropped: 0 });
    expect(row("name")).toMatchObject({ reached: 3 });
    expect(row("dob")).toMatchObject({ reached: 3, dropped: 1 }); // A stopped here
    expect(row("sport")).toMatchObject({ reached: 2 });
    expect(row("q_tired")).toMatchObject({ reached: 2, dropped: 0 });
    expect(row("q_imposed")).toMatchObject({ reached: 2, dropped: 1 }); // B stopped here
    expect(row("q_proud")).toMatchObject({ reached: 1 });
    // C resumed straight into goals (a draft): still counted as having passed every earlier step.
    expect(row("goals")).toMatchObject({ reached: 1, dropped: 0 });
    expect(row("finish")).toMatchObject({ reached: 1, dropped: 0 });
    expect(row("dob").pctOfStart).toBe(100);
    expect(row("goals").pctOfStart).toBeCloseTo(33.3, 1);
    expect(coach.started).toBe(0);
  });

  it("sums to the number who started: dropped across steps + finished", () => {
    const rows = [ev("A", "name"), ev("B", "dob"), ev("C", "finish", "complete"), ev("D", "q_chaos")];
    const [mobile] = buildFunnel(rows);
    const dropped = mobile.steps.reduce((n, s) => n + s.dropped, 0);
    expect(dropped + mobile.finished).toBe(mobile.started);
  });

  it("keeps the two apps apart and ignores unknown steps, apps and duplicate events", () => {
    const rows = [
      ev("A", "welcome", "view", "coach"),
      ev("A", "welcome", "view", "coach"),
      ev("A", "q_tired", "view", "coach"),
      ev("B", "name", "view", "mobile"),
      ev("B", "bogus", "view", "mobile"),
      ev("C", "name", "view", "desktop"),
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
    const text = formatFunnel(buildFunnel([ev("A", "name"), ev("A", "dob")]));
    expect(text).toContain("MOBILE  started 1");
    expect(text).toMatch(/dob\s+1\s+1\s+100\.0%/);
  });
});
