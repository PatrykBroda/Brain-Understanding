import { afterEach, describe, expect, it, vi } from "vitest";
import { createOnboardingTracker } from "../lib/onboardingTracking";

afterEach(() => vi.useRealTimers());

describe("onboarding tracker is fire-and-forget", () => {
  it("sends each (step, event) once, however often it is asked", async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const t = createOnboardingTracker(send);
    t.track("name", "view");
    t.track("name", "view");
    t.track("name", "complete");
    t.track("dob", "view");
    expect(send.mock.calls.map((c) => `${c[0]}:${c[1]}`)).toEqual(["name:view", "name:complete", "dob:view"]);
  });

  it("ignores a missing step", () => {
    const send = vi.fn();
    createOnboardingTracker(send).track(undefined, "view");
    expect(send).not.toHaveBeenCalled();
  });

  it("swallows a rejected request (offline, 4xx, 5xx)", async () => {
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    const t = createOnboardingTracker(() => Promise.reject(new Error("Network request failed")));
    expect(() => t.track("sport", "view")).not.toThrow();
    await new Promise((r) => setTimeout(r, 10));
    process.off("unhandledRejection", unhandled);
    expect(unhandled).not.toHaveBeenCalled();
  });

  it("swallows a synchronous throw from the sender", () => {
    const t = createOnboardingTracker(() => {
      throw new Error("boom");
    });
    expect(() => t.track("goals", "error")).not.toThrow();
  });

  it("abandons a request that never answers, so nothing is held up", () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    const t = createOnboardingTracker((_s, _e, sig) => {
      signal = sig;
      return new Promise(() => {});
    });
    t.track("frequency", "view");
    expect(signal?.aborted).toBe(false);
    vi.advanceTimersByTime(5_001);
    expect(signal?.aborted).toBe(true);
  });
});
