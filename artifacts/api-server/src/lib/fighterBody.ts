import { composePersonality, normaliseFighterAnswers, sanitiseAnswers, type FighterAnswers } from "@workspace/onboarding";
import { isValidTimeZone } from "./localTime";

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
export function prepareFighterBody(body: unknown, existing?: StoredQuestionnaire): unknown {
  const filled = nullTextToDefaults(body);
  if (typeof filled !== "object" || filled === null || Array.isArray(filled)) return filled;
  const normalised = normaliseFighterAnswers(filled as Record<string, unknown> & FighterAnswers) as Record<string, unknown>;
  return withQuestionnaire(normalised, existing);
}

export type StoredQuestionnaire = { personality: string; onboardingAnswers: Record<string, number> | null };

/**
 * Free text an athlete added after the composed answer reads (the coach web asks for an
 * optional line about how they compete). Recovered from the stored personality so editing
 * an answer later does not drop it.
 */
export function personalityNoteOf(stored: StoredQuestionnaire): string {
  const composed = composePersonality(sanitiseAnswers(stored.onboardingAnswers ?? {}));
  const p = stored.personality ?? "";
  return composed && p.startsWith(composed) ? p.slice(composed.length).trim() : composed ? "" : p.trim();
}

/**
 * The four behavioural answers are the source of truth for `personality`: when a write
 * carries `onboardingAnswers` they are validated against the shared questions (unknown
 * questions and out-of-range options are dropped) and `personality` is recomposed from
 * them, so editing an answer on Profile changes exactly what onboarding would have
 * stored. A body without answers is left alone (older builds send `personality` directly).
 * `timezone` is only ever accepted as a valid IANA name.
 */
export function withQuestionnaire(body: Record<string, unknown>, existing?: StoredQuestionnaire): Record<string, unknown> {
  const out = { ...body };
  if ("onboardingAnswers" in out) {
    const answers = sanitiseAnswers(out["onboardingAnswers"]);
    out["onboardingAnswers"] = answers;
    if (Object.keys(answers).length > 0) {
      const note =
        typeof out["personalityNote"] === "string"
          ? out["personalityNote"].trim()
          : existing
            ? personalityNoteOf(existing)
            : "";
      out["personality"] = composePersonality(answers, note);
    }
  }
  delete out["personalityNote"];
  if ("timezone" in out && !isValidTimeZone(out["timezone"])) delete out["timezone"];
  return out;
}

const QUESTIONNAIRE_FIELDS = [
  "primarySport",
  "art",
  "level",
  "trainingFrequency",
  "goals",
  "weaknesses",
  "personality",
  "onboardingAnswers",
] as const;

/** True when a write changes any onboarding answer relative to the stored profile. */
export function questionnaireChanged(existing: Record<string, unknown>, patch: Record<string, unknown>): boolean {
  return QUESTIONNAIRE_FIELDS.some(
    (k) => k in patch && JSON.stringify(patch[k] ?? null) !== JSON.stringify(existing[k] ?? null),
  );
}
