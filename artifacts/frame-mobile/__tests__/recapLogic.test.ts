import { describe, expect, it } from "vitest";
import {
  isRecapTap, parseRecapPrefs, recapLines, shouldShowRecapCard, streakLabel, weekKey,
  type WeeklyRecapData,
} from "../lib/recapLogic";

const on = { enabled: true, dismissedFor: null };
// 2026-11-01 is a Sunday.
describe("recap card", () => {
  it("shows Sunday and Monday only", () => {
    expect(shouldShowRecapCard(on, "2026-11-01")).toBe(true);
    expect(shouldShowRecapCard(on, "2026-11-02")).toBe(true);
    expect(shouldShowRecapCard(on, "2026-11-03")).toBe(false);
    expect(shouldShowRecapCard(on, "2026-11-07")).toBe(false);
  });
  it("respects opt-out and dismissal", () => {
    expect(shouldShowRecapCard({ ...on, enabled: false }, "2026-11-01")).toBe(false);
    expect(shouldShowRecapCard({ enabled: true, dismissedFor: "2026-11-01" }, "2026-11-02")).toBe(false);
    expect(shouldShowRecapCard({ enabled: true, dismissedFor: "2026-10-25" }, "2026-11-01")).toBe(true);
  });
  it("weekKey is the Sunday", () => {
    expect(weekKey("2026-11-01")).toBe("2026-11-01");
    expect(weekKey("2026-11-02")).toBe("2026-11-01");
  });
});

describe("prefs + taps", () => {
  it("defaults to enabled and survives bad JSON", () => {
    expect(parseRecapPrefs(null).enabled).toBe(true);
    expect(parseRecapPrefs("{bad").enabled).toBe(true);
    expect(parseRecapPrefs('{"enabled":false}').enabled).toBe(false);
    expect(parseRecapPrefs('{"dismissedFor":"nope"}').dismissedFor).toBeNull();
  });
  it("detects recap taps", () => {
    expect(isRecapTap({ route: "recap" })).toBe(true);
    expect(isRecapTap({ route: "checkin" })).toBe(false);
    expect(isRecapTap(null)).toBe(false);
  });
});

describe("copy", () => {
  it("streak labels", () => {
    expect(streakLabel(null)).toBeNull();
    expect(streakLabel({ current: 3, longest: 5, checkedInToday: true })).toBe("3-day streak");
    expect(streakLabel({ current: 3, longest: 5, checkedInToday: false })).toContain("keep it");
    expect(streakLabel({ current: 0, longest: 0, checkedInToday: false })).toContain("start a streak");
  });
  it("recap lines include focus and avoid internal terms", () => {
    const r: WeeklyRecapData = { start: "a", end: "b", sessionsPlanned: 4, sessionsCompleted: 3, checkins: 5, avgState: 70, prevAvgState: 60, trend: "up" };
    const lines = recapLines(r, "Footwork");
    expect(lines[0]).toBe("3 of 4 sessions completed.");
    expect(lines[1]).toContain("up from 60");
    expect(lines[2]).toBe("Focus for next week: Footwork");
    expect(recapLines({ ...r, avgState: null, trend: "unknown" }, null)).toHaveLength(2);
    expect(lines.join(" ").toLowerCase()).not.toMatch(/synochi|vault|node/);
  });
});
