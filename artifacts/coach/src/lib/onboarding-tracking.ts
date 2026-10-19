import { createStepTracker, type SendEvent } from "@workspace/onboarding";

const base = import.meta.env.BASE_URL;

// Plain fetch, not jsonFetch: tracking must not trip the app's error handling or its 70s analysis timeout.
const sendToApi: SendEvent = async (step, event, signal) => {
  const { authHeaders } = await import("./api");
  return fetch(`${base}api/onboarding/event`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ app: "coach", step, event }),
    signal,
  });
};

/**
 * Funnel tracking for the coach app (fire-and-forget, see @workspace/onboarding). There is no onboarding
 * flow any more: Home reports "home", the Profile ONBOARDING QUESTIONS section reports "questions_view"
 * and one "complete" per answer the first time it is saved (dob, sport, level, frequency, goals, q_<id>).
 * The server records "signup" and "finish" itself.
 */
export function createOnboardingTracker(send: SendEvent = sendToApi) {
  return createStepTracker(send);
}

/** Sign-up funnel step keys (reported right after the account exists; the server records `signup` itself). */
export const SIGNUP_STEPS = { home: "home" } as const;

/**
 * Tracker for the sign-up screen. The auth context's token getter is only wired after the next
 * render, so this sends with the token returned by /auth/register instead of authHeaders().
 */
export function createSignupTracker(token: string) {
  return createStepTracker((step, event, signal) =>
    fetch(`${base}api/onboarding/event`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ app: "coach", step, event }),
      signal,
    }),
  );
}
