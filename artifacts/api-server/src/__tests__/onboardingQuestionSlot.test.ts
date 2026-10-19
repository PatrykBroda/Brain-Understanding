import { describe, expect, it } from "vitest";
import { NEW_QUESTION_ENABLED, NEW_QUESTION_PLACEHOLDER, QUESTIONS, QUESTION_IDS, composePersonality, sanitiseAnswers } from "@workspace/onboarding";

describe("new onboarding question slot", () => {
  it("is a flagged placeholder that is off, so users never see it", () => {
    expect(NEW_QUESTION_ENABLED).toBe(false);
    expect(QUESTIONS.map((q) => q.id)).not.toContain(NEW_QUESTION_PLACEHOLDER.id);
    expect(QUESTION_IDS).toHaveLength(4);
  });

  it("does not reach validation or the personality text while off", () => {
    expect(sanitiseAnswers({ [NEW_QUESTION_PLACEHOLDER.id]: 1 })).toEqual({});
    expect(composePersonality({ [NEW_QUESTION_PLACEHOLDER.id]: 1 })).toBe("");
  });
});
