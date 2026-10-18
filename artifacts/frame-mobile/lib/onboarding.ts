import {
  FLOWS,
  FREQUENCIES,
  QUESTIONS,
  composePersonality,
  normaliseFrequency,
  sanitiseAnswers,
  sportLabelFor,
  type Answers,
  type Question,
} from "@workspace/onboarding";
import { dateOfBirthFromParts, type DateOfBirthParts } from "./dateOfBirth";
import { NAME_MAX, nameError } from "./fighterName";
import { SPORTS, LEGACY_SPORTS, levelNounForSport, levelsForSport } from "./fighterOptions";

/**
 * The onboarding screens, in order. Keys are the funnel step keys shared with
 * the server (name, dob, sport, frequency, q_tired.., goals).
 */
export const STEP_KEYS: readonly string[] = FLOWS.mobile.filter((s) => s !== "signup" && s !== "finish");
/** Number of onboarding steps: name, date of birth, sport + belt, frequency, the 4 questions, goals. */
export const TOTAL_STEPS = STEP_KEYS.length;
/** Index of the first of the 4 behavioural questions. */
export const FIRST_QUESTION_STEP = STEP_KEYS.indexOf("q_tired");
/** How long a tapped answer stays highlighted before the next question appears. */
export const ADVANCE_DELAY_MS = 220;

/** The question shown on `step`, or null when the step is not a question. */
export function questionForStep(step: number): Question | null {
  const i = step - FIRST_QUESTION_STEP;
  return i >= 0 && i < QUESTIONS.length ? QUESTIONS[i] : null;
}

/** Next step after an answer, clamped so a stray extra tap can never run past the last step. */
export function stepAfter(from: number): number {
  return Math.min(Math.max(from + 1, 0), TOTAL_STEPS - 1);
}
/** The save must never leave the athlete on a spinner forever. */
export const SAVE_TIMEOUT_MS = 20_000;
/** Taps closer together than this on Back/Next count as one (double-tap). */
export const STEP_TAP_GAP_MS = 350;

export type OnboardingDraft = {
  step: number;
  name: string;
  dob: DateOfBirthParts;
  /** "" until the athlete taps a choice: nothing is pre-selected. */
  sport: string;
  level: string;
  freq: string;
  answers: Answers;
  goals: string;
  weaknesses: string;
};

/** A blank draft: no sport, level, frequency or answers chosen. */
export function emptyDraft(): OnboardingDraft {
  return {
    step: 0,
    name: "",
    dob: { day: "", month: "", year: "" },
    sport: "",
    level: "",
    freq: "",
    answers: {},
    goals: "",
    weaknesses: "",
  };
}

// ── Validation ───────────────────────────────────────────────────────────────

/** Inline message for the name step, or null when the name is fine. */
export function nameStepError(raw: string): string | null {
  const err = nameError(raw);
  return err === "Enter your name" ? "Enter your name to continue." : err;
}

/** Specific inline message for the date-of-birth step, or null when valid. */
export function dobStepError(parts: DateOfBirthParts, today = new Date()): string | null {
  const { day, month, year } = parts;
  if (!day || !month || !year) return "Enter your day, month and four-digit year.";
  if (year.length !== 4) return "Enter the year as four digits, like 1995.";
  const y = Number(year);
  if (y < 1900) return "Check the year. It looks too far back.";
  if (y > today.getUTCFullYear()) return "That year is in the future.";
  const m = Number(month);
  if (m < 1 || m > 12) return "The month should be between 1 and 12.";
  if (dateOfBirthFromParts(parts, today) == null) {
    const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const d = Number(day);
    if (d >= 1 && d <= daysInMonth) return "That date is in the future.";
    return `That month only has ${daysInMonth} days.`;
  }
  return null;
}

/**
 * What is missing on a choice step, in plain words, or null when the step is
 * complete. Name and date of birth have their own messages (nameStepError,
 * dobStepError); goals is optional.
 */
export function choiceStepError(draft: OnboardingDraft, step: number): string | null {
  const key = STEP_KEYS[step];
  if (key === "sport") {
    if (!draft.sport) return "Choose what you train to continue.";
    if (!draft.level) return `Choose your ${levelNounForSport(draft.sport)} to continue.`;
    return null;
  }
  if (key === "frequency") return draft.freq ? null : "Choose how often you train to continue.";
  const q = questionForStep(step);
  if (q) return draft.answers[q.id] == null ? "Pick an answer to continue." : null;
  return null;
}

// ── Save payload ─────────────────────────────────────────────────────────────

/**
 * Body for POST /fighter. Blank optional answers are sent as "" (the column
 * default), never null: the server used to reject null with 400 "invalid
 * fighter", which stopped everyone who skipped goals or weaknesses.
 */
export function buildFighterPayload(draft: OnboardingDraft, dateOfBirth: string) {
  return {
    name: draft.name.trim(),
    dateOfBirth,
    // Same strings as the coach web: art is the sport's label, primarySport its key.
    art: sportLabelFor(draft.sport) ?? draft.sport,
    primarySport: draft.sport,
    level: draft.level,
    trainingFrequency: draft.freq,
    goals: draft.goals.trim(),
    weaknesses: draft.weaknesses.trim(),
    // Built from the 4 answers exactly like the coach web, so the spirit-animal read gets the same input.
    personality: composePersonality(draft.answers),
  };
}

