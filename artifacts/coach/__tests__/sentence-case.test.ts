import { describe, expect, it } from "vitest";
import { sentenceCase } from "../src/lib/sentence-case";

describe("sentenceCase", () => {
  it("fixes Title Cased observation titles with an em dash", () => {
    expect(sentenceCase("sparring: Shoulder Brace — Tension Carried Into Every Exchange")).toBe(
      "Sparring: shoulder brace — tension carried into every exchange",
    );
    expect(sentenceCase("sparring: Guard Abandonment Is Systemic, Not Situational")).toBe(
      "Sparring: guard abandonment is systemic, not situational",
    );
  });
  it("keeps acronyms and dates", () => {
    expect(sentenceCase("BJJ Blue Belt Pressure Passing Gaps")).toBe("BJJ blue belt pressure passing gaps");
    expect(sentenceCase("AFG Open Fight Week Weight Cut")).toBe("AFG open fight week weight cut");
    expect(sentenceCase("Knee Tweak From Thu 22 Oct Session")).toBe("Knee tweak from Thu 22 Oct session");
  });
  it("leaves already-sentence-case lines alone except the first letter", () => {
    expect(sentenceCase("shoulder brace — tension carried")).toBe("Shoulder brace — tension carried");
    expect(sentenceCase("Training in Bangkok this week")).toBe("Training in Bangkok this week");
    expect(sentenceCase("Sparring: shoulder brace")).toBe("Sparring: shoulder brace");
  });
  it("handles empty and whitespace", () => {
    expect(sentenceCase("")).toBe("");
    expect(sentenceCase("  half guard  ")).toBe("Half guard");
  });
});
