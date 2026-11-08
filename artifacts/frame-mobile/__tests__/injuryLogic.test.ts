import { describe, it, expect } from "vitest";
import {
  nextSeverity,
  groupByDay,
  todayByArea,
  todaySummary,
  areaLabel,
  severityLabel,
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
