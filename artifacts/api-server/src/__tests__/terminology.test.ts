import { describe, expect, it } from "vitest";
import { COACH_SYSTEM_PROMPT_STATIC, buildDynamicContext } from "../lib/synochi";
import { SYNOCHI_VAULT } from "../lib/synochi.generated";
import { computeVocabulary, vocabularyPromptBlock } from "../lib/vocabulary";

// The athlete only ever sees "FRAME". Internal names must not appear in the words the coach is
// told to use. The one place they may appear is the explicit NEVER-say list.
const INTERNAL = /synochi|\bvault\b|\bcodex\b/i;

function withoutNeverList(text: string): string {
  return text
    .split("\n")
    .filter((l) => !l.startsWith("- NEVER say or write:"))
    .join("\n");
}

const fighter = { name: "A", age: 30, art: "BJJ", primarySport: "bjj", level: "Blue", trainingFrequency: "3-4x / week", gym: "", competes: false, goals: "", weaknesses: "", bio: "", personality: "", spiritAnimal: "", spiritAnimalTagline: "" } as never;

describe("coach terminology", () => {
  it("static prompt carries the FRAME terminology block with the real tab names", () => {
    expect(COACH_SYSTEM_PROMPT_STATIC).toContain("# FRAME terminology");
    for (const tab of ["Home", "State", "Chat", "Analyse", "Camp", "Profile"]) {
      expect(COACH_SYSTEM_PROMPT_STATIC).toContain(tab);
    }
    expect(COACH_SYSTEM_PROMPT_STATIC).toContain("athlete model");
    expect(COACH_SYSTEM_PROMPT_STATIC).toContain("FRAME library");
  });

  it("static prompt never uses an internal name outside the NEVER-say list", () => {
    const prompt = withoutNeverList(COACH_SYSTEM_PROMPT_STATIC);
    // The reference library is appended to the prompt; its note titles are retrieval keys.
    const own = prompt.split(SYNOCHI_VAULT)[0]!;
    expect(own).not.toMatch(INTERNAL);
    expect(COACH_SYSTEM_PROMPT_STATIC).toContain("NEVER say or write: Synochi");
  });

  it("dynamic context uses the athlete-facing section name", () => {
    const out = buildDynamicContext(fighter, [], [], [], null);
    expect(out).not.toMatch(INTERNAL);
  });

  it("the bundled library prose says FRAME, not Synochi (titles and [[links]] excepted)", () => {
    const prose = SYNOCHI_VAULT.replace(/\[\[[^\]]*\]\]/g, "")
      .split("\n")
      .filter((l) => !/^### /.test(l) && !/^- \*\*/.test(l))
      .join("\n");
    expect(prose).not.toMatch(/synochi/i);
  });

  it("vocabulary guidance never names Synochi or the vault", () => {
    for (let n = 0; n <= 20; n += 1) {
      const facts = Array.from({ length: n }, () => ({ category: "technical_knowledge", status: "active" })) as never;
      expect(vocabularyPromptBlock(computeVocabulary(facts))).not.toMatch(INTERNAL);
    }
  });
});
