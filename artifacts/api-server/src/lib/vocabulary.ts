import type { AthleteFact } from "@workspace/db";

export type VocabularyState = {
  // Distinct technical concepts the athlete has demonstrably engaged with.
  knownConcepts: number;
  // 0-5 tier derived from that count. Grows, never shrinks (callers persist the max).
  tier: number;
  guidance: string;
};

const TIER_GUIDANCE: Record<number, string> = {
  0: "First contact. Assume NO shared vocabulary. Use plain words, define any framework term the first time you use it inline, and keep [[concept]] references to one per reply with a one-line gloss.",
  1: "Early. A handful of concepts have landed. Still gloss new terms on first use, but you can lean on the ones already on record without re-explaining them.",
  2: "Building. They hold a working vocabulary. Use framework terms more freely; only gloss genuinely new or advanced ones. Start using their own [[concepts]] as shorthand.",
  3: "Fluent. They think in the framework. Use vault shorthand naturally, chain concepts, skip basic definitions. Reserve glossing for edge-case or cross-domain terms.",
  4: "Advanced. Talk to them like a training partner who wrote half these notes. Dense, fast, concept-to-concept. No hand-holding.",
  5: "Peer. Full shorthand, subtle corrections, edge cases and bridges between nodes. Zero scaffolding — anything basic insults the level they've reached.",
};

export function computeVocabulary(facts: AthleteFact[]): VocabularyState {
  const knownConcepts = facts.filter(
    (f) => f.category === "technical_knowledge" && f.status === "active",
  ).length;

  let tier = 0;
  if (knownConcepts >= 15) tier = 5;
  else if (knownConcepts >= 10) tier = 4;
  else if (knownConcepts >= 6) tier = 3;
  else if (knownConcepts >= 3) tier = 2;
  else if (knownConcepts >= 1) tier = 1;

  return { knownConcepts, tier, guidance: TIER_GUIDANCE[tier]! };
}

export function vocabularyPromptBlock(v: VocabularyState): string {
  return `# Vocabulary calibration (this athlete's term density — grows as their model grows)

Recorded technical concepts on file: ${v.knownConcepts}. Vocabulary tier: ${v.tier}/5.
${v.guidance}

This is not a license to dumb things down or show off — it is term density calibration. Meet them where their recorded knowledge actually is. As their model accumulates real technical_knowledge facts, this tier rises and you ramp the density with it. Never regress to baseline once they've earned the level.`;
}
