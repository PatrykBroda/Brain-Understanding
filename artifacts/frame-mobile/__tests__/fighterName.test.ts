import { describe, expect, it } from "vitest";
import { NAME_MAX, nameError } from "../lib/fighterName";

describe("nameError", () => {
  it("accepts a normal name, with surrounding spaces", () => {
    expect(nameError("Sasha Petrov")).toBeNull();
    expect(nameError("  Sasha  ")).toBeNull();
  });
  it("rejects empty and whitespace-only names", () => {
    expect(nameError("")).toBe("Enter your name");
    expect(nameError("   \t")).toBe("Enter your name");
  });
  it("allows exactly the max length and rejects one over", () => {
    expect(nameError("a".repeat(NAME_MAX))).toBeNull();
    expect(nameError("a".repeat(NAME_MAX + 1))).not.toBeNull();
  });
});
