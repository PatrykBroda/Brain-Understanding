import { describe, expect, it } from "vitest";
import { computeAthleteModel, ARCHETYPE_UNLOCK_UNDERSTANDING, type ModelFact } from "../lib/athleteModel";
import {
  ARCHETYPE_UNLOCK_UNDERSTANDING as SHARED_UNLOCK,
  archetypeUnlocked,
  computeUnderstanding,
} from "../../../lib/ontology/src/index";

const CATS = ["weakness", "strength", "technical_knowledge", "pattern", "preference", "goal", "event", "context"];
const fact = (category: string, confidence: number, i: number): ModelFact =>
  ({ id: i, category, topic: `t${i}`, content: `c${i}`, confidence, status: "active" }) as ModelFact;

describe("understanding of the athlete's game (the 25% archetype threshold)", () => {
  it("is one definition: the Profile gauge equals the shared measure the server gates on", () => {
    const sets: ModelFact[][] = [
      [],
      [fact("weakness", 3, 1)],
      CATS.map((c, i) => fact(c, 4, i)),
      CATS.flatMap((c, i) => [fact(c, 5, i * 3), fact(c, 5, i * 3 + 1), fact(c, 5, i * 3 + 2)]),
    ];
    for (const facts of sets) {
      const model = computeAthleteModel({ facts, fighterLevel: "Blue", fighterCreatedAt: null, hasActiveCompetition: false });
      expect(model.frameConfidence).toBe(computeUnderstanding(facts));
    }
    expect(ARCHETYPE_UNLOCK_UNDERSTANDING).toBe(SHARED_UNLOCK);
    expect(SHARED_UNLOCK).toBe(25);
  });
  it("unlocks at exactly 25 and not at 24", () => {
    expect(archetypeUnlocked(24)).toBe(false);
    expect(archetypeUnlocked(25)).toBe(true);
    // 8 categories x 1/8 each; 25% needs a total coverage of 2.0 = e.g. two categories fully covered.
    const two = ["weakness", "strength"].flatMap((c, i) => [fact(c, 5, i * 3), fact(c, 5, i * 3 + 1), fact(c, 5, i * 3 + 2)]);
    expect(computeUnderstanding(two)).toBe(25);
    expect(archetypeUnlocked(computeUnderstanding(two))).toBe(true);
    expect(computeUnderstanding(two.slice(0, 5))).toBeLessThan(25);
  });
});
