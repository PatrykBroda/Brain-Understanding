import { describe, expect, it, vi } from "vitest";
import { CANCELLED, STOPPED_LABEL, createCancelGate, isAbortError } from "../lib/chatCancel";

describe("cancel gate", () => {
  it("aborts the current request's signal and is idempotent", () => {
    const gate = createCancelGate();
    const ctrl = gate.newRequest();
    const onAbort = vi.fn();
    ctrl.signal.addEventListener("abort", onAbort);
    gate.cancel();
    gate.cancel();
    expect(gate.cancelled).toBe(true);
    expect(ctrl.signal.aborted).toBe(true);
    expect(onAbort).toHaveBeenCalledTimes(1);
  });

  it("race settles at once even if the request never rejects on abort", async () => {
    const gate = createCancelGate();
    gate.newRequest();
    const hung = new Promise<string>(() => {});
    const raced = gate.race(hung);
    gate.cancel();
    await expect(raced).resolves.toBe(CANCELLED);
  });

  it("race passes the result through when not cancelled, and swallows a late abort rejection", async () => {
    const gate = createCancelGate();
    await expect(gate.race(Promise.resolve("ok"))).resolves.toBe("ok");
    const late = Promise.reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
    const raced = gate.race(late);
    await expect(raced).rejects.toThrow(); // rejection wins if it comes first
    const gate2 = createCancelGate();
    let rejectLate!: (e: unknown) => void;
    const p = new Promise((_, rej) => (rejectLate = rej));
    const r2 = gate2.race(p);
    gate2.cancel();
    await expect(r2).resolves.toBe(CANCELLED);
    rejectLate(new Error("late")); // must not surface as an unhandled rejection
    await new Promise((r) => setTimeout(r, 0));
  });

  it("a retry attempt started after cancel is born aborted", () => {
    const gate = createCancelGate();
    gate.cancel();
    expect(gate.newRequest().signal.aborted).toBe(true);
  });

  it("gates are independent: cancelling an old send does not affect a new one", () => {
    const old = createCancelGate();
    const fresh = createCancelGate();
    const ctrl = fresh.newRequest();
    old.cancel();
    expect(fresh.cancelled).toBe(false);
    expect(ctrl.signal.aborted).toBe(false);
  });

  it("recognises abort errors and has a stopped label", () => {
    expect(isAbortError(Object.assign(new Error("x"), { name: "AbortError" }))).toBe(true);
    expect(isAbortError(new Error("x"))).toBe(false);
    expect(isAbortError(null)).toBe(false);
    expect(STOPPED_LABEL).toBe("Stopped.");
  });
});
