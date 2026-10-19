// The ONBOARDING QUESTIONS section on Profile (coach web). The questions and options are the
// original onboarding's: date of birth, training frequency, primary sport, level, training
// background, goals, weaknesses, bio, an optional personality note, "I compete", and the four
// behavioural questions. Nothing is pre-selected; answers start blank, are pre-filled from the
// fighter when answered, and are saved with one PATCH /api/fighter. This file turns a stored
// fighter into a form, a form into a patch body, and reports which answers are new (funnel).
// Mirrors artifacts/frame-mobile/lib/profileAnswers.ts.

import { QUESTIONS, composePersonality, sanitiseAnswers, sportLabelFor, type Answers } from "@workspace/onboarding";
import { dobProblem } from "./onboarding-form";
import { levelsForSport } from "./fighter-options";

export type AnswerFighter = {
  dateOfBirth?: string | null;
  primarySport?: string | null;
  level?: string | null;
  trainingFrequency?: string | null;
  goals?: string | null;
  weaknesses?: string | null;
  bio?: string | null;
  competes?: boolean | null;
  personality?: string | null;
  trainingBackground?: string | null;
  onboardingAnswers?: Record<string, number> | null;
};

export function answersOf(f: AnswerFighter): Answers {
  return sanitiseAnswers(f.onboardingAnswers ?? {});
}

export function chosenLabel(f: AnswerFighter, questionId: string): string | null {
  const q = QUESTIONS.find((x) => x.id === questionId);
  const idx = answersOf(f)[questionId];
  return q && idx != null ? (q.choices[idx]?.label ?? null) : null;
}

export function answeredCount(f: AnswerFighter): number {
  return Object.keys(answersOf(f)).length;
}

/** The free-text line after the composed reads ("Anything else"), recovered from the stored personality. */
export function personalityNoteOf(f: AnswerFighter): string {
  const composed = composePersonality(answersOf(f));
  const p = (f.personality ?? "").trim();
  return composed ? (p.startsWith(composed) ? p.slice(composed.length).trim() : "") : p;
}

// ── The form ─────────────────────────────────────────────────────────────────

export type QuestionnaireForm = {
  dateOfBirth: string;
  trainingFrequency: string;
  primarySport: string;
  level: string;
  background: string[];
  goals: string;
  weaknesses: string;
  bio: string;
  note: string;
  competes: boolean;
  answers: Answers;
};

/** The form as the stored fighter has it: blank where the athlete has not answered. */
export function formFromFighter(f: AnswerFighter): QuestionnaireForm {
  return {
    dateOfBirth: f.dateOfBirth ?? "",
    trainingFrequency: f.trainingFrequency ?? "",
    primarySport: f.primarySport ?? "",
    level: f.level ?? "",
    background: (f.trainingBackground ?? "").split(",").map((x) => x.trim()).filter(Boolean),
    goals: f.goals ?? "",
    weaknesses: f.weaknesses ?? "",
    bio: f.bio ?? "",
    note: personalityNoteOf(f),
    competes: !!f.competes,
    answers: answersOf(f),
  };
}

export function formsEqual(a: QuestionnaireForm, b: QuestionnaireForm): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export type FormErrors = { dateOfBirth?: string; level?: string };

/** What blocks a save. Blank answers are fine (they can be filled in later); wrong ones are not. */
export function formErrors(form: QuestionnaireForm, today = new Date()): FormErrors {
  const out: FormErrors = {};
  if (form.dateOfBirth) {
    const p = dobProblem(form.dateOfBirth, today);
    if (p) out.dateOfBirth = p;
  }
  if (form.primarySport && form.level && !levelsForSport(form.primarySport).includes(form.level)) {
    out.level = "Choose a level that matches your sport.";
  }
  return out;
}

export type PatchResult = { ok: true; body: Record<string, unknown> } | { ok: false; errors: FormErrors };

/**
 * The PATCH /api/fighter body for a save: only answered fields (a blank date of birth would be
 * rejected, and blank sport / level / frequency must not overwrite anything). Goals, weaknesses,
 * bio and the compete tick are always sent so they can be cleared. When any behavioural answer
 * is present the server recomposes `personality` from the answers plus `personalityNote`;
 * with none, the note itself is the personality text.
 */
export function savePatch(form: QuestionnaireForm, today = new Date()): PatchResult {
  const errors = formErrors(form, today);
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  const body: Record<string, unknown> = {
    goals: form.goals.trim(),
    weaknesses: form.weaknesses.trim(),
    bio: form.bio.trim(),
    competes: form.competes,
    trainingBackground: form.background.join(", "),
  };
  if (form.dateOfBirth) body.dateOfBirth = form.dateOfBirth;
  if (form.trainingFrequency) body.trainingFrequency = form.trainingFrequency;
  if (form.primarySport) {
    body.primarySport = form.primarySport;
    body.art = sportLabelFor(form.primarySport) ?? form.primarySport;
  }
  if (form.level) body.level = form.level;
  if (Object.keys(form.answers).length > 0) {
    body.onboardingAnswers = form.answers;
    body.personalityNote = form.note.trim();
  } else {
    body.personality = form.note.trim();
  }
  return { ok: true, body };
}

// ── Funnel ───────────────────────────────────────────────────────────────────

/** Step keys (see QUESTIONNAIRE_STEPS in @workspace/onboarding) for the answers this form holds. */
export function answeredSteps(form: QuestionnaireForm): string[] {
  const out: string[] = [];
  if (form.dateOfBirth) out.push("dob");
  if (form.primarySport) out.push("sport");
  if (form.level) out.push("level");
  if (form.trainingFrequency) out.push("frequency");
  if (form.goals.trim()) out.push("goals");
  for (const q of QUESTIONS) if (form.answers[q.id] != null) out.push(`q_${q.id}`);
  return out;
}

/** Steps answered in `after` that were blank in `before` (what a save newly completes). */
export function newlyAnsweredSteps(before: AnswerFighter, after: QuestionnaireForm): string[] {
  const had = new Set(answeredSteps(formFromFighter(before)));
  return answeredSteps(after).filter((s) => !had.has(s));
}
