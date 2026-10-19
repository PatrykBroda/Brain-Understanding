import { FLOWS, createStepTracker, type OnboardingEventType, type SendEvent } from "@workspace/onboarding";

// Loaded on first use so this module (and its tests) never pull in the native fetch.
const sendToApi: SendEvent = async (step, event, signal) => {
  const { apiPost } = await import("./api");
  return apiPost("/onboarding/event", { app: "mobile", step, event }, { signal });
};

/** Funnel tracking for sign-up and the Profile questions (fire-and-forget, see @workspace/onboarding). */
export function createOnboardingTracker(send: SendEvent = sendToApi) {
  const tracker = createStepTracker(send);
  return {
    /** Only steps the shared mobile flow knows are sent, so a rename in the package can never create a phantom step. */
    track(step: string | undefined, event: OnboardingEventType): void {
      if (step && (FLOWS.mobile as readonly string[]).includes(step)) tracker.track(step, event);
    },
  };
}

let shared: ReturnType<typeof createOnboardingTracker> | null = null;
/** One tracker for the whole app session, so each step event is sent at most once per launch. */
export function sharedOnboardingTracker() {
  return (shared ??= createOnboardingTracker());
}
