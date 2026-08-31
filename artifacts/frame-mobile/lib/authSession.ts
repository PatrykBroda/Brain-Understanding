export type SessionIdentity = {
  sub: string;
  email: string;
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
): Promise<SessionIdentity> {
  const identity = parseSessionToken(token);
  if (!identity) {
    throw new AuthSessionError(
      "invalid-token",
      "The server returned an invalid session.",
    );
  }

  try {
    await storage.setItem(token);
  } catch {
    await storage.deleteItem().catch(() => undefined);
    throw new AuthSessionError(
      "storage",
      "Your login could not be saved on this device.",
    );
  }

  return identity;
}