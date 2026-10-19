// The animal archetype is only assigned, shown and used by the coach once FRAME's
// understanding of the athlete's game reaches 25% (see @workspace/ontology
// computeUnderstanding: the "Model confidence" percentage on Profile). Before that the
// fighter row may hold an animal from an older build; it is hidden, not deleted, so it
// comes back the moment the threshold is reached.

import { archetypeUnlocked, computeUnderstanding } from "@workspace/ontology";
import type { Logger } from "pino";
import { db, fightersTable, type AthleteFact, type Fighter } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getActiveFacts } from "./factsService";
import { deriveSpiritAnimal } from "./spiritAnimals";
import { hasAiConsentForUser } from "./aiConsent";

export interface ArchetypeState {
  understanding: number;
  archetypeUnlocked: boolean;
}

export function archetypeStateFor(facts: readonly Pick<AthleteFact, "category" | "confidence">[]): ArchetypeState {
  const understanding = computeUnderstanding(facts);
  return { understanding, archetypeUnlocked: archetypeUnlocked(understanding) };
}

/** The fighter as the apps may see it: no archetype below the threshold, plus the numbers that explain why. */
export function shapeFighter<T extends Fighter>(fighter: T, state: ArchetypeState): T & ArchetypeState {
  return {
    ...fighter,
    ...(state.archetypeUnlocked ? {} : { spiritAnimal: "", spiritAnimalTagline: "" }),
    ...state,
  };
}

export async function shapedFighterFor(fighter: Fighter): Promise<Fighter & ArchetypeState> {
  const facts = await getActiveFacts(fighter.id);
  return shapeFighter(fighter, archetypeStateFor(facts));
}

/**
 * Called after the athlete model changes: the first time understanding reaches the
 * threshold and there is no archetype yet, assign one (an AI read of their answers).
 */
export async function maybeAssignArchetype(fighterId: number, log: Logger): Promise<boolean> {
  try {
    const [fighter] = await db.select().from(fightersTable).where(eq(fightersTable.id, fighterId)).limit(1);
    if (!fighter || fighter.spiritAnimal) return false;
    const facts = await getActiveFacts(fighterId);
    if (!archetypeStateFor(facts).archetypeUnlocked) return false;
    if (!(await hasAiConsentForUser(fighter.userId))) return false;
    const derived = await deriveSpiritAnimal(fighter, log);
    if (!derived) return false;
    await db
      .update(fightersTable)
      .set({ spiritAnimal: derived.animal, spiritAnimalTagline: derived.tagline })
      .where(eq(fightersTable.id, fighterId));
    return true;
  } catch (err) {
    log.warn({ err }, "archetype assignment failed");
    return false;
  }
}
