import { afterEach, describe, expect, it, vi } from "vitest";
import { createOnboardingTracker } from "../src/lib/onboarding-tracking";

afterEach(() => vi.useRealTimers());

describe("coach onboarding tracker is fire-and-forget", () => {
  it("sends each (step, event) once", () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const t = createOnboardingTracker(send);
    t.track("welcome", "view");
    t.track("welcome", "view");
    t.track("q_tired", "view");
    t.track("q_tired", "complete");
    expect(send.mock.calls.map((c) => `${c[0]}:${c[1]}`)).toEqual(["welcome:view", "q_tired:view", "q_tired:complete"]);
  });

  it("swallows a rejected or throwing sender", async () => {
    const t = createOnboardingTracker(() => Promise.reject(new Error("Failed to fetch")));
    expect(() => t.track("details", "error")).not.toThrow();
    const t2 = createOnboardingTracker(() => {
      throw new Error("boom");
    });
    expect(() => t2.track("details", "view")).not.toThrow();
    await new Promise((r) => setTimeout(r, 5));
  });

  it("abandons a request that never answers", () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    createOnboardingTracker((_s, _e, sig) => {
      signal = sig;
      return new Promise(() => {});
    }).track("details", "view");
    vi.advanceTimersByTime(5_001);
    expect(signal?.aborted).toBe(true);
  });
});
