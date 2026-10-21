import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ChatTurn,
  ChatTurnRegistry,
  SSE_PING,
  Throttle,
  onClientDisconnect,
  openSse,
  retryOnce,
  sanitizeClientMessageId,
  startSseHeartbeat,
} from "../lib/coachChatStream";
import {
  FirstTokenTimeoutError,
  describeProviderError,
  firstTokenGuard,
  isRetryableProviderError,
  runWithRetry,
} from "../lib/aiRetry";

/** Just enough of an Express response for the SSE helpers. */
class FakeRes extends EventEmitter {
  writes: string[] = [];
  headers: Record<string, string> = {};
  writableEnded = false;
  writableFinished = false;
  destroyed = false;
  flushed = false;
  setHeader(k: string, v: string) {
    this.headers[k] = v;
    return this;
  }
  flushHeaders() {
    this.flushed = true;
  }
  write(chunk: string) {
    this.writes.push(chunk);
    return true;
  }
  end() {
    this.writableEnded = true;
    this.writableFinished = true;
    this.emit("close");
    return this;
  }
  /** The client hangs up mid-stream. */
  hangUp() {
    this.destroyed = true;
    this.emit("close");
  }
}
const asRes = (r: FakeRes) => r as unknown as import("express").Response;

describe("SSE heartbeat", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("pings every 10s from header flush until the stream ends", () => {
    const res = new FakeRes();
    const ch = openSse(asRes(res));
    expect(res.flushed).toBe(true);
    expect(res.headers["Content-Type"]).toBe("text/event-stream");
    vi.advanceTimersByTime(9_999);
    expect(res.writes).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(res.writes).toEqual([SSE_PING]);
    vi.advanceTimersByTime(20_000);
    expect(res.writes.filter((w) => w === SSE_PING)).toHaveLength(3);
    ch.send({ done: true });
    ch.end();
    const n = res.writes.length;
    vi.advanceTimersByTime(60_000);
    expect(res.writes).toHaveLength(n);
    expect(res.writes.at(-1)).toBe('data: {"done":true}\n\n');
  });

  it("the ping is an SSE comment, so clients that parse data: lines ignore it", () => {
    expect(SSE_PING.startsWith(":")).toBe(true);
    expect(SSE_PING.endsWith("\n\n")).toBe(true);
  });

  it("stops when the client goes away, and drops writes after that", () => {
    const res = new FakeRes();
    const ch = openSse(asRes(res));
    vi.advanceTimersByTime(10_000);
    res.hangUp();
    ch.send({ content: "late" });
    vi.advanceTimersByTime(60_000);
    expect(res.writes).toEqual([SSE_PING]);
    expect(ch.closed).toBe(true);
  });

  it("a bare heartbeat stops itself once the response has ended", () => {
    const res = new FakeRes();
    startSseHeartbeat(asRes(res), 1_000);
    vi.advanceTimersByTime(1_000);
    res.writableEnded = true;
    vi.advanceTimersByTime(5_000);
    expect(res.writes).toEqual([SSE_PING]);
  });
});

