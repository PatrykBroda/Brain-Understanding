import type { OnboardingEventType } from "@workspace/onboarding";

/** A tracking call that has not answered by now is abandoned (it must never hold anything up). */
const EVENT_TIMEOUT_MS = 8_000;

type Send = (step: string, event: OnboardingEventType, signal: AbortSignal) => Promise<unknown>;

// Loaded on first use so this module (and its tests) never pull in the native fetch.
const sendToApi: Send = async (step, event, signal) => {
  const { apiPost } = await import("./api");
  return apiPost("/onboarding/event", { app: "mobile", step, event }, { signal });
};

/**
 * Fire-and-forget funnel tracking for the onboarding screens. Every failure
 * (offline, 4xx, 5xx, a hung request, an exception) is swallowed: tracking
 * must never block, delay or break onboarding. Each (step, event) pair is
 * sent at most once per tracker, so re-renders and double taps don't repeat it.
 */
export function createOnboardingTracker(send: Send = sendToApi) {
  const sent = new Set<string>();
  return {
    track(step: string | undefined, event: OnboardingEventType): void {
      if (!step) return;
      const key = `${step}:${event}`;
      if (sent.has(key)) return;
      sent.add(key);
      try {
        const abort = new AbortController();
        const timer = setTimeout(() => abort.abort(), EVENT_TIMEOUT_MS);
        Promise.resolve(send(step, event, abort.signal))
          .catch(() => {})
          .finally(() => clearTimeout(timer));
      } catch {
        // never let tracking throw into the screen
      }
    },
  };
}
