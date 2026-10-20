import { beforeEach, describe, expect, it, vi } from "vitest";

// A SecureStore stand-in that enforces the real library's key rule (ensureValidKey) and keeps its
// contents across "app restarts" (module re-imports), like the keychain does.
const disk = new Map<string, string>();
vi.mock("react-native", () => ({ Platform: { OS: "ios" } }));
vi.mock("expo-secure-store", () => {
  const check = (key: string) => {
    if (typeof key !== "string" || !/^[\w.-]+$/.test(key)) {
      throw new Error('Invalid key provided to SecureStore. Keys must not be empty and contain only alphanumeric characters, ".", "-", and "_".');
    }
  };
  return {
    AFTER_FIRST_UNLOCK: 1,
    getItemAsync: async (key: string) => (check(key), disk.get(key) ?? null),
    setItemAsync: async (key: string, value: string) => (check(key), void disk.set(key, value)),
    deleteItemAsync: async (key: string) => (check(key), void disk.delete(key)),
  };
});

import { establishSession, restoreSession } from "../lib/authSession";

function jwt(payload: object): string {
  const b64 = (v: string) => Buffer.from(v, "utf8").toString("base64url");
  return `${b64('{"alg":"HS256"}')}.${b64(JSON.stringify(payload))}.sig`;
}
const TOKEN = jwt({ sub: "u1", email: "a@b.co", exp: 4_000_000_000 });

describe("native token backend (real SecureStore key rules)", () => {
  beforeEach(() => {
    disk.clear();
    vi.resetModules();
  });

  it("uses a key SecureStore accepts", async () => {
    const { NATIVE_TOKEN_KEY } = await import("../lib/tokenBackend");
    expect(NATIVE_TOKEN_KEY).toMatch(/^[\w.-]+$/);
  });

  it("sign-in saves securely (not memory-only) and the login survives a restart", async () => {
    const first = (await import("../lib/tokenBackend")).tokenBackend;
    const session = await establishSession(TOKEN, {
      setItem: (t) => first.set(t),
      deleteItem: () => first.remove(),
    });
    expect(session.persistence).toBe("secure");

    vi.resetModules(); // cold start: new JS runtime, same keychain
    const second = (await import("../lib/tokenBackend")).tokenBackend;
    const restored = await restoreSession(second, Date.now(), 0);
    expect(restored.status).toBe("restored");
  });

  it("sign-out removes the saved login", async () => {
    const { tokenBackend } = await import("../lib/tokenBackend");
    await tokenBackend.set(TOKEN);
    await tokenBackend.remove();
    expect((await restoreSession(tokenBackend, Date.now(), 0)).status).toBe("none");
  });
});
