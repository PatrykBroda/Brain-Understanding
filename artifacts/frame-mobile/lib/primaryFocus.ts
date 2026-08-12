import type { Fighter } from "@/context/FighterContext";

// Facts come back from /memory. topic/createdAt are optional on mobile — the
// server includes them when known; the helpers below tolerate their absence.
export interface AthleteFact {
  id: number;
  category: string;
  topic?: string | null;
  content: string;
  status: string;
  confidence: number;
  createdAt?: string;
}

// The single highest-value insight — recorded weakness first, else the
// athlete's own onboarding words. Never synthesized. Ported from the web.
export function primaryFocus(
  fighter: Fighter,
  facts: AthleteFact[],
): { label: string; source: string } {
  const weaknesses = facts
    .filter((f) => f.category === "weakness")
    .sort(
      (a, b) =>
        b.confidence - a.confidence ||
        ((a.createdAt ?? "") < (b.createdAt ?? "") ? 1 : -1),
    );
  if (weaknesses.length > 0) {
    const top = weaknesses[0];
    return {
      label: top.topic || top.content,
      source: "highest-confidence recorded weakness",
    };
  }
  const stated = (fighter.weaknesses || "")
    .split(/[,.;\n]/)
    .map((s) => s.trim())
    .filter(Boolean)[0];
  if (stated) return { label: stated, source: "from your onboarding" };
  return { label: "Not yet identified", source: "no weakness recorded yet" };
}

// The highest-confidence recorded strength, or null if none observed yet.
export function primaryStrength(
  facts: AthleteFact[],
): { label: string; source: string } | null {
  const strengths = facts
    .filter((f) => f.category === "strength")
    .sort(
      (a, b) =>
        b.confidence - a.confidence ||
        ((a.createdAt ?? "") < (b.createdAt ?? "") ? 1 : -1),
    );
  if (strengths.length > 0) {
    const top = strengths[0];
    return {
      label: top.topic || top.content,
      source: "highest-confidence recorded strength",
    };
  }
  return null;
}
