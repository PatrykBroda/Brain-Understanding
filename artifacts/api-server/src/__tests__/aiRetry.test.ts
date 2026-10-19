import { describe, expect, it } from "vitest";
import { backoffFor, describeProviderError, isRetryableProviderError, runWithRetry } from "../lib/aiRetry";
import { budgetNodes } from "../lib/vaultRetrieval";
import { HISTORY_MAX_CHARS, trimHistory } from "../lib/promptBudget";

const err = (status: number, headers?: Record<string, string>) => Object.assign(new Error(`http ${status}`), { status, headers });

describe("which provider failures are worth another try", () => {
  it("retries busy / overloaded / 5xx / dropped connections, never 4xx or consent", () => {
    expect(isRetryableProviderError(err(429))).toBe(true);
    expect(isRetryableProviderError(err(529))).toBe(true);
    expect(isRetryableProviderError(err(503))).toBe(true);
    expect(isRetryableProviderError(new Error("socket hang up"))).toBe(true);
    expect(isRetryableProviderError(err(400))).toBe(false);
    expect(isRetryableProviderError(err(401))).toBe(false);
    expect(isRetryableProviderError(Object.assign(new Error("x"), { code: "AI_CONSENT_REQUIRED" }))).toBe(false);
  });
  it("reads Retry-After and the provider request id for the logs", () => {
    const info = describeProviderError(err(429, { "retry-after": "3", "request-id": "req_9" }));
    expect(info).toMatchObject({ status: 429, kind: "rate_limit", retryAfterMs: 3000, requestId: "req_9" });
  });
  it("backs off, honours Retry-After, and caps the wait", () => {
    expect(backoffFor(0, null)).toBeGreaterThanOrEqual(800);
    expect(backoffFor(0, 3000)).toBeGreaterThanOrEqual(3000);
    expect(backoffFor(0, 60_000)).toBeLessThan(8300);
  });
});

describe("runWithRetry", () => {
  const fast = { sleep: async () => {}, maxAttempts: 3, deadlineMs: 40_000 };
  it("retries a transient failure and returns the success", async () => {
    let n = 0;
    const out = await runWithRetry(async () => {
      if (++n < 3) throw err(529);
      return "ok";
    }, fast);
    expect(out).toBe("ok");
    expect(n).toBe(3);
  });
  it("checks consent before EVERY attempt, including retries", async () => {
    const seen: number[] = [];
    let n = 0;
    await runWithRetry(
      async () => {
        if (++n < 2) throw err(429);
      },
      { ...fast, beforeAttempt: async (a) => void seen.push(a) },
    );
    expect(seen).toEqual([0, 1]);
  });
  it("withdrawn consent stops the retry loop", async () => {
    let calls = 0;
    await expect(
      runWithRetry(
        async () => {
          calls++;
          throw err(429);
        },
        {
          ...fast,
          beforeAttempt: async (a) => {
            if (a === 1) throw Object.assign(new Error("consent"), { code: "AI_CONSENT_REQUIRED" });
          },
        },
      ),
    ).rejects.toMatchObject({ code: "AI_CONSENT_REQUIRED" });
    expect(calls).toBe(1);
  });
  it("does not retry once the athlete has been shown text, or a non-retryable error", async () => {
    let n = 0;
    await expect(runWithRetry(async () => { n++; throw err(529); }, { ...fast, canRetry: () => false })).rejects.toBeDefined();
    expect(n).toBe(1);
    n = 0;
    await expect(runWithRetry(async () => { n++; throw err(400); }, fast)).rejects.toBeDefined();
    expect(n).toBe(1);
  });
  it("stops retrying at the deadline", async () => {
    let t = 0;
    let n = 0;
    await expect(
      runWithRetry(async () => { n++; throw err(429); }, {
        maxAttempts: 5,
        deadlineMs: 1000,
        sleep: async (ms) => void (t += ms),
        now: () => t,
      }),
    ).rejects.toBeDefined();
    expect(n).toBeLessThan(5);
  });
});

describe("input budget", () => {
  const msg = (role: string, n: number, c = "x") => ({ role, content: `${n}:${c.repeat(1000)}` });
  it("keeps the newest messages within the cap and starts on a user turn", () => {
    const h = Array.from({ length: 200 }, (_, i) => msg(i % 2 === 0 ? "user" : "assistant", i));
    const out = trimHistory(h);
    expect(out.reduce((n, m) => n + m.content.length, 0)).toBeLessThanOrEqual(HISTORY_MAX_CHARS + 1100);
    expect(out[0]!.role).toBe("user");
    expect(out.at(-1)).toBe(h.at(-1));
  });
  it("always keeps the latest message even if it alone is over the cap", () => {
    const h = [msg("user", 0), msg("assistant", 1), { role: "user", content: "y".repeat(100_000) }];
    const out = trimHistory(h);
    expect(out).toHaveLength(1);
    expect(out[0]!.role).toBe("user");
  });
  it("leaves a short conversation alone", () => {
    const h = [msg("user", 0), msg("assistant", 1), msg("user", 2)];
    expect(trimHistory(h)).toEqual(h);
  });
  it("caps each deep-vault note and the whole block", () => {
    const nodes = Array.from({ length: 6 }, (_, i) => ({ folder: "MODELS", title: `N${i}`, body: "b".repeat(30_000), score: 10 - i, reason: "body-match" as const }));
    const out = budgetNodes(nodes);
    expect(out.every((n) => n.body.length <= 6_100)).toBe(true);
    expect(out.reduce((s, n) => s + n.body.length, 0)).toBeLessThanOrEqual(20_000 + 200);
    expect(out[0]!.body).toContain("cut for length");
    expect(out.length).toBeLessThan(6);
  });
});
