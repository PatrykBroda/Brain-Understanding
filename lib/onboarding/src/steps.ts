import { QUESTION_IDS } from "./questions";

// Step keys for onboarding funnel events. Both apps and the server validate
// against this list, so a typo can never create a phantom step in the funnel.

export const APPS = ["mobile", "coach"] as const;
export type OnboardingApp = (typeof APPS)[number];

export const EVENT_TYPES = ["view", "complete", "error"] as const;
export type OnboardingEventType = (typeof EVENT_TYPES)[number];

const QUESTION_STEPS = QUESTION_IDS.map((id) => `q_${id}`);

/**
 * There is no onboarding flow any more: sign-up is name, email, password and then straight into the
 * app, and the original questions live in the Profile tab ("ONBOARDING QUESTIONS"). The funnel
 * therefore tracks sign-up and how far people get through those questions afterwards.
 *
 *   signup          server: account created (needs `app` in the register body)
 *   home            client: first time the signed-in athlete lands on Home
 *   questions_view  client: the Profile questions section was opened (or the Home card tapped)
 *   dob / sport / level / frequency / goals
 *                   client: that answer was saved for the first time
 *   q_<id>          client (coach web only): one of its four behavioural questions answered
 *   finish          server: date of birth, sport, level and frequency are all present for the first
 *                   time (PATCH/POST /fighter); recorded once per athlete
 */
export const QUESTIONNAIRE_STEPS = ["dob", "sport", "level", "frequency", "goals"] as const;

export const FLOWS: Record<OnboardingApp, readonly string[]> = {
  mobile: ["signup", "home", "questions_view", ...QUESTIONNAIRE_STEPS, "finish"],
  coach: ["signup", "home", "questions_view", ...QUESTIONNAIRE_STEPS, ...QUESTION_STEPS, "finish"],
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
