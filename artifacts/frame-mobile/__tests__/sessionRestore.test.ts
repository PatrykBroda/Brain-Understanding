import { describe, expect, it } from "vitest";
import {
  establishSession,
  refreshSessionToken,
  restoreSession,
  type TokenBackend,
} from "../lib/authSession";

function jwt(payload: object): string {
  const b64 = (v: string) => Buffer.from(v, "utf8").toString("base64url");
  return `${b64('{"alg":"HS256","typ":"JWT"}')}.${b64(JSON.stringify(payload))}.sig`;
}
const GOOD = jwt({ sub: "u1", email: "a@b.co", exp: 4_000_000_000 });
const EXPIRED = jwt({ sub: "u1", email: "a@b.co", exp: 100 });

/** In-memory stand-in for SecureStore / localStorage that survives "restarts" (it is the disk). */
function memoryBackend(opts: { failReads?: number; failWrites?: number } = {}) {
  let value: string | null = null;
  let failReads = opts.failReads ?? 0;
  let failWrites = opts.failWrites ?? 0;
  const calls = { get: 0, set: 0, remove: 0 };
  const backend: TokenBackend = {
    get: async () => {
      calls.get++;
      if (failReads-- > 0) throw new Error("keychain locked");
      return value;
    },
    set: async (t) => {
      calls.set++;
      if (failWrites-- > 0) throw new Error("keychain write failed");
      value = t;
    },
    remove: async () => {
      calls.remove++;
      value = null;
    },
  };
  return { backend, calls, peek: () => value };
}

describe("saved login survives an app restart", () => {
  it("sign-in persists the token and a fresh launch restores the same session", async () => {
    const disk = memoryBackend();
    await establishSession(GOOD, { setItem: disk.backend.set, deleteItem: disk.backend.remove });

    // "restart": a new launch only has the backend to go on
    const restored = await restoreSession(disk.backend, Date.now(), 0);
    expect(restored).toEqual({
      status: "restored",
      token: GOOD,
      identity: { sub: "u1", email: "a@b.co" },
    });
  });

  it("a single failed write is retried and still ends up saved", async () => {
    const disk = memoryBackend({ failWrites: 1 });
    const res = await establishSession(GOOD, { setItem: disk.backend.set, deleteItem: disk.backend.remove });
    expect(res.persistence).toBe("secure");
    expect(disk.peek()).toBe(GOOD);
  });

  it("no saved login is a quiet first open, not an error", async () => {
    const disk = memoryBackend();
    expect(await restoreSession(disk.backend, Date.now(), 0)).toEqual({ status: "none" });
  });
});

describe("transient storage failures never log the user out", () => {
  it("one failed read is retried and restores the session", async () => {
    const disk = memoryBackend({ failReads: 1 });
    await disk.backend.set(GOOD);
    const restored = await restoreSession(disk.backend, Date.now(), 0);
    expect(restored.status).toBe("restored");
  });

  it("two failed reads report unreadable and leave the saved token untouched", async () => {
    const disk = memoryBackend({ failReads: 2 });
    await disk.backend.set(GOOD);
    const restored = await restoreSession(disk.backend, Date.now(), 0);
    expect(restored).toEqual({ status: "unreadable" });
    expect(disk.calls.remove).toBe(0);
    expect(disk.peek()).toBe(GOOD);
    // the next attempt (app returns to foreground) works
    expect((await restoreSession(disk.backend, Date.now(), 0)).status).toBe("restored");
  });

  it("an expired token is cleared (that one is provably dead)", async () => {
    const disk = memoryBackend();
    await disk.backend.set(EXPIRED);
    expect(await restoreSession(disk.backend, Date.now(), 0)).toEqual({ status: "invalid" });
    expect(disk.peek()).toBeNull();
  });

  it("offline / 5xx on refresh keeps the login; only a real 401 rejects it", async () => {
    const http = (status: number) => async () => {
      throw Object.assign(new Error(`HTTP ${status}`), { status });
    };
    expect(await refreshSessionToken(GOOD, async () => { throw new TypeError("Network request failed"); })).toEqual({ status: "unavailable" });
    expect(await refreshSessionToken(GOOD, http(500))).toEqual({ status: "unavailable" });
    expect(await refreshSessionToken(GOOD, http(503))).toEqual({ status: "unavailable" });
    expect(await refreshSessionToken(GOOD, http(401))).toEqual({ status: "rejected" });
  });

  it("a good refresh returns the new token; a garbage body is ignored", async () => {
    const fresh = jwt({ sub: "u1", email: "a@b.co", exp: 4_100_000_000 });
    expect(await refreshSessionToken(GOOD, async () => ({ token: fresh }))).toEqual({ status: "refreshed", token: fresh });
    expect(await refreshSessionToken(GOOD, async () => ({ token: "nope" }))).toEqual({ status: "unavailable" });
  });
});
