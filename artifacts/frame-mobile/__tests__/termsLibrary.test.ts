import { describe, expect, it, vi } from "vitest";
vi.mock("@react-native-async-storage/async-storage", () => ({ default: {} }));
import { addMetTerm, parseMetTerms } from "../lib/termsLibrary";
import { lookupConcept } from "../lib/glossary";

describe("lookupConcept", () => {
  it("finds exact and prefixed titles, and returns undefined without an explanation", () => {
    expect(lookupConcept("Frame Integrity")?.key).toBe("frame integrity");
    expect(lookupConcept("MECHANISM - Tilt")?.key).toBe("tilt");
    expect(lookupConcept("KAIZEN - Stability-first progression")).toBeUndefined();
    expect(lookupConcept("constructor")).toBeUndefined();
  });
});

describe("terms library", () => {
  const now = new Date("2026-01-01T00:00:00Z");
  it("adds once, case-insensitively", () => {
    const a = addMetTerm([], "Tilt", "Tilt", now);
    expect(a).toHaveLength(1);
    expect(addMetTerm(a, "tilt", "tilt", now)).toBe(a);
  });
  it("parses defensively", () => {
    expect(parseMetTerms(null)).toEqual([]);
    expect(parseMetTerms("nope")).toEqual([]);
    expect(parseMetTerms('[{"key":"a","term":"A","firstSeen":"x"},{"bad":1}]')).toHaveLength(1);
  });
});
