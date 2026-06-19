import { describe, it, expect } from "vitest";
import { toIso } from "../lib/dateUtils";

describe("toIso — valid inputs", () => {
  it("parses a plain YYYY-MM-DD date", () => {
    const result = toIso("2026-07-01");
    expect(result).not.toBeNull();
    const d = new Date(result!);
    expect(d.getUTCFullYear()).toBe(2026);
    expect(d.getUTCMonth()).toBe(6);
    expect(d.getUTCDate()).toBe(1);
    expect(d.getUTCHours()).toBe(0);
    expect(d.getUTCMinutes()).toBe(0);
  });

  it("parses YYYY-MM-DD with THH:MM time suffix", () => {
    const result = toIso("2026-07-01T09:30");
    expect(result).not.toBeNull();
    const d = new Date(result!);
    expect(d.getUTCHours()).toBe(9);
    expect(d.getUTCMinutes()).toBe(30);
  });

  it("parses YYYY-MM-DD with space-separated HH:MM time", () => {
    const result = toIso("2026-07-01 14:00");
    expect(result).not.toBeNull();
    const d = new Date(result!);
    expect(d.getUTCHours()).toBe(14);
    expect(d.getUTCMinutes()).toBe(0);
  });

  it("trims leading and trailing whitespace", () => {
    expect(toIso("  2026-07-01  ")).not.toBeNull();
  });

  it("returns an ISO-8601 string (parseable by Date)", () => {
    const result = toIso("2026-12-31");
    expect(result).not.toBeNull();
    expect(() => new Date(result!).toISOString()).not.toThrow();
  });

  it("handles the first and last valid months correctly", () => {
    expect(toIso("2026-01-01")).not.toBeNull();
    expect(toIso("2026-12-31")).not.toBeNull();
  });

  it("handles midnight time (00:00)", () => {
    const result = toIso("2026-07-01T00:00");
    expect(result).not.toBeNull();
    const d = new Date(result!);
    expect(d.getUTCHours()).toBe(0);
    expect(d.getUTCMinutes()).toBe(0);
  });
});

describe("toIso — malformed / rejected inputs", () => {
  it("returns null for month 13 (overflow)", () => {
    expect(toIso("2026-13-01")).toBeNull();
  });

  it("returns null for day 40 (overflow)", () => {
    expect(toIso("2026-07-40")).toBeNull();
  });

  it("returns null for month 13 AND day 40", () => {
    expect(toIso("2026-13-40")).toBeNull();
  });

  it("returns null for day 0", () => {
    expect(toIso("2026-07-00")).toBeNull();
  });

  it("returns null for an empty string", () => {
    expect(toIso("")).toBeNull();
  });

  it("returns null for free-form date strings", () => {
    expect(toIso("July 1 2026")).toBeNull();
    expect(toIso("01/07/2026")).toBeNull();
  });

  it("returns null for partial patterns (YYYY-MM only)", () => {
    expect(toIso("2026-07")).toBeNull();
  });

  it("returns null when the day overflows the month (Feb 30)", () => {
    expect(toIso("2026-02-30")).toBeNull();
  });

  it("returns null when the day overflows the month (Apr 31)", () => {
    expect(toIso("2026-04-31")).toBeNull();
  });

  it("returns null for a date with only time and no date", () => {
    expect(toIso("T09:30")).toBeNull();
  });

  it("returns null for month 00", () => {
    expect(toIso("2026-00-01")).toBeNull();
  });
});
