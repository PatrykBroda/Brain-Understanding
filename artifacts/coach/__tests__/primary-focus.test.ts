import { describe, expect, it } from "vitest";
import { primaryFocus, primaryStrength } from "../src/lib/primary-focus";
import type { AthleteFact, Fighter } from "../src/lib/api";

const fact = (category: string, topic: string): AthleteFact =>
  ({ category, topic, content: topic, confidence: 0.9, createdAt: "2026-10-22T10:00:00Z" }) as unknown as AthleteFact;

describe("primaryFocus / primaryStrength", () => {
  it("shows the weakness in sentence case", () => {
    const out = primaryFocus({ weaknesses: "" } as unknown as Fighter, [
      fact("weakness", "sparring: Guard Abandonment Is Systemic, Not Situational"),
    ]);
    expect(out.label).toBe("Sparring: guard abandonment is systemic, not situational");
  });
  it("shows the strength in sentence case", () => {
    const out = primaryStrength([fact("strength", "BJJ Blue Belt Pressure Passing")]);
    expect(out?.label).toBe("BJJ blue belt pressure passing");
  });
});
