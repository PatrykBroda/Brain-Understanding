import { normaliseFighterAnswers, type FighterAnswers } from "@workspace/onboarding";

/**
 * Fighter text columns that are NOT NULL with a default of "" (or false). The
 * generated insert/update schemas make them optional but not nullable, so a
 * client that sends `null` for "left blank" is rejected with 400 "invalid
 * fighter". The shipped mobile onboarding does exactly that for goals and
 * weaknesses, which blocked every athlete who skipped either question from
 * finishing sign-up. Treat null as "not provided" here so installed app
 * builds work without an update.
 */
const BLANKABLE_TEXT_FIELDS = [
  "gym",
  "headCoach",
  "weightClass",
  "stance",
  "record",
  "goals",
  "weaknesses",
  "personality",
  "trainingBackground",
  "bio",
] as const;

export function nullTextToDefaults(body: unknown): unknown {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return body;
  const out: Record<string, unknown> = { ...(body as Record<string, unknown>) };
  for (const key of BLANKABLE_TEXT_FIELDS) {
    if (out[key] === null) out[key] = "";
  }
  if (out["competes"] === null) out["competes"] = false;
  return out;
}

/**
 * Everything a fighter write goes through before validation: null text becomes
 * "" and the four onboarding answers (sport, art, level, frequency) are mapped
 * onto the canonical set, so builds that still send "3-4" or "BJJ / Grappling"
 * store the same strings as current ones. Unrecognised values are kept as sent.
 */
export function prepareFighterBody(body: unknown): unknown {
  const filled = nullTextToDefaults(body);
  if (typeof filled !== "object" || filled === null || Array.isArray(filled)) return filled;
  return normaliseFighterAnswers(filled as Record<string, unknown> & FighterAnswers);
}
