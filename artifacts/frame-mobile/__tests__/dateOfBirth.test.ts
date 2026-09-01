import { describe, expect, it } from "vitest";
import {
  ageFromDateOfBirth,
  dateOfBirthFromParts,
  normaliseDateOfBirthPart,
} from "../lib/dateOfBirth";

const today = new Date("2026-09-01T12:00:00.000Z");

describe("dateOfBirthFromParts", () => {
  it("builds the existing ISO payload without requiring typed hyphens", () => {
    expect(
      dateOfBirthFromParts({ day: "7", month: "6", year: "1990" }, today),
    ).toBe("1990-06-07");
  });

  it("rejects impossible and future dates", () => {
    expect(
      dateOfBirthFromParts({ day: "31", month: "2", year: "2000" }, today),
    ).toBeNull();
    expect(
      dateOfBirthFromParts({ day: "2", month: "9", year: "2026" }, today),
    ).toBeNull();
  });

  it("accepts leap days only in leap years", () => {
    expect(
      dateOfBirthFromParts({ day: "29", month: "2", year: "2000" }, today),
    ).toBe("2000-02-29");
    expect(
      dateOfBirthFromParts({ day: "29", month: "2", year: "2001" }, today),
    ).toBeNull();
  });
});

describe("DOB input helpers", () => {
  it("keeps only the digits each field can hold", () => {
    expect(normaliseDateOfBirthPart("1-2", "day")).toBe("12");
    expect(normaliseDateOfBirthPart("1990abc", "year")).toBe("1990");
  });

  it("shows the correct whole-year age", () => {
    expect(ageFromDateOfBirth("1990-09-01", today)).toBe(36);
    expect(ageFromDateOfBirth("1990-09-02", today)).toBe(35);
  });
});