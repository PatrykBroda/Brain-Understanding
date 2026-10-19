import { describe, expect, it } from "vitest";
import {
  addDays,
  daysBetween,
  isValidTimeZone,
  localDate,
  localDayBounds,
  startOfLocalDay,
} from "../lib/localTime";
import {
  deriveFocus,
  deriveState,
  disclosureFor,
  readinessBand,
  readinessGuidance,
  readinessScore,
} from "../lib/dailyContext";

describe("local day maths", () => {
  it("rolls over at the athlete's midnight, not UTC's", () => {
    // 18:30 UTC on 19 Oct is 01:30 on 20 Oct in Bangkok (UTC+7) and 11:30 on 19 Oct in Los Angeles (UTC-7).
    const t = new Date("2026-10-19T18:30:00Z");
    expect(localDate(t, "UTC")).toBe("2026-10-19");
    expect(localDate(t, "Asia/Bangkok")).toBe("2026-10-20");
    expect(localDate(t, "America/Los_Angeles")).toBe("2026-10-19");
  });

  it("finds the UTC instants a local day starts and ends, across a DST change", () => {
    const { start, end } = localDayBounds("2026-10-20", "Asia/Bangkok");
    expect(start.toISOString()).toBe("2026-10-19T17:00:00.000Z");
    expect(end.toISOString()).toBe("2026-10-20T17:00:00.000Z");
    // London falls back on Sun 25 Oct 2026: that local day is 25 hours long.
    const dst = localDayBounds("2026-10-25", "Europe/London");
    expect((dst.end.getTime() - dst.start.getTime()) / 3_600_000).toBe(25);
    expect(startOfLocalDay("2026-10-25", "Europe/London").toISOString()).toBe("2026-10-24T23:00:00.000Z");
  });

  it("validates timezone names and counts days", () => {
    expect(isValidTimeZone("Europe/London")).toBe(true);
    expect(isValidTimeZone("Not/AZone")).toBe(false);
    expect(isValidTimeZone("")).toBe(false);
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(daysBetween("2026-10-17", "2026-10-20")).toBe(3);
  });
});

describe("readiness", () => {
  const good = { sleep: 85, energy: 80, soreness: 80, stress: 75 };
  const bad = { sleep: 30, energy: 35, soreness: 40, stress: 50 };
  it("bands and guidance follow the logged scores", () => {
    expect(readinessScore(good)).toBe(80);
    expect(readinessBand(80)).toBe("primed");
    expect(readinessBand(44)).toBe("depleted");
    expect(readinessGuidance(bad)).toMatch(/Depleted/);
    expect(readinessGuidance(bad)).toMatch(/sleep 30/);
    expect(readinessGuidance(bad)).toMatch(/no hard sparring/);
    expect(readinessGuidance(good)).toMatch(/Primed/);
  });
});

describe("state", () => {
  const base = { checkin: null, messagesToday: [], recentNotes: [], activeNoteCount: 0 };
  it("is Dormant with nothing to read", () => {
    expect(deriveState(base).state).toBe("Dormant");
  });
  it("moves the day the athlete says something, not stuck on an old note", () => {
    const oldNote = deriveState({ ...base, recentNotes: ["fragments under top pressure"], activeNoteCount: 4 });
    expect(oldNote.state).toBe("Volatile");
    const todaysWords = deriveState({
      ...base,
      recentNotes: ["fragments under top pressure"],
      activeNoteCount: 4,
      messagesToday: ["Felt calm and controlled in sparring today"],
    });
    expect(todaysWords.state).toBe("Composed");
  });
  it("a depleted check-in reads Recovering, a high-stress one Tight", () => {
    expect(deriveState({ ...base, checkin: { sleep: 30, energy: 35, soreness: 40, stress: 45 } }).state).toBe("Recovering");
    expect(deriveState({ ...base, checkin: { sleep: 80, energy: 80, soreness: 80, stress: 30 } }).state).toBe("Tight");
    expect(deriveState({ ...base, checkin: { sleep: 80, energy: 80, soreness: 80, stress: 80 } }).state).toBe("Stable");
  });
  it("very low sleep or energy alone reads Recovering even when the average looks middling", () => {
    const r = deriveState({ ...base, checkin: { sleep: 20, energy: 90, soreness: 90, stress: 90 } });
    expect(r.state).toBe("Recovering");
    expect(r.source).toMatch(/very low sleep or energy/);
  });
  it("says what it was read from", () => {
    expect(deriveState({ ...base, checkin: { sleep: 30, energy: 35, soreness: 40, stress: 45 } }).source).toMatch(/check-in/);
  });
});

describe("focus", () => {
  const sig = {
    checkin: null,
    today: "2026-10-20",
    notesToday: [],
    weaknesses: [],
    goalsText: "",
    weaknessesText: "",
    camp: null,
  };
  it("a low check-in turns the focus to recovery and cites the numbers", () => {
    const f = deriveFocus({ ...sig, checkin: { sleep: 30, energy: 35, soreness: 40, stress: 45 } });
    expect(f.kind).toBe("recovery");
    expect(f.because.join(" ")).toMatch(/sleep 30/);
  });
  it("something said today beats the standing weakness", () => {
    const f = deriveFocus({
      ...sig,
      notesToday: [{ category: "pattern", topic: "guard retention", content: "Keeps getting passed when tired" }],
      weaknesses: [{ topic: "takedown defence", content: "Sprawl is late", lastSeen: "2026-10-01", evidenceCount: 3 }],
    });
    expect(f.title).toBe("guard retention");
    expect(f.because[0]).toMatch(/told your coach today/);
  });
  it("falls back to the recorded weakness, then onboarding, then an honest open prompt", () => {
    expect(
      deriveFocus({ ...sig, weaknesses: [{ topic: "takedown defence", content: "Sprawl is late", lastSeen: "2026-10-01", evidenceCount: 3 }] }).title,
    ).toBe("takedown defence");
    expect(deriveFocus({ ...sig, weaknessesText: "cardio, guard" }).kind).toBe("onboarding");
    expect(deriveFocus(sig).kind).toBe("open");
  });
  it("an injury mentioned today shapes the day", () => {
    const f = deriveFocus({ ...sig, notesToday: [{ category: "event", topic: "left knee", content: "Tweaked left knee in rolling" }] });
    expect(f.kind).toBe("recovery");
    expect(f.title).toMatch(/knee/);
  });
});

describe("disclosure", () => {
  it("never claims an old read is current", () => {
    const d = disclosureFor({ fresh: false, hasCheckinToday: false, lastReadDate: "2026-10-19", today: "2026-10-20" });
    expect(d.code).toBe("no_info_today");
    expect(d.action).toBe("check_in");
    expect(d.message).toMatch(/yesterday/);
    expect(d.message).toMatch(/out of date/);
  });
  it("a fresh day with no check-in still invites one", () => {
    expect(disclosureFor({ fresh: true, hasCheckinToday: false, lastReadDate: null, today: "2026-10-20" }).code).toBe("no_checkin_today");
    expect(disclosureFor({ fresh: true, hasCheckinToday: true, lastReadDate: null, today: "2026-10-20" }).code).toBe("none");
    expect(disclosureFor({ fresh: false, hasCheckinToday: false, lastReadDate: null, today: "2026-10-20" }).code).toBe("no_info_ever");
  });
});
