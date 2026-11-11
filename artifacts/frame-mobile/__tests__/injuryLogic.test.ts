import { describe, it, expect } from "vitest";
import {
  nextSeverity,
  groupByDay,
  todayByArea,
  todaySummary,
  areaLabel,
  severityLabel,
  kindLabel,
  dateProblem,
  splitByStatus,
  isRecovered,
  INJURY_AREAS,
  type InjuryRow,
} from "../lib/injuryLogic";

const r = (id: number, date: string, area: string, severity: number): InjuryRow => ({ id, date, area, severity, note: "" });

describe("injury logic", () => {
  it("cycles severity niggle -> sore -> injured -> removed", () => {
    expect(nextSeverity(undefined)).toBe(1);
    expect(nextSeverity(1)).toBe(2);
    expect(nextSeverity(2)).toBe(3);
    expect(nextSeverity(3)).toBeNull();
  });
  it("keys today's entries by area", () => {
    const m = todayByArea([r(1, "2026-11-06", "knee", 2), r(2, "2026-11-05", "ribs", 1)], "2026-11-06");
    expect(Object.keys(m)).toEqual(["knee"]);
  });
  it("groups by day newest first, worst first within a day", () => {
    const g = groupByDay([r(1, "2026-11-04", "knee", 1), r(2, "2026-11-06", "ribs", 1), r(3, "2026-11-06", "back", 3)]);
    expect(g.map((d) => d.date)).toEqual(["2026-11-06", "2026-11-04"]);
    expect(g[0]!.rows.map((x) => x.area)).toEqual(["back", "ribs"]);
  });
  it("summarises today, worst first, and is empty with none", () => {
    expect(todaySummary([r(1, "2026-11-06", "ribs", 1), r(2, "2026-11-06", "wrist_hand", 3)], "2026-11-06")).toBe(
      "Wrist / hand: injured, Ribs: niggle",
    );
    expect(todaySummary([], "2026-11-06")).toBe("");
  });
  it("labels fall back to the raw key", () => {
    expect(areaLabel("knee")).toBe("Knee");
    expect(areaLabel("zzz")).toBe("zzz");
    expect(severityLabel(9)).toBe("Logged");
    expect(INJURY_AREAS).toHaveLength(12);
  });
});

describe("injury status and form helpers", () => {
  const rec = (id: number, date: string, area: string, severity: number, status: string): InjuryRow => ({ id, date, area, severity, note: "", kind: "strain", status });
  it("a recovered entry today is not an active chip", () => {
    const m = todayByArea([rec(1, "2026-11-06", "knee", 2, "recovered"), rec(2, "2026-11-06", "ribs", 1, "active")], "2026-11-06");
    expect(Object.keys(m)).toEqual(["ribs"]);
  });
  it("rows from an older server (no status) count as active", () => {
    expect(isRecovered(r(1, "2026-11-06", "knee", 2))).toBe(false);
    expect(splitByStatus([r(1, "2026-11-06", "knee", 2)]).active).toHaveLength(1);
  });
  it("splits active (worst first) from recovered (newest first)", () => {
    const { active, recovered } = splitByStatus([
      rec(1, "2026-11-01", "knee", 1, "active"),
      rec(2, "2026-11-02", "back", 3, "active"),
      rec(3, "2026-10-01", "hip", 2, "recovered"),
      rec(4, "2026-10-20", "neck", 2, "recovered"),
    ]);
    expect(active.map((x) => x.id)).toEqual([2, 1]);
    expect(recovered.map((x) => x.id)).toEqual([4, 3]);
  });
  it("validates the typed date like the server", () => {
    expect(dateProblem("2026-11-06", "2026-11-11")).toBeNull();
    expect(dateProblem("2026-11-12", "2026-11-11")).toMatch(/future/);
    expect(dateProblem("2026-02-31", "2026-11-11")).toMatch(/real date/);
    expect(dateProblem("yesterday", "2026-11-11")).toMatch(/real date/);
  });
  it("labels kinds", () => {
    expect(kindLabel("sprain")).toBe("Sprain");
    expect(kindLabel(undefined)).toBe("Other");
  });
});
