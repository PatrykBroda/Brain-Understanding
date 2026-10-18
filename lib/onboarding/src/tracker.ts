import type { OnboardingEventType } from "./steps";

/** A tracking call that has not answered by now is abandoned (it must never hold anything up). */
export const EVENT_TIMEOUT_MS = 5_000;
/**
 * At most this many tracking requests are in flight at once. A browser allows ~6
 * connections per host; if the events endpoint hangs, unbounded tracking calls
 * would queue ahead of the real save. Extra events while the cap is reached are dropped.
 */
export const MAX_IN_FLIGHT = 3;

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
  let inFlight = 0;
  return {
    track(step: string | undefined, event: OnboardingEventType): void {
      if (!step) return;
      const key = `${step}:${event}`;
      if (sent.has(key) || inFlight >= MAX_IN_FLIGHT) return;
      sent.add(key);
      inFlight += 1;
      let done = false;
      const settle = () => {
        if (done) return;
        done = true;
        inFlight -= 1;
      };
      try {
        const abort = new AbortController();
        const timer = setTimeout(() => {
          abort.abort();
          settle();
        }, EVENT_TIMEOUT_MS);
        Promise.resolve(send(step, event, abort.signal))
          .catch(() => {})
          .finally(() => {
            clearTimeout(timer);
            settle();
          });
      } catch {
        // never let tracking throw into the screen
        settle();
      }
    },
  };
}
