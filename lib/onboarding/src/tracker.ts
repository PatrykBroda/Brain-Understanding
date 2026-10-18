import type { OnboardingEventType } from "./steps";

/** A tracking call that has not answered by now is abandoned (it must never hold anything up). */
export const EVENT_TIMEOUT_MS = 8_000;

export type SendEvent = (step: string, event: OnboardingEventType, signal: AbortSignal) => Promise<unknown>;

/**
 * Fire-and-forget funnel tracking for an onboarding screen. Every failure
 * (offline, 4xx, 5xx, a hung request, an exception) is swallowed: tracking
 * must never block, delay or break onboarding. Each (step, event) pair is
 * sent at most once per tracker, so re-renders and double taps don't repeat it.
 * `send` is the app's own HTTP call.
 */
export function createStepTracker(send: SendEvent) {
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
