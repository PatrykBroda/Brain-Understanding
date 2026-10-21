import { describe, expect, it } from "vitest";
import {
  establishSession,
  persistToken,
  refreshSessionToken,
  restoreSession,
  restoreWithBackoff,
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

/** A fake clock + sleep so backoff runs instantly and the give-up window is deterministic. */
function fakeTime() {
  let t = 0;
  const slept: number[] = [];
  return {
    clock: () => t,
    sleep: async (ms: number) => {
      slept.push(ms);
      t += ms;
    },
    slept,
  };
}

describe("cold start with a briefly unreadable keychain (launched while locked)", () => {
  it("unreadable then readable keeps the user signed in, never reaching the sign-in fallback", async () => {
    // 3 restore attempts × 2 reads each fail, then the device unlocks.
    const disk = memoryBackend({ failReads: 6 });
    await disk.backend.set(GOOD);
    const time = fakeTime();
    const errors: number[] = [];
    const restored = await restoreWithBackoff(disk.backend, {
      clock: time.clock,
      sleep: time.sleep,
      pauseMs: 0,
      onError: (_e, attempt) => errors.push(attempt),
    });
    expect(restored.status).toBe("restored");
    expect(time.slept).toEqual([300, 1000, 3000]);
    expect(errors).toEqual([1, 2, 3]); // the real read error is reported each time
    expect(disk.calls.remove).toBe(0);
    expect(disk.peek()).toBe(GOOD);
  });

  it("only gives up (unreadable) after the keychain has failed for the whole window, token kept", async () => {
    const disk = memoryBackend({ failReads: Number.POSITIVE_INFINITY });
    await disk.backend.set(GOOD);
    const time = fakeTime();
    const restored = await restoreWithBackoff(disk.backend, {
      clock: time.clock,
      sleep: time.sleep,
      pauseMs: 0,
      giveUpAfterMs: 10_000,
    });
    expect(restored).toEqual({ status: "unreadable" });
    expect(time.clock()).toBeGreaterThanOrEqual(10_000);
    expect(disk.peek()).toBe(GOOD);
    expect(disk.calls.remove).toBe(0);
  });

  it("no saved token is final at once (no retry delay before the sign-in screen)", async () => {
    const disk = memoryBackend();
    const time = fakeTime();
    expect(await restoreWithBackoff(disk.backend, { clock: time.clock, sleep: time.sleep, pauseMs: 0 })).toEqual({ status: "none" });
    expect(time.slept).toEqual([]);
  });

  it("stops waiting when a sign-in happens meanwhile", async () => {
    const disk = memoryBackend({ failReads: Number.POSITIVE_INFINITY });
    let signedIn = false;
    const time = fakeTime();
    const restored = await restoreWithBackoff(disk.backend, {
      clock: time.clock,
      sleep: async (ms) => {
        await time.sleep(ms);
        signedIn = true;
      },
      pauseMs: 0,
      shouldStop: () => signedIn,
    });
    expect(restored.status).toBe("unreadable");
    expect(time.slept).toEqual([300]);
  });
});

describe("refresh outcome decides whether the saved token is deleted", () => {
  // Mirrors AuthContext.refreshInBackground: only "rejected" removes the saved login.
  async function applyRefresh(
    backend: TokenBackend,
    token: string,
    call: (t: string) => Promise<{ token?: unknown }>,
  ) {
    const outcome = await refreshSessionToken(token, call);
    if (outcome.status === "rejected") await backend.remove();
    else if (outcome.status === "refreshed") await backend.set(outcome.token);
    return outcome;
  }

  it("a network error keeps the saved token", async () => {
    const disk = memoryBackend();
    await disk.backend.set(GOOD);
    await applyRefresh(disk.backend, GOOD, async () => {
      throw new TypeError("Network request failed");
    });
    expect(disk.peek()).toBe(GOOD);
    expect(disk.calls.remove).toBe(0);
  });

  it("a timeout (aborted fetch, no status) keeps the saved token", async () => {
    const disk = memoryBackend();
    await disk.backend.set(GOOD);
    const outcome = await applyRefresh(disk.backend, GOOD, async () => {
      throw Object.assign(new Error("Aborted"), { name: "AbortError" });
    });
    expect(outcome).toEqual({ status: "unavailable" });
    expect(disk.peek()).toBe(GOOD);
  });

  it("a 5xx or 403 keeps the saved token", async () => {
    for (const status of [500, 502, 503, 403, 429]) {
      const disk = memoryBackend();
      await disk.backend.set(GOOD);
      await applyRefresh(disk.backend, GOOD, async () => {
        throw Object.assign(new Error(`HTTP ${status}`), { status });
      });
      expect(disk.peek()).toBe(GOOD);
    }
  });

  it("a real 401 clears the saved token", async () => {
    const disk = memoryBackend();
    await disk.backend.set(GOOD);
    const outcome = await applyRefresh(disk.backend, GOOD, async () => {
      throw Object.assign(new Error("HTTP 401"), { status: 401 });
    });
    expect(outcome).toEqual({ status: "rejected" });
    expect(disk.peek()).toBeNull();
  });
});

describe("saving the login retries before falling back to memory-only", () => {
  it("a save that fails transiently (3 times) is retried with backoff and ends up secure", async () => {
    const disk = memoryBackend({ failWrites: 3 });
    const errors: string[] = [];
    const res = await establishSession(
      GOOD,
      { setItem: disk.backend.set, deleteItem: disk.backend.remove },
      { delaysMs: [0, 0, 0], onError: (e) => errors.push((e as Error).message) },
    );
    expect(res.persistence).toBe("secure");
    expect(disk.peek()).toBe(GOOD);
    expect(errors).toEqual(["keychain write failed", "keychain write failed", "keychain write failed"]);
  });

  it("memory-only only after every retry failed; a later foreground save succeeds", async () => {
    const disk = memoryBackend({ failWrites: 4 });
    const res = await establishSession(
      GOOD,
      { setItem: disk.backend.set, deleteItem: disk.backend.remove },
      { delaysMs: [0, 0, 0] },
    );
    expect(res.persistence).toBe("memory-only");
    expect(disk.calls.set).toBe(4);
    // App returns to the foreground: try to persist again (what AuthContext does to clear the banner).
    expect(await persistToken(GOOD, disk.backend.set, { delaysMs: [0, 0, 0] })).toBe(true);
    expect(disk.peek()).toBe(GOOD);
  });
});
