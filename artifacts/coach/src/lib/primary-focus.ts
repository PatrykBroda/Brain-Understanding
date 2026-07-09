import type { Fighter, AthleteFact } from "@/lib/api";

// The single highest-value insight — the one line the app leads with.
// Derived from REAL data only (recorded facts, else the athlete's own
// onboarding words), with honest provenance. Never synthesized.

export function primaryFocus(
  fighter: Fighter,
  facts: AthleteFact[],
): { label: string; source: string } {
  const weaknesses = facts
    .filter((f) => f.category === "weakness")
    .sort((a, b) => b.confidence - a.confidence || (a.createdAt < b.createdAt ? 1 : -1));
  if (weaknesses.length > 0) {
    const top = weaknesses[0];
    return { label: top.topic || top.content, source: "highest-confidence recorded weakness" };
  }
  const stated = (fighter.weaknesses || "").split(/[,.;\n]/).map((s) => s.trim()).filter(Boolean)[0];
  if (stated) return { label: stated, source: "from your onboarding" };
  return { label: "Not yet identified", source: "no weakness recorded yet" };
}

export function primaryStrength(
  facts: AthleteFact[],
): { label: string; source: string } | null {
  const strengths = facts
    .filter((f) => f.category === "strength")
    .sort((a, b) => b.confidence - a.confidence || (a.createdAt < b.createdAt ? 1 : -1));
  if (strengths.length > 0) {
    const top = strengths[0];
    return { label: top.topic || top.content, source: "highest-confidence recorded strength" };
  }
  return null;
}
