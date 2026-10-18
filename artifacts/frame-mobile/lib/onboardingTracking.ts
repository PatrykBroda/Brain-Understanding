import { createStepTracker, type SendEvent } from "@workspace/onboarding";

// Loaded on first use so this module (and its tests) never pull in the native fetch.
const sendToApi: SendEvent = async (step, event, signal) => {
  const { apiPost } = await import("./api");
  return apiPost("/onboarding/event", { app: "mobile", step, event }, { signal });
};

/** Funnel tracking for the mobile onboarding screens (fire-and-forget, see @workspace/onboarding). */
export function createOnboardingTracker(send: SendEvent = sendToApi) {
  return createStepTracker(send);
}