// ── Errors ───────────────────────────────────────────────────────────────────

export type SaveFailure = {
  message: string;
  /** Step to send the athlete back to when the problem lives on an earlier step. */
  goToStep?: number;
};

function statusOf(error: unknown): number | null {
  const s = (error as { status?: unknown } | null)?.status;
  return typeof s === "number" ? s : null;
}

/** Plain-English reason the "Finish setup" save failed, never a raw server string. */
export function describeSaveFailure(error: unknown): SaveFailure {
  const status = statusOf(error);
  const raw = error instanceof Error ? error.message : "";

  if (status === 401 || status === 403) {
    return { message: "Your session has expired. Sign in again, then pick up where you left off." };
  }
  if (status === 400) {
    if (/name/i.test(raw) && !/date/i.test(raw)) {
      return { message: `Your name needs to be 1 to ${NAME_MAX} characters.`, goToStep: 0 };
    }
    if (/date of birth|dateOfBirth/i.test(raw)) {
      return { message: "That date of birth wasn't accepted. Check it and try again.", goToStep: 1 };
    }
    return { message: "Something in your answers wasn't accepted. Go back, check each step, and try again." };
  }
  if (status === 429) {
    return { message: "Too many attempts. Wait a minute, then tap Finish setup again." };
  }
  if (status != null && status >= 500) {
    return { message: "Our server hit a problem saving your profile. Your answers are kept. Tap Finish setup to try again." };
  }
  if (/timed out|timeout|abort|network|failed to fetch|offline|connection/i.test(raw) || status == null) {
    return { message: "We couldn't reach FRAME. Check your connection, then tap Finish setup to try again. Your answers are kept." };
  }
  return { message: "We couldn't save your profile. Tap Finish setup to try again." };
}

/** Reject if `p` has not settled within `ms`, so a hung request cannot spin forever. */
export function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("Request timed out")), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

// ── Double-tap guard ─────────────────────────────────────────────────────────

/** True when a step-changing tap should be ignored because it follows another too closely. */
export function isDoubleTap(lastTapAt: number, now: number, gap = STEP_TAP_GAP_MS): boolean {
  return now - lastTapAt < gap;
}

// ── Draft (resume where they left off) ──────────────────────────────────────

// v2: drafts saved before the defaults were removed hold a pre-selected BJJ / White / 3-4 that
// the athlete may never have chosen, so they are not restored.
export const draftKeyFor = (userId: string) => `frame:onboarding-draft:v2:${userId}`;

const str = (v: unknown, max = 2000): string => (typeof v === "string" ? v.slice(0, max) : "");

/** Parse a stored draft defensively: anything malformed yields null, never a crash. */
export function parseDraft(raw: string | null | undefined): OnboardingDraft | null {
  if (!raw) return null;
  let o: unknown;
  try {
    o = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof o !== "object" || o === null) return null;
  const d = o as Record<string, unknown>;
  const dob = (d.dob ?? {}) as Record<string, unknown>;
  const sport = str(d.sport, 40);
  const level = str(d.level, 60);
  const freq = str(d.freq, 40);
  const known = [...SPORTS, ...LEGACY_SPORTS].some((s) => s.key === sport);
  const step = typeof d.step === "number" && Number.isInteger(d.step) ? d.step : 0;
  return {
    step: Math.min(Math.max(step, 0), TOTAL_STEPS - 1),
    name: str(d.name, NAME_MAX),
    dob: { day: str(dob.day, 2), month: str(dob.month, 2), year: str(dob.year, 4) },
    sport: known ? sport : "",
    level: known && levelsForSport(sport).some((l) => l.key === level) ? level : "",
    freq: FREQUENCIES.includes(normaliseFrequency(freq)) ? normaliseFrequency(freq) : "",
    answers: sanitiseAnswers(d.answers),
    goals: str(d.goals),
    weaknesses: str(d.weaknesses),
  };
}

/** True when the draft holds anything worth restoring (don't resume an untouched form). */
export function draftHasProgress(d: OnboardingDraft): boolean {
  return d.step > 0 || !!d.name.trim() || !!d.dob.day || !!d.dob.month || !!d.dob.year || !!d.sport || !!d.freq || Object.keys(d.answers).length > 0 || !!d.goals.trim() || !!d.weaknesses.trim();
}

/** "bjj" -> "BJJ", "muay_thai" -> "Muay Thai", unknown keys title-cased. */
export function sportDisplayName(key: string | null | undefined): string {
  if (!key) return "";
  const hit = [...SPORTS, ...LEGACY_SPORTS].find((s) => s.key === key.trim().toLowerCase());
  if (hit) return hit.label;
  return key
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/(^|\s)\S/g, (c) => c.toUpperCase());
}

/** "BJJ BELT" -> "BJJ belt" (lib labels are shouty; screens use sentence case). */
export function sentenceCaseLabel(s: string): string {
  const lower = s.toLowerCase();
  return (lower.charAt(0).toUpperCase() + lower.slice(1)).replace(/\bbjj\b/gi, "BJJ");
}
