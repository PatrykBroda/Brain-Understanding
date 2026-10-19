import { describe, expect, it } from "vitest";
import { buildFirstReplyBlock, buildTodayBlock, type CoachDayContext } from "../lib/coachContext";
import { buildDynamicContext } from "../lib/synochi";

function ctx(over: Partial<CoachDayContext["view"]> & { recent?: CoachDayContext["recentCheckins"] } = {}): CoachDayContext {
  const { recent, ...view } = over;
  return {
    now: new Date("2026-10-20T11:00:00Z"),
    tz: "Asia/Bangkok",
    today: "2026-10-20",
    recentCheckins: recent ?? [],
    view: {
      date: "2026-10-20",
      timezone: "Asia/Bangkok",
      fresh: false,
      state: { name: null, source: "", asOf: null, current: false },
      focus: null,
      readiness: { today: null, latest: null },
      disclosure: { code: "no_info_ever", message: "", action: "check_in" },
      history: [],
      ...view,
    },
  };
}

describe("today block", () => {
  it("never lets an old check-in stand in for today's", () => {
    const out = buildTodayBlock(ctx({ readiness: { today: null, latest: { date: "2026-10-17", score: 72, daysAgo: 3 } } }));
    expect(out).toContain("Sat 17 Oct");
    expect(out).toContain("3 days ago");
    expect(out).toContain("NOT today's state");
  });
  it("states the date in the athlete's timezone", () => {
    expect(buildTodayBlock(ctx())).toMatch(/Tue,? 20 Oct 2026/);
    expect(buildTodayBlock(ctx())).toContain("Asia/Bangkok");
  });
  it("says there is no fresh State instead of presenting the last one as current", () => {
    const out = buildTodayBlock(ctx({ state: { name: "Volatile", source: "x", asOf: "2026-10-18", current: false } }));
    expect(out).toContain("no fresh read");
    expect(out).toContain("do not present it as current");
  });
});

describe("dynamic context", () => {
  const fighter = { name: "A", age: 30, art: "BJJ", primarySport: "bjj", level: "Blue", trainingFrequency: "3-4x / week", gym: "", competes: false, goals: "", weaknesses: "", bio: "", personality: "Slips imposed pressure and re-angles.", spiritAnimal: "", spiritAnimalTagline: "" } as never;
  it("includes the blocks and the onboarding personality", () => {
    const out = buildDynamicContext(fighter, [], [], [], null, { todayBlock: "# Today — X", firstReplyBlock: buildFirstReplyBlock() });
    expect(out).toContain("# Today — X");
    expect(out).toContain("# First coaching reply");
    expect(out).toContain("Slips imposed pressure");
  });
  it("omits them when not given", () => {
    const out = buildDynamicContext(fighter, [], [], [], null);
    expect(out).not.toContain("# Today");
    expect(out).not.toContain("# First coaching reply");
  });
});
