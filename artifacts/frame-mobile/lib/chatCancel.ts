// Cancelling an in-flight coach reply. The athlete taps Stop while FRAME is
// loading or streaming; the UI must settle at once, whether or not the network
// layer manages to reject the pending read promptly.

/** Shown under a reply (or alone, if nothing had arrived) that the athlete stopped. */
export const STOPPED_LABEL = "Stopped.";

/** One per send. `race` makes any awaited step resolve to "cancelled" the instant `cancel` runs. */
export interface CancelGate {
  readonly cancelled: boolean;
  /** Idempotent. Aborts the current request (if any) and settles every pending `race`. */
  cancel(): void;
  /** The AbortController the current request should use; replaced per attempt. */
  newRequest(): AbortController;
  /** Resolves to the promise's result, or to CANCELLED as soon as the gate is cancelled. */
  race<T>(p: Promise<T>): Promise<T | typeof CANCELLED>;
}

export const CANCELLED = Symbol("cancelled");

export function createCancelGate(): CancelGate {
  let cancelled = false;
  let ctrl = new AbortController();
  let wake: (() => void) | null = null;
  const woken = new Promise<typeof CANCELLED>((resolve) => {
    wake = () => resolve(CANCELLED);
  });
  return {
    get cancelled() {
      return cancelled;
    },
    cancel() {
      if (cancelled) return;
      cancelled = true;
      ctrl.abort();
      wake?.();
    },
    newRequest() {
      ctrl = new AbortController();
      if (cancelled) ctrl.abort();
      return ctrl;
    },
    race<T>(p: Promise<T>) {
      // The abandoned promise may reject later (the abort): swallow it.
      p.catch(() => {});
      return Promise.race([p, woken]);
    },
  };
}

/** True for the error a fetch / stream read throws when its AbortSignal fires. */
export function isAbortError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { name?: unknown }).name === "AbortError"
  );
}
