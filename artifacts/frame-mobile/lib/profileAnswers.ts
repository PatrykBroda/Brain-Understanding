// The ONBOARDING QUESTIONS section on Profile: the original onboarding questions (date of birth,
// primary sport, belt / rank / level, training frequency, goals, known weaknesses), pre-filled from
// the fighter when answered and BLANK when not. This file turns a stored fighter into an editable
// draft, and a draft into a single partial PATCH /fighter body.

import { missingAnswers, normaliseFrequency, sportLabelFor } from "@workspace/onboarding";
import { dateOfBirthFromParts, type DateOfBirthParts } from "./dateOfBirth";
import { dobStepError } from "./onboarding";
import { LEGACY_SPORTS, SPORTS, levelNounForSport, type FighterOption } from "./fighterOptions";

export type AnswerFighter = {
  dateOfBirth?: string | null;
  primarySport?: string | null;
  art?: string | null;
  level?: string | null;
  trainingFrequency?: string | null;
  goals?: string | null;
  weaknesses?: string | null;
};

/** How many required questions there are: date of birth, sport, belt / level, frequency. */
export const REQUIRED_TOTAL = 4;

/**
 * The original onboarding frequency choices, as the original labels. The stored value is the shared
 * canonical string (the old "5+" bucket is stored as "5-6x / week"; the server also maps old spellings).
 */
export const FREQUENCY_CHOICES: FighterOption[] = [
  { key: "1-2x / week", label: "1-2x / week" },
  { key: "3-4x / week", label: "3-4x / week" },
  { key: "5-6x / week", label: "5+ / week" },
];

/** The frequency chips to show: the original three, plus the stored value when it is outside them (e.g. "Daily / pro"). */
export function frequencyChoicesFor(stored: string | null | undefined): FighterOption[] {
  const cur = stored?.trim() ? normaliseFrequency(stored) : "";
  return !cur || FREQUENCY_CHOICES.some((c) => c.key === cur) ? FREQUENCY_CHOICES : [...FREQUENCY_CHOICES, { key: cur, label: cur }];
}

/** The sport chips to show: the offered sports, plus a legacy sport the fighter already has. */
export function sportChoicesFor(current: string | null | undefined): FighterOption[] {
  return [...SPORTS, ...LEGACY_SPORTS.filter((s) => s.key === current)];
}

export type QuestionsDraft = {
  dob: DateOfBirthParts;
  sport: string;
  level: string;
  freq: string;
  goals: string;
  weaknesses: string;
};

/** Parts of an ISO date for the editor, or empties. */
export function dobParts(iso: string | null | undefined): DateOfBirthParts {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  return m ? { day: String(Number(m[3])), month: String(Number(m[2])), year: m[1]! } : { day: "", month: "", year: "" };
}

/** The draft the section starts from: what the fighter answered, blank otherwise. Nothing is pre-selected. */
export function draftFromFighter(f: AnswerFighter | null | undefined): QuestionsDraft {
  return {
    dob: dobParts(f?.dateOfBirth),
    sport: f?.primarySport?.trim() ?? "",
    level: f?.level?.trim() ?? "",
    freq: f?.trainingFrequency?.trim() ? normaliseFrequency(f.trainingFrequency) : "",
    goals: f?.goals ?? "",
    weaknesses: f?.weaknesses ?? "",
  };
}

/** How many of the 4 required questions are answered, from the saved fighter. */
export function answeredCount(f: AnswerFighter | null | undefined): number {
  return REQUIRED_TOTAL - missingAnswers(f).length;
}

const dobEmpty = (p: DateOfBirthParts) => !p.day && !p.month && !p.year;
const sameDob = (a: DateOfBirthParts, b: DateOfBirthParts) => a.day === b.day && a.month === b.month && a.year === b.year;

export type PatchResult = { ok: true; body: Record<string, unknown> } | { ok: false; error: string };

/**
 * PATCH body for the fields that differ from what is saved. Partial: untouched questions are not sent.
 * A date of birth that is typed must be valid; a sport needs its belt / level and the other way round.
 */
export function questionsPatch(draft: QuestionsDraft, saved: AnswerFighter | null | undefined, today = new Date()): PatchResult {
  const base = draftFromFighter(saved);
  const body: Record<string, unknown> = {};

  if (!sameDob(draft.dob, base.dob)) {
    if (dobEmpty(draft.dob) && dobEmpty(base.dob)) {
      // nothing typed, nothing saved
    } else {
      const problem = dobStepError(draft.dob, today);
      const iso = dateOfBirthFromParts(draft.dob, today);
      if (problem || !iso) return { ok: false, error: problem ?? "Enter a valid date of birth." };
      body.dateOfBirth = iso;
    }
  }

  if (draft.sport !== base.sport || draft.level !== base.level) {
    if (!draft.sport && !draft.level) {
      // still blank
    } else if (!draft.sport) {
      return { ok: false, error: "Choose what you train." };
    } else if (!draft.level) {
      return { ok: false, error: `Choose your ${levelNounForSport(draft.sport)} too.` };
    } else {
      body.primarySport = draft.sport;
      body.art = sportLabelFor(draft.sport) ?? draft.sport;
      body.level = draft.level;
    }
  }

  if (draft.freq !== base.freq && draft.freq) body.trainingFrequency = draft.freq;

  // Goals and weaknesses are optional: blank is a valid answer (clears it).
  if (draft.goals.trim() !== base.goals.trim()) body.goals = draft.goals.trim();
  if (draft.weaknesses.trim() !== base.weaknesses.trim()) body.weaknesses = draft.weaknesses.trim();

  return { ok: true, body };
}

/** True when the draft differs from the saved fighter (drives the Save button state). */
export function draftChanged(draft: QuestionsDraft, saved: AnswerFighter | null | undefined): boolean {
  const base = draftFromFighter(saved);
  return (
    !sameDob(draft.dob, base.dob) ||
    draft.sport !== base.sport ||
    draft.level !== base.level ||
    draft.freq !== base.freq ||
    draft.goals.trim() !== base.goals.trim() ||
    draft.weaknesses.trim() !== base.weaknesses.trim()
  );
}

/**
 * Funnel-step keys (lib/onboarding steps.ts) of the questions that were unanswered before a save and
 * are answered after it. "finish" is recorded by the server when the last required one lands.
 */
export function newlyAnsweredSteps(before: AnswerFighter | null | undefined, after: AnswerFighter | null | undefined): string[] {
  const was = new Set(missingAnswers(before));
  const now = new Set(missingAnswers(after));
  const stepOf: [string, string][] = [
    ["dateOfBirth", "dob"],
    ["primarySport", "sport"],
    ["level", "level"],
    ["trainingFrequency", "frequency"],
  ];
  const out = stepOf.filter(([key]) => was.has(key) && !now.has(key)).map(([, step]) => step);
  if (!before?.goals?.trim() && after?.goals?.trim()) out.push("goals");
  return out;
}
