import type { AthleteFact, Fighter } from "@workspace/db";

export const AI_ANALYSIS_CONSENT_VERSION = "2026-09-08";

export const AI_ANALYSIS_DISCLOSURE = {
  provider: "Anthropic",
  service: "Claude",
  purpose: "to generate your FRAME performance analysis",
  sharedData: [
    "up to four selected still frames from uploaded footage, when available",
    "movement signals, scores, session type, clip duration and your requested analysis focus",
    "combat sport, experience level, training frequency and relevant performance observations",
  ],
  notShared: [
    "your email address, account ID, full name, gym, biography, height or weight",
    "the raw video file",
  ],
} as const;

export function hasCurrentAiConsent(
  version: string | null | undefined,
  acceptedAt: Date | string | null | undefined,
): boolean {
  return version === AI_ANALYSIS_CONSENT_VERSION && acceptedAt != null;
}

const PERFORMANCE_FACT_CATEGORIES = new Set([
  "strength",
  "weakness",
  "technical_knowledge",
  "pattern",
  "goal",
]);

/**
 * Build the narrow athlete context allowed to leave FRAME for video analysis.
 * Direct identifiers and unrelated life/event/preference history are excluded.
 */
export function minimiseAnalysisContext(fighter: Fighter, facts: AthleteFact[]) {
  const safeFighter = {
    ...fighter,
    name: "",
    age: 0,
    gym: "",
    bio: "",
    goals: "",
    weaknesses: "",
    heightCm: null,
    weightKg: null,
  };
  const safeFacts = facts.filter((fact) => PERFORMANCE_FACT_CATEGORIES.has(fact.category));
  return { fighter: safeFighter, facts: safeFacts };
}