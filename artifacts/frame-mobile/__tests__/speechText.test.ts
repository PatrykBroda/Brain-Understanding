import { describe, it, expect } from "vitest";
import { speechText, speechChunks, parseVoicePrefs } from "../lib/speechText";

describe("speechText", () => {
  it("strips [[links]] to their display text", () => {
    expect(speechText("Work on [[Axis control|your axis]] and [[Aftershock]].")).toBe("Work on your axis and Aftershock.");
  });
  it("drops a half-streamed link", () => {
    expect(speechText("Breathe out slowly [[Para")).toBe("Breathe out slowly");
  });
  it("strips bold, italics, headings, bullets and numbering", () => {
    const out = speechText("## Plan\n\n**Do this** and *that*:\n- one\n- two\n1. three");
    expect(out).not.toMatch(/[*#]|^\s*-/);
    expect(out).toContain("Do this and that");
    expect(out).toContain("one");
    expect(out).toContain("three");
  });
  it("removes structured cards, urls and keeps link text", () => {
    const out = speechText('Try this.\n```drill\n{"name":"x"}\n```\nSee [notes](https://a.b/c) or https://x.y');
    expect(out).toBe("Try this. See notes or");
  });
  it("does not mangle snake_case or multiplication", () => {
    expect(speechText("use snake_case_word and 3*4")).toBe("use snake_case_word and 3*4");
  });
  it("returns empty for blocks-only content", () => {
    expect(speechText('```breath\n{"a":1}\n```')).toBe("");
  });
});

describe("speechChunks", () => {
  it("keeps short text whole and splits long text on sentences", () => {
    expect(speechChunks("Hi there.")).toEqual(["Hi there."]);
    const long = Array.from({ length: 10 }, (_, i) => `Sentence number ${i}.`).join(" ");
    const parts = speechChunks(long, 50);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.every((p) => p.length <= 50)).toBe(true);
    expect(parts.join(" ").replace(/\s+/g, " ")).toBe(long);
  });
  it("hard-splits a single oversized sentence", () => {
    expect(speechChunks("a".repeat(25), 10).every((p) => p.length <= 10)).toBe(true);
  });
});

describe("parseVoicePrefs", () => {
  it("defaults on and tolerates junk", () => {
    expect(parseVoicePrefs(null)).toEqual({ enabled: true });
    expect(parseVoicePrefs("{bad")).toEqual({ enabled: true });
    expect(parseVoicePrefs('{"enabled":false}')).toEqual({ enabled: false });
    expect(parseVoicePrefs('{"enabled":"no"}')).toEqual({ enabled: true });
  });
});
