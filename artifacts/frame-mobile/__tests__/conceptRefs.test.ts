import { describe, it, expect } from "vitest";
import { lookupConcept, parseConceptRef, stripDanglingRef } from "../lib/glossary";

describe("parseConceptRef", () => {
  it("returns the alias for display and the target for lookup", () => {
    expect(parseConceptRef("Frame Integrity|your frame")).toEqual({ title: "Frame Integrity", display: "your frame" });
  });
  it("drops #section anchors", () => {
    expect(parseConceptRef("Aftershock#Recovery")).toEqual({ title: "Aftershock", display: "Aftershock" });
  });
  it("passes plain titles through", () => {
    expect(parseConceptRef(" Axis  Control ")).toEqual({ title: "Axis Control", display: "Axis Control" });
  });
});

describe("lookupConcept with aliases", () => {
  it("resolves Title|alias by its target", () => {
    expect(lookupConcept("Aftershock|the crash after")?.key).toBe("aftershock");
  });
  it("resolves vault title variants", () => {
    expect(lookupConcept("Aftershock Phase")?.key).toBe("aftershock");
  });
  it("still misses unknown terms", () => {
    expect(lookupConcept("Nonexistent Thing|x")).toBeUndefined();
  });
});

describe("stripDanglingRef", () => {
  it("hides an unterminated [[ while streaming", () => {
    expect(stripDanglingRef("Try [[Axis Con")).toBe("Try ");
  });
  it("leaves closed refs alone", () => {
    expect(stripDanglingRef("Try [[Axis Control]] now")).toBe("Try [[Axis Control]] now");
  });
});
