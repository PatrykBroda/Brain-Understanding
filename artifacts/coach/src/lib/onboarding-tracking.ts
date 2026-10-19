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

/** Funnel tracking for the coach onboarding (fire-and-forget, see @workspace/onboarding). */
export function createOnboardingTracker(send: SendEvent = sendToApi) {
  return createStepTracker(send);
}
