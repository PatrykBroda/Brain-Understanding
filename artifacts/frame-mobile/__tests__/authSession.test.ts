import { describe, expect, it } from "vitest";
import {
  establishSession,
  parseSessionToken,
} from "../lib/authSession";

function base64Url(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function token(payload: object): string {
  return `${base64Url('{"alg":"HS256","typ":"JWT"}')}.${base64Url(
    JSON.stringify(payload),
  )}.signature`;
}

describe("parseSessionToken", () => {
  it("reads a valid session without relying on global atob", () => {
    const originalAtob = globalThis.atob;
    // Match a native runtime where atob is unavailable.
    Object.defineProperty(globalThis, "atob", {
      configurable: true,
      value: undefined,
    });

    try {
      expect(
        parseSessionToken(
          token({
            sub: "user-123",
            email: "athlete@example.com",
            exp: 2_000_000_000,
          }),
          1_900_000_000_000,
        ),
      ).toEqual({ sub: "user-123", email: "athlete@example.com" });
    } finally {
      Object.defineProperty(globalThis, "atob", {
        configurable: true,
        value: originalAtob,
      });
    }
  });

  it("decodes UTF-8 identity claims", () => {
    expect(
      parseSessionToken(
        token({
          sub: "ผู้ใช้",
          email: "นักกีฬา@example.com",
          exp: 2_000_000_000,
        }),
        1_900_000_000_000,
      ),
    ).toEqual({ sub: "ผู้ใช้", email: "นักกีฬา@example.com" });
  });

  it("rejects expired, malformed, and incomplete sessions", () => {
    expect(
      parseSessionToken(
        token({ sub: "user-123", email: "athlete@example.com", exp: 100 }),
        101_000,
      ),
    ).toBeNull();
    expect(parseSessionToken("not-a-jwt")).toBeNull();
    expect(parseSessionToken(token({ sub: "user-123" }))).toBeNull();
  });
});

describe("establishSession", () => {
  it("rejects an invalid token without touching secure storage", async () => {
    let storageTouched = false;

    await expect(
      establishSession("not-a-jwt", {
        setItem: async () => {
          storageTouched = true;
        },
        deleteItem: async () => {
          storageTouched = true;
        },
      }),
    ).rejects.toMatchObject({
      name: "AuthSessionError",
      reason: "invalid-token",
    });
    expect(storageTouched).toBe(false);
  });

  it("establishes a valid session with one secure write and no read-back", async () => {
    const writes: string[] = [];
    const validToken = token({
      sub: "user-123",
      email: "athlete@example.com",
      exp: 2_000_000_000,
    });

    await expect(
      establishSession(validToken, {
        setItem: async (value) => {
          writes.push(value);
        },
        deleteItem: async () => undefined,
      }),
    ).resolves.toEqual({
      identity: { sub: "user-123", email: "athlete@example.com" },
      persistence: "secure",
    });
    expect(writes).toEqual([validToken]);
  });

  it("keeps a valid session in memory and cleans up a secure storage failure", async () => {
    let deleted = false;
    const validToken = token({
      sub: "user-123",
      email: "athlete@example.com",
      exp: 2_000_000_000,
    });

    const result = establishSession(validToken, {
      setItem: async () => {
        throw new Error("Keychain unavailable");
      },
      deleteItem: async () => {
        deleted = true;
      },
    });

    await expect(result).resolves.toEqual({
      identity: { sub: "user-123", email: "athlete@example.com" },
      persistence: "memory-only",
    });
    expect(deleted).toBe(true);
  });
});