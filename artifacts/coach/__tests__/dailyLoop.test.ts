import { describe, expect, it } from "vitest";
import { addDaysTo, daysBetweenDates, formatDay, localDateString, msUntilNextLocalMidnight } from "../src/lib/local-day";
import { BAR_DAYS, barSlots, checkinScore } from "../src/lib/readiness-bars";
import { stateDateLine, stateHeadline, type DailyCheckinRow, type TodayView } from "../src/lib/today";
import { CATEGORY_LABEL, formatWeekRange, groupItems, missionErrorMessage, type PlanItem } from "../src/lib/mission";
import { keyboardInset, shouldDismissKeyboard } from "../src/lib/keyboard";
import {
  answeredCount,
  chosenLabel,
  dobPatch,
  frequencyPatch,
  questionPatch,
  sportPatch,
  textPatch,
} from "../src/lib/profile-answers";

describe("local day", () => {
  it("formats the wall-clock date and counts to the next midnight", () => {
    const d = new Date(2026, 9, 20, 23, 30, 0);
    expect(localDateString(d)).toBe("2026-10-20");
    expect(msUntilNextLocalMidnight(d)).toBe(30 * 60 * 1000);
    expect(addDaysTo("2026-10-31", 1)).toBe("2026-11-01");
    expect(daysBetweenDates("2026-10-17", "2026-10-20")).toBe(3);
    expect(formatDay("2026-10-17")).toBe("Sat 17 Oct");
  });
});

const row = (date: string, v: number): DailyCheckinRow => ({
  id: 1, fighterId: 1, checkinDate: date, sleep: v, energy: v, soreness: v, stress: v, restingHr: null, createdAt: "", updatedAt: "",
});

describe("readiness history bars", () => {
  it("shows the last 14 days ending today with gaps as empty slots, never guessed values", () => {
    const slots = barSlots([row("2026-10-20", 80), row("2026-10-17", 60), row("2026-09-01", 50)], "2026-10-20");
    expect(slots).toHaveLength(BAR_DAYS);
    expect(slots.filter((s) => s.checkin).map((s) => s.date)).toEqual(["2026-10-17", "2026-10-20"]);
    expect(slots.find((s) => s.date === "2026-10-18")!.checkin).toBeNull();
  });
  it("each bar maps to its own check-in", () => {
    const slots = barSlots([row("2026-10-17", 60), row("2026-10-19", 90)], "2026-10-20");
    expect(checkinScore(slots.find((s) => s.date === "2026-10-17")!.checkin!)).toBe(60);
    expect(checkinScore(slots.find((s) => s.date === "2026-10-19")!.checkin!)).toBe(90);
  });
});

describe("state headline never presents an old read as today's", () => {
  const base: TodayView["state"] = { name: "Volatile", source: "x", asOf: "2026-10-17", current: false };
  it("old read -> 'No read today' and a date line saying when it was", () => {
    expect(stateHeadline(base)).toBe("No read today");
    expect(stateDateLine(base, formatDay)).toBe("Last read Sat 17 Oct");
    expect(stateHeadline({ ...base, current: true })).toBe("Volatile");
    expect(stateHeadline({ name: null, source: "", asOf: null, current: false })).toBe("No read yet");
  });
});

describe("weekly mission helpers", () => {
  const item = (key: string, category: PlanItem["category"]): PlanItem => ({ key, category, title: key, detail: "d", suggestedDays: "Any", sourceLabel: "s", sourceFactIds: [], sourceCalibrationKeys: [] });
  it("groups in display order and formats the Monday-Sunday week", () => {
    expect(groupItems([item("a", "regulate"), item("b", "fix"), item("c", "fix")]).map((x) => x.category)).toEqual(["fix", "regulate"]);
    expect(CATEGORY_LABEL.fix).toBe("Primary weakness");
    expect(formatWeekRange("2026-10-19T00:00:00.000Z")).toBe("19 Oct – 25 Oct");
  });
  it("uses the server's plain message, else honest generic copy", () => {
    expect(missionErrorMessage({ kind: "server", detail: JSON.stringify({ error: "FRAME is busy right now. Try again in a minute.", code: "AI_BUSY" }) })).toMatch(/busy/);
    expect(missionErrorMessage({ kind: "timeout" })).toMatch(/too long/);
    expect(missionErrorMessage({ kind: "network" })).toMatch(/Check your connection/);
    expect(missionErrorMessage({ kind: "server", detail: "<html>Bad gateway</html>" })).toMatch(/couldn't be built/);
  });
});

describe("keyboard helpers", () => {
  it("only a real keyboard counts, not the browser's address bar", () => {
    expect(keyboardInset(844, 844, 0)).toBe(0);
    expect(keyboardInset(844, 780, 0)).toBe(0);
    expect(keyboardInset(844, 520, 0)).toBe(324);
  });
  it("a tap on empty space puts the keyboard away; a tap on a control or with no field focused does not", () => {
    const field = { matches: (sel: string) => sel.includes("input") };
    const blank = { closest: () => null };
    const button = { closest: () => ({}) };
    expect(shouldDismissKeyboard(field, blank)).toBe(true);
    expect(shouldDismissKeyboard(field, button)).toBe(false);
    expect(shouldDismissKeyboard({ matches: () => false }, blank)).toBe(false);
    expect(shouldDismissKeyboard(null, blank)).toBe(false);
  });
});

describe("Profile questionnaire edits use onboarding's fields and validation", () => {
  const today = new Date("2026-10-20T00:00:00Z");
  it("sport needs its level; frequency, text, date", () => {
    expect(sportPatch("bjj", "")).toMatchObject({ ok: false });
    expect(sportPatch("muay_thai", "Advanced")).toEqual({ ok: true, body: { primarySport: "muay_thai", art: "Muay Thai", level: "Advanced" } });
    expect(frequencyPatch("3-4x / week")).toEqual({ ok: true, body: { trainingFrequency: "3-4x / week" } });
    expect(textPatch("weaknesses", "   ")).toEqual({ ok: true, body: { weaknesses: "" } });
    expect(dobPatch("1995-03-14", today)).toEqual({ ok: true, body: { dateOfBirth: "1995-03-14" } });
    expect(dobPatch("2030-01-01", today)).toMatchObject({ ok: false, error: "That date is in the future." });
    expect(dobPatch("0002-01-01", today)).toMatchObject({ ok: false });
  });
  it("changing one answer sends all of them", () => {
    const current = { onboardingAnswers: { tired: 0, imposed: 1 } };
    expect(questionPatch(current, "chaos", 2)).toEqual({ ok: true, body: { onboardingAnswers: { tired: 0, imposed: 1, chaos: 2 } } });
    expect(questionPatch(current, "chaos", 9)).toMatchObject({ ok: false });
    expect(answeredCount(current)).toBe(2);
    expect(chosenLabel({}, "tired")).toBeNull();
  });
});