describe("client disconnect aborts the provider call", () => {
  it("fires on a close before the response finished, not after a normal end", () => {
    const hungUp = new FakeRes();
    const a = vi.fn();
    onClientDisconnect(asRes(hungUp), a);
    hungUp.hangUp();
    expect(a).toHaveBeenCalledTimes(1);

    const finished = new FakeRes();
    const b = vi.fn();
    onClientDisconnect(asRes(finished), b);
    finished.end();
    expect(b).not.toHaveBeenCalled();
  });

  it("the turn's signal aborts when its only listener leaves mid-generation", () => {
    const turn = new ChatTurn();
    const res = new FakeRes();
    const unsubscribe = turn.subscribe(() => {});
    onClientDisconnect(asRes(res), unsubscribe);
    turn.content("Partial ");
    expect(turn.signal.aborted).toBe(false);
    res.hangUp();
    expect(turn.signal.aborted).toBe(true);
    // What arrived is still there for the route to persist.
    expect(turn.assembled).toBe("Partial ");
  });

  it("an abort mid-stream reaches a real provider-style async iterator", async () => {
    const turn = new ChatTurn();
    const unsubscribe = turn.subscribe(() => {});
    const guard = firstTokenGuard(turn.signal, 10_000);
    const got: string[] = [];
    async function* provider(signal: AbortSignal) {
      for (const t of ["a", "b", "c", "d"]) {
        if (signal.aborted) throw Object.assign(new Error("Request was aborted."), { name: "APIUserAbortError" });
        yield t;
        await new Promise((r) => setTimeout(r, 1));
      }
    }
    await expect(
      (async () => {
        for await (const t of provider(guard.signal)) {
          guard.gotToken();
          got.push(t);
          if (got.length === 2) unsubscribe();
        }
      })(),
    ).rejects.toMatchObject({ name: "APIUserAbortError" });
    guard.dispose();
    expect(got).toEqual(["a", "b"]);
    expect(describeProviderError(Object.assign(new Error("Request was aborted."), { name: "APIUserAbortError" })).kind).toBe("aborted");
  });

  it("does not abort while another request for the same send is still listening", () => {
    const turn = new ChatTurn();
    const first = turn.subscribe(() => {});
    const second = turn.subscribe(() => {});
    first();
    expect(turn.signal.aborted).toBe(false);
    second();
    expect(turn.signal.aborted).toBe(true);
  });

  it("leaving after the turn finished never aborts", () => {
    const turn = new ChatTurn();
    const off = turn.subscribe(() => {});
    turn.finish({ done: true });
    off();
    expect(turn.signal.aborted).toBe(false);
  });
});

describe("idempotent sends", () => {
  it("a retry attaches to the in-flight turn: it gets what streamed so far, then the rest, once", () => {
    const registry = new ChatTurnRegistry();
    const key = ChatTurnRegistry.key("user-1", "cm_1");
    expect(registry.get(key)).toBeUndefined();
    const turn = registry.start(key);
    const original: unknown[] = [];
    turn.subscribe((e) => original.push(e));
    turn.content("Hello ");

    // The retry finds the running turn instead of starting a second generation.
    const running = registry.get(key);
    expect(running).toBe(turn);
    const retry: unknown[] = [];
    running!.subscribe((e) => retry.push(e), { replay: true });
    turn.content("there.");
    turn.finish({ done: true });

    expect(original).toEqual([{ content: "Hello " }, { content: "there." }, { done: true }]);
    expect(retry).toEqual([{ content: "Hello " }, { content: "there." }, { done: true }]);
  });

  it("a retry that lands after the reply finished (but before release) gets the full reply and done", () => {
    const turn = new ChatTurn();
    turn.content("All of it.");
    turn.finish({ done: true });
    const got: unknown[] = [];
    turn.subscribe((e) => got.push(e), { replay: true });
    expect(got).toEqual([{ content: "All of it." }, { done: true }]);
  });

  it("ids are per user, and release only removes the turn it registered", () => {
    const registry = new ChatTurnRegistry();
    const a = ChatTurnRegistry.key("user-a", "same");
    const b = ChatTurnRegistry.key("user-b", "same");
    expect(a).not.toBe(b);
    const t1 = registry.start(a);
    const t2 = registry.start(a); // a later generation for the same key
    registry.release(a, t1);
    expect(registry.get(a)).toBe(t2);
    registry.release(a, t2);
    expect(registry.size).toBe(0);
  });

  it("only short, safe client message ids are accepted", () => {
    expect(sanitizeClientMessageId("m_lq3k2_8f9a0b")).toBe("m_lq3k2_8f9a0b");
    expect(sanitizeClientMessageId("  abc-123  ")).toBe("abc-123");
    expect(sanitizeClientMessageId("x".repeat(64))).toHaveLength(64);
    expect(sanitizeClientMessageId("x".repeat(65))).toBeNull();
    expect(sanitizeClientMessageId("")).toBeNull();
    expect(sanitizeClientMessageId("a b")).toBeNull();
    expect(sanitizeClientMessageId("<script>")).toBeNull();
    expect(sanitizeClientMessageId(42)).toBeNull();
    expect(sanitizeClientMessageId(undefined)).toBeNull();
  });
});

