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

export async function establishSession(
  token: string,
  storage: SessionStorage,
): Promise<EstablishedSession> {
  const identity = parseSessionToken(token);
  if (!identity) {
    throw new AuthSessionError(
      "invalid-token",
      "The server returned an invalid session.",
    );
  }

  try {
    await retryOnce(() => storage.setItem(token));
  } catch {
    await storage.deleteItem().catch(() => undefined);
    return { identity, persistence: "memory-only" };
  }

  return { identity, persistence: "secure" };
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
): Promise<RestoredSession> {
  let raw: string | null;
  try {
    raw = await retryOnce(() => backend.get(), pauseMs);
  } catch {
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

export type RefreshOutcome =
  | { status: "refreshed"; token: string }
  | { status: "rejected" } // the server said 401: the login is truly dead
  | { status: "unavailable" }; // offline / 5xx / anything else: keep the login as it is

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
