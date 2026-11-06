import { describe, expect, it } from "vitest";
import { buildWeeklyRecap, computeStreak, trendOf } from "../lib/streak";

describe("computeStreak", () => {
  it("is zero with no check-ins", () => {
    expect(computeStreak([], "2026-11-06")).toEqual({ current: 0, longest: 0, checkedInToday: false });
  });
  it("counts consecutive days ending today", () => {
    const s = computeStreak(["2026-11-04", "2026-11-05", "2026-11-06"], "2026-11-06");
    expect(s).toEqual({ current: 3, longest: 3, checkedInToday: true });
  });
  it("keeps the run alive while today is still open", () => {
    const s = computeStreak(["2026-11-04", "2026-11-05"], "2026-11-06");
    expect(s.current).toBe(2);
    expect(s.checkedInToday).toBe(false);
  });
  it("breaks after a missed whole day", () => {
    const s = computeStreak(["2026-11-03", "2026-11-04"], "2026-11-06");
    expect(s.current).toBe(0);
    expect(s.longest).toBe(2);
  });
  it("tracks longest separately from current and ignores future/duplicate dates", () => {
    const s = computeStreak(
      ["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-03", "2026-11-06", "2026-11-09"],
      "2026-11-06",
    );
    expect(s).toEqual({ current: 1, longest: 3, checkedInToday: true });
  });
  it("crosses month and year boundaries", () => {
    const s = computeStreak(["2026-12-31", "2027-01-01"], "2027-01-01");
    expect(s.current).toBe(2);
  });
});

describe("buildWeeklyRecap", () => {
  const c = (date: string, v: number) => ({ date, sleep: v, energy: v, soreness: v, stress: v });
  it("averages this week vs the previous and reports the trend", () => {
    const r = buildWeeklyRecap(
      "2026-11-08",
      [c("2026-11-02", 70), c("2026-11-08", 80), c("2026-10-30", 60), c("2026-10-27", 50)],
      [
        { date: "2026-11-03", completed: true },
        { date: "2026-11-05", completed: false },
        { date: "2026-10-30", completed: true },
      ],
    );
    expect(r.start).toBe("2026-11-02");
    expect(r.checkins).toBe(2);
    expect(r.avgState).toBe(75);
    expect(r.prevAvgState).toBe(55);
    expect(r.trend).toBe("up");
    expect(r.sessionsPlanned).toBe(2);
    expect(r.sessionsCompleted).toBe(1);
  });
  it("is unknown with no prior data and empty-safe", () => {
    const r = buildWeeklyRecap("2026-11-08", [], []);
    expect(r).toMatchObject({ avgState: null, trend: "unknown", sessionsPlanned: 0, checkins: 0 });
  });
  it("trendOf uses a 3-point steady band", () => {
    expect(trendOf(72, 70)).toBe("steady");
    expect(trendOf(66, 70)).toBe("down");
    expect(trendOf(null, 70)).toBe("unknown");
  });
});
