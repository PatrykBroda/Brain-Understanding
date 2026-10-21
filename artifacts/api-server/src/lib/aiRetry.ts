// Retrying a provider call that failed BEFORE anything reached the athlete.
//
// Why this exists: AI_PROVIDER_MAX_RETRIES is 0 (so consent is re-checked before
// every attempt). That meant a single 429/529 from a provider — a momentary rate
// limit, not an outage — went straight to the athlete as "FRAME is under heavy load
// right now". Retries are now explicit and app-level: each one re-checks consent,
// waits (honouring Retry-After), never fires once text has streamed, and stops at a
// deadline so the app's own 60s first-reply watchdog never trips during retries.
// The deadline can be an absolute time shared by several runs (the athlete's
// provider, then the fallback), so the fallback never gets a fresh budget.

export interface ProviderErrorInfo {
  status?: number;
  retryAfterMs: number | null;
  requestId: string | null;
  kind:
    | "rate_limit"
    | "overloaded"
    | "server"
    | "network"
    | "timeout"
    | "aborted"
    | "client"
    | "consent"
    | "unknown";
}

function field(err: unknown, key: string): unknown {
  return typeof err === "object" && err !== null ? (err as Record<string, unknown>)[key] : undefined;
}

function headerOf(err: unknown, name: string): string | null {
  const h = field(err, "headers");
  if (!h) return null;
  if (typeof (h as { get?: unknown }).get === "function") {
    const v = (h as { get(n: string): string | null }).get(name);
    return v ?? null;
  }
  const v = (h as Record<string, unknown>)[name] ?? (h as Record<string, unknown>)[name.toLowerCase()];
  return typeof v === "string" ? v : null;
}

/** What a provider error is, without ever surfacing its raw text to the athlete. */
export function describeProviderError(err: unknown): ProviderErrorInfo {
  const status = typeof field(err, "status") === "number" ? (field(err, "status") as number) : undefined;
  const name = String(field(err, "name") ?? (err as object | null)?.constructor?.name ?? "");
  const message = err instanceof Error ? err.message : String(err ?? "");
  let retryAfterMs: number | null = null;
  const ra = headerOf(err, "retry-after");
  if (ra) {
    const secs = Number(ra);
    if (Number.isFinite(secs)) retryAfterMs = Math.max(0, secs * 1000);
    else {
      const when = Date.parse(ra);
      if (!Number.isNaN(when)) retryAfterMs = Math.max(0, when - Date.now());
    }
  }
  const requestId = headerOf(err, "request-id") ?? headerOf(err, "x-request-id");

  let kind: ProviderErrorInfo["kind"] = "unknown";
  if (field(err, "code") === "AI_CONSENT_REQUIRED") kind = "consent";
  else if (/Timeout/i.test(name) || /timed? ?out/i.test(message)) kind = "timeout";
  else if (/Abort/i.test(name) || /\baborted\b/i.test(message)) kind = "aborted";
  else if (/Connection/i.test(name) || /ECONNRESET|ECONNREFUSED|ENOTFOUND|socket hang up|fetch failed/i.test(message)) kind = "network";
  else if (status === 429) kind = "rate_limit";
  else if (status === 529 || /overloaded/i.test(message)) kind = "overloaded";
  else if (status !== undefined && status >= 500) kind = "server";
  else if (status !== undefined && status >= 400) kind = "client";
  return { status, retryAfterMs, requestId, kind };
}

/** True for failures that are worth another try: busy, overloaded, 5xx, dropped connection. */
export function isRetryableProviderError(err: unknown): boolean {
  const { kind } = describeProviderError(err);
  return kind === "rate_limit" || kind === "overloaded" || kind === "server" || kind === "network";
}

const BACKOFF_MS = [800, 2000, 4000];

export function backoffFor(attempt: number, retryAfterMs: number | null): number {
  const base = BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)]!;
  const jitter = Math.floor(Math.random() * 250);
  const wanted = retryAfterMs != null ? Math.max(base, retryAfterMs) : base;
  return Math.min(wanted, 8000) + jitter;
}

