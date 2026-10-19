// Retrying a provider call that failed BEFORE anything reached the athlete.
//
// Why this exists: AI_PROVIDER_MAX_RETRIES is 0 (so consent is re-checked before
// every attempt). That meant a single 429/529 from a provider — a momentary rate
// limit, not an outage — went straight to the athlete as "FRAME is under heavy load
// right now". Retries are now explicit and app-level: each one re-checks consent,
// waits (honouring Retry-After), never fires once text has streamed, and stops at a
// deadline so the app's own 60s first-reply watchdog never trips during retries.

export interface ProviderErrorInfo {
  status?: number;
  retryAfterMs: number | null;
  requestId: string | null;
  kind: "rate_limit" | "overloaded" | "server" | "network" | "timeout" | "client" | "consent" | "unknown";
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
  deadlineMs: number;
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
  let lastErr: unknown;
  for (let attempt = 0; attempt < opts.maxAttempts; attempt++) {
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
      if (now() - started + waitMs > opts.deadlineMs) throw err;
      opts.onRetry?.({ attempt, waitMs, error: info });
      await sleep(waitMs);
    }
  }
  throw lastErr;
}
