export type SessionIdentity = {
  sub: string;
  email: string;
};

export type EstablishedSession = {
  identity: SessionIdentity;
  persistence: "secure" | "memory-only";
};

type SessionStorage = {
  setItem: (token: string) => Promise<void>;
  deleteItem: () => Promise<void>;
};

export class AuthSessionError extends Error {
  readonly reason: "invalid-token" | "storage";

  constructor(reason: "invalid-token" | "storage", message: string) {
    super(message);
    this.name = "AuthSessionError";
    this.reason = reason;
  }
}

function decodeBase64Url(value: string): string {
  if (!value || value.length % 4 === 1 || !/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error("Invalid base64url");
  }

  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  const bytes: number[] = [];
  let buffer = 0;
  let bitCount = 0;

  for (const character of value) {
    buffer = buffer * 64 + alphabet.indexOf(character);
    bitCount += 6;

    while (bitCount >= 8) {
      bitCount -= 8;
      bytes.push(Math.floor(buffer / 2 ** bitCount) & 0xff);
      buffer %= 2 ** bitCount;
    }
  }

  if (bitCount > 0 && buffer !== 0) {
    throw new Error("Invalid base64url padding");
  }

  const encodedBytes = bytes
    .map((byte) => `%${byte.toString(16).padStart(2, "0")}`)
    .join("");
  return decodeURIComponent(encodedBytes);
}

export function parseSessionToken(
  token: string,
  now = Date.now(),
): SessionIdentity | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const payload = JSON.parse(decodeBase64Url(parts[1]!)) as {
      sub?: unknown;
      email?: unknown;
      exp?: unknown;
    };

    if (
      typeof payload.sub !== "string" ||
      !payload.sub ||
      typeof payload.email !== "string" ||
      !payload.email
    ) {
      return null;
    }

    if (
      payload.exp !== undefined &&
      (typeof payload.exp !== "number" || payload.exp * 1000 < now)
    ) {
      return null;
    }

    return { sub: payload.sub, email: payload.email };
  } catch {
    return null;
  }
}

/** Pauses between save attempts before falling back to a memory-only session (4 tries in all). */
export const PERSIST_RETRY_DELAYS_MS = [150, 400, 1000];

export type PersistOptions = {
  /** Pause before each retry; its length is the number of retries. */
  delaysMs?: number[];
  /** Called with every failed attempt, so the real storage error is recorded, not swallowed. */
  onError?: (error: unknown, attempt: number) => void;
};

export async function establishSession(
  token: string,
  storage: SessionStorage,
  opts: PersistOptions = {},
): Promise<EstablishedSession> {
  const identity = parseSessionToken(token);
  if (!identity) {
    throw new AuthSessionError(
      "invalid-token",
      "The server returned an invalid session.",
    );
  }

  const saved = await persistToken(token, storage.setItem, opts);
  if (!saved) {
    // Last resort (see .agents/memory/mobile-auth-persistence-fallback.md): never fall back to
    // insecure storage; keep the login for this process only.
    await storage.deleteItem().catch(() => undefined);
    return { identity, persistence: "memory-only" };
  }

  return { identity, persistence: "secure" };
}

/**
 * Save the token, retrying with backoff (a keychain can fail transiently). Resolves true once a
 * write succeeds, false when every attempt failed. Never throws.
 */
export async function persistToken(
  token: string,
  setItem: (token: string) => Promise<void>,
  opts: PersistOptions = {},
): Promise<boolean> {
  try {
    await retryWithBackoff(() => setItem(token), opts.delaysMs ?? PERSIST_RETRY_DELAYS_MS, opts.onError);
    return true;
  } catch {
    return false;
  }
}

/** Run `fn`; after each failure wait the next delay and try again. Rethrows the last error. */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  delaysMs: number[],
  onError?: (error: unknown, attempt: number) => void,
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      onError?.(e, attempt);
      const pause = delaysMs[attempt - 1];
      if (pause === undefined) throw e;
      if (pause > 0) await new Promise((resolve) => setTimeout(resolve, pause));
    }
  }
}

/** A short, log-safe description of a storage error (never includes the token). */
export function describeStorageError(error: unknown): string {
  if (error instanceof Error) {
    const code = (error as { code?: unknown }).code;
    return `${error.name}: ${error.message}${code !== undefined ? ` (code ${String(code)})` : ""}`;
  }
  return String(error);
}

// ─── Saved-login persistence (restore / refresh) ─────────────────────────────

/** Where the JWT is kept: SecureStore on a phone, localStorage on the web build. */
export type TokenBackend = {
  get: () => Promise<string | null>;
  set: (token: string) => Promise<void>;
  remove: () => Promise<void>;
};

