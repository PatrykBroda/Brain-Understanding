import { describe, it, expect } from "vitest";
import { activeInjuries, buildInjuryBlock, injuryInputSchema } from "../lib/injuryLog";

const T = "2026-11-06";

describe("injuryInputSchema", () => {
  it("accepts a valid entry and trims the note", () => {
    expect(injuryInputSchema.parse({ area: "knee", severity: "2", note: "  tweaky  " })).toEqual({
      area: "knee",
      severity: 2,
      note: "tweaky",
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

describe("activeInjuries", () => {
  it("keeps the newest entry per area, drops old/future ones, worst first", () => {
    const r = activeInjuries(
      [
        { date: "2026-11-01", area: "knee", severity: 3 },
        { date: "2026-11-05", area: "knee", severity: 1 },
        { date: "2026-11-06", area: "ribs", severity: 2 },
        { date: "2026-10-01", area: "back", severity: 3 },
        { date: "2026-11-09", area: "neck", severity: 3 },
      ],
      T,
    );
    expect(r.map((e) => [e.area, e.severity])).toEqual([
      ["ribs", 2],
      ["knee", 1],
    ]);
  });
});

describe("buildInjuryBlock", () => {
  it("is empty with nothing logged", () => {
    expect(buildInjuryBlock([], T)).toBe("");
  });
  it("lists areas with severity, age and note, and carries the safety rule", () => {
    const b = buildInjuryBlock(
      [
        { date: T, area: "wrist_hand", severity: 3, note: "jammed it" },
        { date: "2026-11-04", area: "knee", severity: 2 },
      ],
      T,
    );
    expect(b).toContain('- wrist/hand: injured (today) — "jammed it"');
    expect(b).toContain("- knee: sore (2 days ago)");
    expect(b).toMatch(/professional/i);
    expect(b).not.toMatch(/synochi|vault|node/i);
  });
});
