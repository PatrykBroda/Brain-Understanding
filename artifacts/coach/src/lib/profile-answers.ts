// The onboarding questionnaire as it is shown and edited on Profile (coach web). Same fields,
// canonical values and validation as onboarding; this file only turns a stored fighter into
// display rows and a single edit into a PATCH /api/fighter body. Mirrors
// artifacts/frame-mobile/lib/profileAnswers.ts.

import { QUESTIONS, sanitiseAnswers, sportLabelFor, type Answers } from "@workspace/onboarding";
import { dobProblem } from "./onboarding-form";

export type AnswerFighter = {
  dateOfBirth?: string | null;
  primarySport?: string | null;
  level?: string | null;
  trainingFrequency?: string | null;
  goals?: string | null;
  weaknesses?: string | null;
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

export type PatchResult = { ok: true; body: Record<string, unknown> } | { ok: false; error: string };

export function sportPatch(sport: string, level: string): PatchResult {
  if (!sport) return { ok: false, error: "Choose what you train." };
  if (!level) return { ok: false, error: "Choose your level too." };
  return { ok: true, body: { primarySport: sport, art: sportLabelFor(sport) ?? sport, level } };
}

export function frequencyPatch(freq: string): PatchResult {
  return freq ? { ok: true, body: { trainingFrequency: freq } } : { ok: false, error: "Choose how often you train." };
}

/** `value` is "YYYY-MM-DD" from an <input type="date">. */
export function dobPatch(value: string, today = new Date()): PatchResult {
  const problem = dobProblem(value, today);
  return problem ? { ok: false, error: problem } : { ok: true, body: { dateOfBirth: value } };
}

export function textPatch(kind: "goals" | "weaknesses", value: string): PatchResult {
  return { ok: true, body: { [kind]: value.trim() } };
}

/** Changing one behavioural answer sends ALL current answers; the server recomposes `personality` from them. */
export function questionPatch(current: AnswerFighter, questionId: string, index: number): PatchResult {
  const q = QUESTIONS.find((x) => x.id === questionId);
  if (!q || index < 0 || index >= q.choices.length) return { ok: false, error: "Pick one of the answers." };
  return { ok: true, body: { onboardingAnswers: { ...answersOf(current), [questionId]: index } } };
}
