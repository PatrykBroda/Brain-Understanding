import { describe, it, expect } from "vitest";
import { activeInjuries, buildInjuryBlock, injuryInputSchema, injuryPatchSchema, injuryDateProblem } from "../lib/injuryLog";

const T = "2026-11-06";

describe("injuryInputSchema", () => {
  it("accepts a valid entry and trims the note", () => {
    expect(injuryInputSchema.parse({ area: "knee", severity: "2", note: "  tweaky  " })).toEqual({
      area: "knee",
      severity: 2,
      note: "tweaky",
      kind: "other",
      status: "active",
    });
  });
  it("defaults note and rejects bad area / severity / long note", () => {
    expect(injuryInputSchema.parse({ area: "ribs", severity: 1 }).note).toBe("");
    expect(injuryInputSchema.safeParse({ area: "elbowz", severity: 1 }).success).toBe(false);
    expect(injuryInputSchema.safeParse({ area: "ribs", severity: 4 }).success).toBe(false);
    expect(injuryInputSchema.safeParse({ area: "ribs", severity: 0 }).success).toBe(false);
    expect(injuryInputSchema.safeParse({ area: "ribs", severity: 1, note: "x".repeat(301) }).success).toBe(false);
  });
});

describe("injury date / patch validation", () => {
  it("accepts a real date and rejects impossible ones", () => {
    expect(injuryInputSchema.parse({ area: "knee", severity: 1, date: "2026-11-02" }).date).toBe("2026-11-02");
    expect(injuryInputSchema.safeParse({ area: "knee", severity: 1, date: "2026-02-31" }).success).toBe(false);
    expect(injuryInputSchema.safeParse({ area: "knee", severity: 1, date: "yesterday" }).success).toBe(false);
    expect(injuryInputSchema.safeParse({ area: "knee", severity: 1, kind: "broken" }).success).toBe(false);
  });
  it("patch needs at least one field", () => {
    expect(injuryPatchSchema.safeParse({}).success).toBe(false);
    expect(injuryPatchSchema.parse({ status: "recovered" })).toEqual({ status: "recovered" });
  });
  it("blocks future and absurdly old dates", () => {
    expect(injuryDateProblem("2026-11-06", T)).toBeNull();
    expect(injuryDateProblem("2026-11-07", T)).toBeNull(); // timezone slack
    expect(injuryDateProblem("2026-11-12", T)).toMatch(/future/);
    expect(injuryDateProblem("2010-01-01", T)).toMatch(/far back/);
  });
});

describe("activeInjuries", () => {
  it("keeps the newest entry per area, drops future ones, worst first", () => {
    const r = activeInjuries(
      [
        { date: "2026-11-01", area: "knee", severity: 3 },
        { date: "2026-11-05", area: "knee", severity: 1 },
        { date: "2026-11-06", area: "ribs", severity: 2 },
        { date: "2026-11-09", area: "neck", severity: 3 },
      ],
      T,
    );
    expect(r.map((e) => [e.area, e.severity])).toEqual([
      ["ribs", 2],
      ["knee", 1],
    ]);
  });
  it("keeps an old active injury for 90 days but drops older", () => {
    const r = activeInjuries(
      [
        { date: "2026-08-20", area: "back", severity: 3 }, // 78 days
        { date: "2026-07-01", area: "hip", severity: 3 }, // 128 days
      ],
      T,
    );
    expect(r.map((e) => e.area)).toEqual(["back"]);
  });
  it("shows a recent recovery after the active ones, drops an old one", () => {
    const r = activeInjuries(
      [
        { date: "2026-10-20", area: "shin", severity: 3, status: "recovered", resolvedAt: "2026-11-03" },
        { date: "2026-09-01", area: "elbow", severity: 3, status: "recovered", resolvedAt: "2026-09-20" },
        { date: "2026-11-05", area: "knee", severity: 1 },
      ],
      T,
    );
    expect(r.map((e) => e.area)).toEqual(["knee", "shin"]);
  });
});

describe("buildInjuryBlock", () => {
  it("is empty with nothing logged", () => {
    expect(buildInjuryBlock([], T)).toBe("");
  });
  it("lists areas with severity, a dated age and note, and carries the safety rule", () => {
    const b = buildInjuryBlock(
      [
        { date: T, area: "wrist_hand", severity: 3, note: "jammed it" },
        { date: "2026-11-04", area: "knee", severity: 2, kind: "strain" },
      ],
      T,
    );
    expect(b).toContain("today is Fri 6 Nov");
    expect(b).toContain('- wrist/hand: injured (logged Fri 6 Nov, today) — "jammed it"');
    expect(b).toContain("- knee: sore, strain (logged Wed 4 Nov, 2 days ago)");
    expect(b).toMatch(/professional/i);
    expect(b).not.toMatch(/synochi|vault|node/i);
  });
  it("flags a stale active entry and states recoveries", () => {
    const b = buildInjuryBlock(
      [
        { date: "2026-09-20", area: "back", severity: 2 },
        { date: "2026-10-25", area: "shin", severity: 3, status: "recovered", resolvedAt: "2026-11-04" },
      ],
      T,
    );
    expect(b).toContain("back: sore (logged Sun 20 Sept, 47 days ago) — old entry, still marked active");
    expect(b).toContain("shin: marked RECOVERED Wed 4 Nov, 2 days ago");
  });
});
