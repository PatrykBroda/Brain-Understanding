import { describe, expect, it } from "vitest";
import { addDaysTo, daysBetweenDates, formatDay, localDateString, msUntilNextLocalMidnight } from "../lib/localDay";
import { BAR_DAYS, barSlots, checkinScore } from "../lib/readinessBars";
import { stateDateLine, stateHeadline, type DailyCheckinRow, type TodayView } from "../lib/today";
import { CATEGORY_LABEL, formatWeekRange, groupItems, missionErrorMessage, type PlanItem } from "../lib/mission";

describe("local day", () => {
  it("formats the device's wall-clock date and counts to the next midnight", () => {
    const d = new Date(2026, 9, 20, 23, 30, 0); // 20 Oct 2026 23:30 local
    expect(localDateString(d)).toBe("2026-10-20");
    expect(msUntilNextLocalMidnight(d)).toBe(30 * 60 * 1000);
    expect(localDateString(new Date(2026, 9, 21, 0, 0, 1))).toBe("2026-10-21");
  });
  it("date arithmetic is timezone-free", () => {
    expect(addDaysTo("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDaysTo("2026-03-01", -1)).toBe("2026-02-28");
    expect(daysBetweenDates("2026-10-17", "2026-10-20")).toBe(3);
    expect(formatDay("2026-10-17")).toBe("Sat 17 Oct");
  });
});

const row = (date: string, v: number): DailyCheckinRow => ({
  id: 1,
  fighterId: 1,
  checkinDate: date,
  sleep: v,
  energy: v,
  soreness: v,
  stress: v,
  restingHr: null,
  createdAt: "",
  updatedAt: "",
});

describe("readiness history bars", () => {
  it("shows the last 14 days ending today, with gaps as empty slots, never guessed values", () => {
    const slots = barSlots([row("2026-10-20", 80), row("2026-10-17", 60), row("2026-09-01", 50)], "2026-10-20");
    expect(slots).toHaveLength(BAR_DAYS);
    expect(slots[0]!.date).toBe("2026-10-07");
    expect(slots.at(-1)!.date).toBe("2026-10-20");
    expect(slots.filter((s) => s.checkin).map((s) => s.date)).toEqual(["2026-10-17", "2026-10-20"]);
    expect(slots.find((s) => s.date === "2026-10-18")!.checkin).toBeNull();
  });
  it("each bar maps to its own check-in (tapping a bar opens the right day)", () => {
    const slots = barSlots([row("2026-10-17", 60), row("2026-10-19", 90)], "2026-10-20");
    expect(checkinScore(slots.find((s) => s.date === "2026-10-17")!.checkin!)).toBe(60);
    expect(checkinScore(slots.find((s) => s.date === "2026-10-19")!.checkin!)).toBe(90);
  });
});

describe("state headline never presents an old read as today's", () => {
  const base: TodayView["state"] = { name: "Volatile", source: "x", asOf: "2026-10-17", current: false };
  it("old read -> 'No read today' with the date line saying when it was", () => {
    expect(stateHeadline(base)).toBe("No read today");
    expect(stateDateLine(base, formatDay)).toBe("Last read Sat 17 Oct");
  });
  it("current read shows the state; no read at all says so", () => {
    expect(stateHeadline({ ...base, current: true })).toBe("Volatile");
    expect(stateDateLine({ ...base, current: true }, formatDay)).toBe("Today · Sat 17 Oct");
    expect(stateHeadline({ name: null, source: "", asOf: null, current: false })).toBe("No read yet");
  });
});

describe("weekly mission helpers", () => {
  const item = (key: string, category: PlanItem["category"]): PlanItem => ({
    key, category, title: key, detail: "d", suggestedDays: "Any", sourceLabel: "s",
  });
  it("groups in display order and drops empty groups", () => {
    const g = groupItems([item("a", "regulate"), item("b", "fix"), item("c", "fix")]);
    expect(g.map((x) => x.category)).toEqual(["fix", "regulate"]);
    expect(CATEGORY_LABEL.fix).toBe("Primary weakness");
  });
  it("formats the Monday-Sunday week", () => {
    expect(formatWeekRange("2026-10-19T00:00:00.000Z")).toBe("19 Oct – 25 Oct");
  });
  it("turns every failure into plain words", () => {
    expect(missionErrorMessage(null, true)).toMatch(/too long/);
    expect(missionErrorMessage({ status: 503, message: "FRAME is busy right now. Try again in a minute." }, false)).toMatch(/busy/);
    expect(missionErrorMessage({ status: 500, message: "Request failed with status 500." }, false)).toMatch(/couldn't be built/);
    expect(missionErrorMessage(new Error("Network request failed"), false)).toMatch(/Check your connection/);
  });
});