describe("one shared deadline for retries and the fallback", () => {
  const err = (status: number) => Object.assign(new Error(`http ${status}`), { status });

  it("a second run sharing the deadline gets only what is left, not a fresh budget", async () => {
    let t = 0;
    const clock = { now: () => t, sleep: async (ms: number) => void (t += ms) };
    const deadlineAt = 45_000;
    let primaryCalls = 0;
    await expect(
      runWithRetry(
        async () => {
          primaryCalls++;
          t += 20_000; // a slow failing attempt
          throw err(529);
        },
        { maxAttempts: 3, deadlineAt, minAttemptMs: 5_000, ...clock },
      ),
    ).rejects.toBeDefined();
    expect(primaryCalls).toBe(2);
    // 40s+ gone: the fallback can't start another attempt within the same deadline.
    let fallbackCalls = 0;
    await expect(
      runWithRetry(
        async () => {
          fallbackCalls++;
          t += 20_000;
          throw err(529);
        },
        { maxAttempts: 2, deadlineAt, minAttemptMs: 5_000, ...clock },
      ),
    ).rejects.toBeDefined();
    expect(fallbackCalls).toBe(1);
    expect(t).toBeGreaterThan(deadlineAt);
  });

  it("stops at once when the client has gone", async () => {
    const ctl = new AbortController();
    let n = 0;
    await expect(
      runWithRetry(
        async () => {
          n++;
          ctl.abort();
          throw err(529);
        },
        { maxAttempts: 3, deadlineMs: 40_000, signal: ctl.signal, sleep: async () => {} },
      ),
    ).rejects.toBeDefined();
    expect(n).toBe(1);
  });

  it("a per-attempt first-token timeout aborts a hung call and reads as a timeout", async () => {
    vi.useFakeTimers();
    try {
      const guard = firstTokenGuard(undefined, 30_000);
      vi.advanceTimersByTime(29_999);
      expect(guard.signal.aborted).toBe(false);
      vi.advanceTimersByTime(1);
      expect(guard.signal.aborted).toBe(true);
      expect(guard.timedOut).toBe(true);
      const e = new FirstTokenTimeoutError(30_000);
      expect(describeProviderError(e).kind).toBe("timeout");
      // Not retried on the same provider (the route falls back instead).
      expect(isRetryableProviderError(e)).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("once a token arrives the first-token timeout no longer applies", () => {
    vi.useFakeTimers();
    try {
      const guard = firstTokenGuard(undefined, 1_000);
      guard.gotToken();
      vi.advanceTimersByTime(60_000);
      expect(guard.signal.aborted).toBe(false);
      guard.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it("the attempt signal follows the turn's signal", () => {
    const parent = new AbortController();
    const guard = firstTokenGuard(parent.signal, 30_000);
    parent.abort();
    expect(guard.signal.aborted).toBe(true);
    expect(guard.timedOut).toBe(false);
    guard.dispose();
  });
});

describe("small helpers", () => {
  it("throttles warm-ups to once per window per user", () => {
    let t = 0;
    const th = new Throttle(4 * 60_000, () => t);
    expect(th.take("u1")).toBe(true);
    expect(th.take("u1")).toBe(false);
    expect(th.take("u2")).toBe(true);
    t += 4 * 60_000 - 1;
    expect(th.take("u1")).toBe(false);
    t += 1;
    expect(th.take("u1")).toBe(true);
  });

  it("retryOnce retries a failed insert exactly once", async () => {
    let n = 0;
    await expect(retryOnce(async () => (++n < 2 ? Promise.reject(new Error("db")) : "ok"), 0)).resolves.toBe("ok");
    expect(n).toBe(2);
    n = 0;
    await expect(retryOnce(async () => { n++; throw new Error("db"); }, 0)).rejects.toThrow("db");
    expect(n).toBe(2);
  });
});