export interface RetryOptions {
  /** Total tries including the first. */
  maxAttempts: number;
  /** Give up retrying once this many ms have passed since the first try started. */
  deadlineMs?: number;
  /** Absolute deadline (same clock as `now`). Wins over `deadlineMs`; share it across runs. */
  deadlineAt?: number;
  /** Don't start another attempt unless at least this long is left before the deadline. */
  minAttemptMs?: number;
  /** Stop at once (no further attempts or waits) when this fires, e.g. the client went away. */
  signal?: AbortSignal;
  /** Runs before EVERY attempt, including the first (consent re-check). Throw to stop. */
  beforeAttempt?: (attempt: number) => Promise<void>;
  /** Only retry while nothing has been shown to the athlete. */
  canRetry?: (err: unknown) => boolean;
  onRetry?: (info: { attempt: number; waitMs: number; error: ProviderErrorInfo }) => void;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

export async function runWithRetry<T>(op: (attempt: number) => Promise<T>, opts: RetryOptions): Promise<T> {
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const now = opts.now ?? Date.now;
  const started = now();
  const deadline = opts.deadlineAt ?? started + (opts.deadlineMs ?? Number.POSITIVE_INFINITY);
  const minAttemptMs = opts.minAttemptMs ?? 0;
  let lastErr: unknown;
  for (let attempt = 0; attempt < opts.maxAttempts; attempt++) {
    if (opts.signal?.aborted) throw abortError(opts.signal);
    if (opts.beforeAttempt) await opts.beforeAttempt(attempt);
    try {
      return await op(attempt);
    } catch (err) {
      lastErr = err;
      const retryable = isRetryableProviderError(err) && (opts.canRetry ? opts.canRetry(err) : true);
      const last = attempt === opts.maxAttempts - 1;
      if (!retryable || last) throw err;
      const info = describeProviderError(err);
      const waitMs = backoffFor(attempt, info.retryAfterMs);
      if (now() + waitMs + minAttemptMs > deadline) throw err;
      if (opts.signal?.aborted) throw err;
      opts.onRetry?.({ attempt, waitMs, error: info });
      await sleep(waitMs);
    }
  }
  throw lastErr;
}

function abortError(signal: AbortSignal): Error {
  const reason: unknown = signal.reason;
  if (reason instanceof Error) return reason;
  const e = new Error("Request was aborted.");
  e.name = "AbortError";
  return e;
}

/** A provider produced no text within the per-attempt first-token window. */
export class FirstTokenTimeoutError extends Error {
  constructor(readonly afterMs: number) {
    super(`provider first token timed out after ${afterMs}ms`);
    this.name = "FirstTokenTimeoutError";
  }
}

export interface FirstTokenGuard {
  /** Pass this to the provider call: aborts on the parent signal or the first-token timeout. */
  readonly signal: AbortSignal;
  /** Call on the first streamed token; the timeout no longer applies after that. */
  gotToken(): void;
  readonly timedOut: boolean;
  dispose(): void;
}

/**
 * One provider attempt's abort signal: follows `parent` (client went away) and
 * fires on its own if no token arrives within `timeoutMs`. After the first
 * token the stream may run as long as it needs.
 */
export function firstTokenGuard(parent: AbortSignal | undefined, timeoutMs: number): FirstTokenGuard {
  const ctl = new AbortController();
  let timedOut = false;
  const onParent = () => ctl.abort(parent?.reason);
  if (parent?.aborted) ctl.abort(parent.reason);
  else parent?.addEventListener("abort", onParent, { once: true });
  const timer = setTimeout(() => {
    timedOut = true;
    ctl.abort(new FirstTokenTimeoutError(timeoutMs));
  }, Math.max(0, timeoutMs));
  timer.unref?.();
  return {
    signal: ctl.signal,
    gotToken: () => clearTimeout(timer),
    get timedOut() {
      return timedOut;
    },
    dispose: () => {
      clearTimeout(timer);
      parent?.removeEventListener("abort", onParent);
    },
  };
}
