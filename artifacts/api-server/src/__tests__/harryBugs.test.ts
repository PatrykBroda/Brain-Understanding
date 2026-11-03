import { describe, it, expect, vi } from "vitest";

vi.mock("@workspace/db", () => ({
  db: {},
  competitionsTable: {},
  dailyCheckinsTable: {},
}));
vi.mock("../lib/dailyContext", () => ({
  getDailyView: vi.fn(),
  readinessBand: () => "ok",
  readinessGuidance: () => "",
  readinessScore: () => 50,
}));

import { pressureFor, competitionPromptBlock } from "../lib/competitionService";
import { buildCheckinOnlyBlock } from "../lib/coachContext";
import type { Competition } from "@workspace/db";

function comp(eventDate: string, weighInDate: string | null = null): Competition {
  return {
    id: 1,
    fighterId: 1,
    eventName: "Test Open",
    eventDate: new Date(eventDate),
    weighInDate: weighInDate ? new Date(weighInDate) : null,
    targetWeight: "",
    status: "scheduled",
  } as unknown as Competition;
}

describe("days-out is one calendar-day count in the athlete's timezone", () => {
  const event = comp("2026-12-03T00:00:00Z");

  it("counts 30 days from 3 Nov regardless of the hour", () => {
    expect(pressureFor(event, new Date("2026-11-03T00:30:00Z"), "UTC").daysToEvent).toBe(30);
    expect(pressureFor(event, new Date("2026-11-03T23:30:00Z"), "UTC").daysToEvent).toBe(30);
  });

  it("uses the athlete's local date, not UTC", () => {
    const now = new Date("2026-11-03T23:30:00Z");
    // Auckland is already 4 Nov, Los Angeles is still 3 Nov.
    expect(pressureFor(event, now, "Pacific/Auckland").daysToEvent).toBe(29);
    expect(pressureFor(event, now, "America/Los_Angeles").daysToEvent).toBe(30);
  });

  it("is stable across repeated calls within a day (no ms-based drift)", () => {
    const a = pressureFor(event, new Date("2026-11-03T06:00:00Z"), "Europe/London").daysToEvent;
    const b = pressureFor(event, new Date("2026-11-03T20:00:00Z"), "Europe/London").daysToEvent;
    expect(a).toBe(b);
  });

  it("is 0 on the event day and never negative", () => {
    expect(pressureFor(event, new Date("2026-12-03T12:00:00Z"), "UTC").daysToEvent).toBe(0);
    expect(pressureFor(event, new Date("2026-12-10T12:00:00Z"), "UTC").daysToEvent).toBe(0);
  });

  it("computes the weigh-in on the same basis", () => {
    const c = comp("2026-12-03T00:00:00Z", "2026-12-02T00:00:00Z");
    const p = pressureFor(c, new Date("2026-11-03T12:00:00Z"), "UTC");
    expect(p.daysToEvent).toBe(30);
    expect(p.daysToWeighIn).toBe(29);
  });
});

describe("competition prompt block", () => {
  it("states the countdown, both dates, and forbids recomputing", () => {
    const p = pressureFor(comp("2026-12-03T00:00:00Z"), new Date("2026-11-03T12:00:00Z"), "UTC");
    const block = competitionPromptBlock(p);
    expect(block).toContain("COUNTDOWN: 30 day(s)");
    expect(block).toContain("2026-12-03");
    expect(block).toContain("2026-11-03");
    expect(block).toMatch(/Never work out, estimate or change it/);
  });
});

describe("check-in-only fallback block", () => {
  const now = new Date("2026-11-03T16:05:00Z");

  it("reports a logged check-in with its numbers and the authority rule", () => {
    const block = buildCheckinOnlyBlock({ sleep: 70, energy: 60, soreness: 80, stress: 90 }, "2026-11-03", "UTC", now);
    expect(block).toContain("check-in logged TODAY (2026-11-03)");
    expect(block).toContain("sleep 70");
    expect(block).toContain("outranks anything said earlier");
  });

  it("reports none logged", () => {
    const block = buildCheckinOnlyBlock(null, "2026-11-03", "UTC", now);
    expect(block).toContain("No readiness check-in has been logged today (2026-11-03)");
    expect(block).toContain("has not reached FRAME");
  });
});
