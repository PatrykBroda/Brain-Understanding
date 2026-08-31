import { describe, expect, it } from "vitest";
import { shouldApplyTranscript } from "../lib/voiceTranscript";

describe("shouldApplyTranscript", () => {
  it("accepts non-empty results while a voice session is active", () => {
    expect(shouldApplyTranscript(true, "Just testing this")).toBe(true);
  });

  it("rejects a late result after sending cancelled the voice session", () => {
    expect(shouldApplyTranscript(false, "Just testing this")).toBe(false);
  });

  it("rejects empty and non-text results", () => {
    expect(shouldApplyTranscript(true, "")).toBe(false);
    expect(shouldApplyTranscript(true, null)).toBe(false);
  });
});