/** Run `fn`, and once more after a short pause if it throws (a keychain can fail transiently). */
export async function retryOnce<T>(fn: () => Promise<T>, pauseMs = 150): Promise<T> {
  try {
    return await fn();
  } catch {
    if (pauseMs > 0) await new Promise((resolve) => setTimeout(resolve, pauseMs));
    return fn();
  }
}

export type RestoredSession =
  | { status: "none" } // nothing was saved: a normal first open, not an error
  | { status: "restored"; token: string; identity: SessionIdentity }
  | { status: "invalid" } // a saved token existed but is expired/garbled; it was cleared
  | { status: "unreadable" }; // storage failed twice; the saved token is left untouched

/**
 * Read the saved login. A read that fails (twice) is "unreadable" and NEVER deletes the token:
 * the keychain can be briefly unavailable (device locked, app woken in the background) and the
 * login is still there next time. Only a token that was read and is provably expired/garbled
 * is cleared.
 */
export async function restoreSession(
  backend: TokenBackend,
  now = Date.now(),
  pauseMs = 150,
  onError?: (error: unknown) => void,
): Promise<RestoredSession> {
  let raw: string | null;
  try {
    raw = await retryOnce(() => backend.get(), pauseMs);
  } catch (e) {
    onError?.(e);
    return { status: "unreadable" };
  }
  if (!raw) return { status: "none" };
  const identity = parseSessionToken(raw, now);
  if (!identity) {
    await backend.remove().catch(() => undefined);
    return { status: "invalid" };
  }
  return { status: "restored", token: raw, identity };
}

/** Pauses between cold-start reads while the keychain is unreadable; the last one repeats. */
export const RESTORE_RETRY_DELAYS_MS = [300, 1000, 3000];
/** How long an unreadable keychain keeps the boot screen up before the sign-in fallback. */
export const RESTORE_GIVE_UP_AFTER_MS = 10_000;

export type RestoreWithBackoffOptions = {
  delaysMs?: number[];
  giveUpAfterMs?: number;
  /** Pause between attempts; the app passes one it can cut short when it returns to the foreground. */
  sleep?: (ms: number) => Promise<void>;
  clock?: () => number;
  pauseMs?: number;
  onError?: (error: unknown, attempt: number) => void;
  /** Stop early (e.g. a sign-in already happened); the last result is returned. */
  shouldStop?: () => boolean;
};

/**
 * Cold-start restore. "unreadable" means *not loaded yet*, not signed out: the read is retried with
 * backoff and only reported as unreadable once it has kept failing for `giveUpAfterMs`. "none",
 * "invalid" and "restored" are final and returned straight away.
 */
export async function restoreWithBackoff(
  backend: TokenBackend,
  opts: RestoreWithBackoffOptions = {},
): Promise<RestoredSession> {
  const delays = opts.delaysMs ?? RESTORE_RETRY_DELAYS_MS;
  const giveUpAfterMs = opts.giveUpAfterMs ?? RESTORE_GIVE_UP_AFTER_MS;
  const clock = opts.clock ?? Date.now;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const started = clock();
  for (let attempt = 1; ; attempt++) {
    const result = await restoreSession(backend, clock(), opts.pauseMs ?? 150, (e) =>
      opts.onError?.(e, attempt),
    );
    if (result.status !== "unreadable") return result;
    if (opts.shouldStop?.()) return result;
    if (clock() - started >= giveUpAfterMs) return result;
    const pause = delays[Math.min(attempt - 1, delays.length - 1)] ?? 0;
    await sleep(pause);
    if (opts.shouldStop?.()) return result;
  }
}

/** How long POST /auth/refresh may take before it counts as "unavailable" (the login is kept). */
export const REFRESH_TIMEOUT_MS = 15_000;

export type RefreshOutcome =
  | { status: "refreshed"; token: string }
  | { status: "rejected" } // the server said 401: the login is truly dead
  | { status: "unavailable" }; // offline / 5xx / timeout / anything else: keep the login as it is

/**
 * Exchange the saved token for a fresh one. `call` performs the request and throws an error
 * carrying `status` for an HTTP failure. Only a real 401 rejects the session.
 */
export async function refreshSessionToken(
  token: string,
  call: (token: string) => Promise<{ token?: unknown }>,
): Promise<RefreshOutcome> {
  try {
    const res = await call(token);
    if (typeof res?.token === "string" && parseSessionToken(res.token)) {
      return { status: "refreshed", token: res.token };
    }
    return { status: "unavailable" };
  } catch (e) {
    const status = (e as { status?: unknown } | null)?.status;
    return status === 401 ? { status: "rejected" } : { status: "unavailable" };
  }
}
