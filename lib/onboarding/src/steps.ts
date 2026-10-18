import { QUESTION_IDS } from "./questions";

// Step keys for onboarding funnel events. Both apps and the server validate
// against this list, so a typo can never create a phantom step in the funnel.

export const APPS = ["mobile", "coach"] as const;
export type OnboardingApp = (typeof APPS)[number];

export const EVENT_TYPES = ["view", "complete", "error"] as const;
export type OnboardingEventType = (typeof EVENT_TYPES)[number];

const QUESTION_STEPS = QUESTION_IDS.map((id) => `q_${id}`);

/**
 * Ordered steps each app's flow goes through. `signup` (account created) and
 * `finish` (profile saved, onboarding done) are recorded by the server; the
 * rest are sent by the app as the person moves through the screens.
 */
export const FLOWS: Record<OnboardingApp, readonly string[]> = {
  mobile: ["signup", "name", "dob", "sport", "frequency", ...QUESTION_STEPS, "goals", "finish"],
  coach: ["signup", "welcome", ...QUESTION_STEPS, "details", "finish"],
};

/** Steps a client is allowed to report (the server records `signup` and `finish` itself). */
const SERVER_ONLY_STEPS = new Set(["signup", "finish"]);

export function isClientStep(app: OnboardingApp, step: string): boolean {
  return FLOWS[app].includes(step) && !SERVER_ONLY_STEPS.has(step);
}

export function isApp(v: unknown): v is OnboardingApp {
  return typeof v === "string" && (APPS as readonly string[]).includes(v);
}

export function isEventType(v: unknown): v is OnboardingEventType {
  return typeof v === "string" && (EVENT_TYPES as readonly string[]).includes(v);
}

/** The step key for question `id` ("tired" -> "q_tired"). */
export const questionStep = (id: string) => `q_${id}`;
