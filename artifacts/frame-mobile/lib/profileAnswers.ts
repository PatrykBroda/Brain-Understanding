// The onboarding questionnaire as it is shown and edited on Profile. Same fields, same
// canonical values and same validation as onboarding: this file only turns a stored
// fighter into display rows and a single edit into a PATCH /fighter body.

import { QUESTIONS, sanitiseAnswers, sportLabelFor, type Answers } from "@workspace/onboarding";
import { dateOfBirthFromParts, type DateOfBirthParts } from "./dateOfBirth";
import { dobStepError } from "./onboarding";

export type AnswerFighter = {
  dateOfBirth?: string | null;
  primarySport?: string | null;
  art?: string | null;
  level?: string | null;
  trainingFrequency?: string | null;
  goals?: string | null;
  weaknesses?: string | null;
  onboardingAnswers?: Record<string, number> | null;
};

export type AnswerKind = "dob" | "sport" | "frequency" | "goals" | "weaknesses" | "question";

/** Parts of an ISO date for the editor, or empties. */
export function dobParts(iso: string | null | undefined): DateOfBirthParts {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  return m ? { day: String(Number(m[3])), month: String(Number(m[2])), year: m[1]! } : { day: "", month: "", year: "" };
}

export function answersOf(f: AnswerFighter): Answers {
  return sanitiseAnswers(f.onboardingAnswers ?? {});
}

/** The chosen option's label for question `id`, or null when unanswered. */
export function chosenLabel(f: AnswerFighter, questionId: string): string | null {
  const q = QUESTIONS.find((x) => x.id === questionId);
  const idx = answersOf(f)[questionId];
  return q && idx != null ? (q.choices[idx]?.label ?? null) : null;
}

/** Number of the four behavioural questions this athlete has answered. */
export function answeredCount(f: AnswerFighter): number {
  return Object.keys(answersOf(f)).length;
}

export type PatchResult = { ok: true; body: Record<string, unknown> } | { ok: false; error: string };

/** PATCH body for choosing a sport and its level together (changing sport clears the old level). */
export function sportPatch(sport: string, level: string): PatchResult {
  if (!sport) return { ok: false, error: "Choose what you train." };
  if (!level) return { ok: false, error: "Choose your level too." };
  return { ok: true, body: { primarySport: sport, art: sportLabelFor(sport) ?? sport, level } };
}

export function frequencyPatch(freq: string): PatchResult {
  return freq ? { ok: true, body: { trainingFrequency: freq } } : { ok: false, error: "Choose how often you train." };
}

export function dobPatch(parts: DateOfBirthParts, today = new Date()): PatchResult {
  const problem = dobStepError(parts, today);
  const iso = dateOfBirthFromParts(parts, today);
  if (problem || !iso) return { ok: false, error: problem ?? "Enter a valid date of birth." };
  return { ok: true, body: { dateOfBirth: iso } };
}

/** Free-text goals / weaknesses: trimmed, blank allowed (both are optional in onboarding). */
export function textPatch(kind: "goals" | "weaknesses", value: string): PatchResult {
  return { ok: true, body: { [kind]: value.trim() } };
}

/** Changing one behavioural answer sends ALL current answers; the server recomposes `personality` from them. */
export function questionPatch(current: AnswerFighter, questionId: string, index: number): PatchResult {
  const q = QUESTIONS.find((x) => x.id === questionId);
  if (!q || index < 0 || index >= q.choices.length) return { ok: false, error: "Pick one of the answers." };
  return { ok: true, body: { onboardingAnswers: { ...answersOf(current), [questionId]: index } } };
}
