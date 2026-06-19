import { describe, it, expect } from "vitest";
import {
  buildPhases,
  clampSec,
  makeBreathReducer,
  makeInitialBreathState,
  type BreathState,
  type BreathAction,
} from "../lib/breathReducer";

function makeReducer(inhale = 4, exhale = 4, holdIn = 0, holdOut = 0, rounds = 3) {
  const phases = buildPhases({ inhale, holdIn, exhale, holdOut });
  const reducer = makeBreathReducer(phases, rounds);
  const initial = makeInitialBreathState(phases);
  return { phases, reducer, initial };
}

function tick(
  reducer: (s: BreathState, a: BreathAction) => BreathState,
  state: BreathState,
  times = 1,
): BreathState {
  let s = state;
  for (let i = 0; i < times; i++) s = reducer(s, { type: "TICK" });
  return s;
}

describe("clampSec", () => {
  it("clamps to 0–30", () => {
    expect(clampSec(-5, 4)).toBe(0);
    expect(clampSec(999, 4)).toBe(30);
    expect(clampSec(10, 4)).toBe(10);
  });

  it("falls back when undefined or NaN", () => {
    expect(clampSec(undefined, 6)).toBe(6);
    expect(clampSec(NaN, 6)).toBe(6);
  });

  it("rounds fractional seconds", () => {
    expect(clampSec(4.7, 4)).toBe(5);
    expect(clampSec(4.2, 4)).toBe(4);
  });
});

describe("buildPhases", () => {
  it("includes phases with non-zero seconds only", () => {
    const phases = buildPhases({ inhale: 4, holdIn: 0, exhale: 4, holdOut: 0 });
    expect(phases.map((p) => p.key)).toEqual(["inhale", "exhale"]);
  });

  it("defaults inhale=4, exhale=4, holds=0 when fields missing", () => {
    const phases = buildPhases({});
    expect(phases.map((p) => p.key)).toEqual(["inhale", "exhale"]);
    expect(phases[0]?.seconds).toBe(4);
    expect(phases[1]?.seconds).toBe(4);
  });

  it("includes all four phases when all non-zero", () => {
    const phases = buildPhases({ inhale: 4, holdIn: 4, exhale: 4, holdOut: 4 });
    expect(phases.map((p) => p.key)).toEqual(["inhale", "holdIn", "exhale", "holdOut"]);
  });
});

describe("makeBreathReducer — BEGIN / PAUSE", () => {
  it("BEGIN sets running=true", () => {
    const { reducer, initial } = makeReducer();
    const s = reducer(initial, { type: "BEGIN" });
    expect(s.running).toBe(true);
  });

  it("BEGIN is a no-op when already done", () => {
    const { reducer, initial } = makeReducer();
    const done: BreathState = { ...initial, done: true };
    expect(reducer(done, { type: "BEGIN" })).toEqual(done);
  });

  it("BEGIN is a no-op when phases list is empty", () => {
    const emptyPhases = buildPhases({ inhale: 0, exhale: 0 });
    const reducer = makeBreathReducer(emptyPhases, 3);
    const initial = makeInitialBreathState(emptyPhases);
    expect(reducer(initial, { type: "BEGIN" })).toEqual(initial);
  });

  it("PAUSE sets running=false", () => {
    const { reducer, initial } = makeReducer();
    let s = reducer(initial, { type: "BEGIN" });
    s = reducer(s, { type: "PAUSE" });
    expect(s.running).toBe(false);
  });
});

describe("makeBreathReducer — TICK countdown", () => {
  it("decrements remaining on each TICK", () => {
    const { reducer, initial } = makeReducer(4, 4, 0, 0, 3);
    let s = reducer(initial, { type: "BEGIN" });
    expect(s.remaining).toBe(4);
    s = tick(reducer, s);
    expect(s.remaining).toBe(3);
    s = tick(reducer, s);
    expect(s.remaining).toBe(2);
  });

  it("TICK is a no-op when not running", () => {
    const { reducer, initial } = makeReducer();
    const s = tick(reducer, initial);
    expect(s).toEqual(initial);
  });

  it("TICK is a no-op when done", () => {
    const { reducer, initial } = makeReducer();
    const done: BreathState = { ...initial, running: true, done: true };
    expect(reducer(done, { type: "TICK" })).toEqual(done);
  });
});

describe("makeBreathReducer — phase advance", () => {
  it("advances to next phase when remaining reaches 1", () => {
    const { reducer, initial, phases } = makeReducer(2, 2, 0, 0, 3);
    let s = reducer(initial, { type: "BEGIN" });
    s = tick(reducer, s, 2);
    expect(s.phaseIdx).toBe(1);
    expect(s.remaining).toBe(phases[1]!.seconds);
  });

  it("wraps back to phase 0 on round rollover", () => {
    const { reducer, initial, phases } = makeReducer(2, 2, 0, 0, 3);
    let s = reducer(initial, { type: "BEGIN" });
    s = tick(reducer, s, 4);
    expect(s.phaseIdx).toBe(0);
    expect(s.round).toBe(2);
    expect(s.remaining).toBe(phases[0]!.seconds);
  });
});

describe("makeBreathReducer — round rollover", () => {
  it("increments round after a full cycle", () => {
    const { reducer, initial } = makeReducer(2, 2, 0, 0, 3);
    let s = reducer(initial, { type: "BEGIN" });
    s = tick(reducer, s, 4);
    expect(s.round).toBe(2);
    expect(s.running).toBe(true);
  });

  it("counts through all rounds correctly", () => {
    const { reducer, initial } = makeReducer(1, 1, 0, 0, 2);
    let s = reducer(initial, { type: "BEGIN" });
    s = tick(reducer, s, 4);
    expect(s.round).toBe(2);
    s = tick(reducer, s, 4);
    expect(s.done).toBe(true);
  });
});

describe("makeBreathReducer — completion (done)", () => {
  it("sets done=true and running=false after the last phase of the last round", () => {
    const { reducer, initial } = makeReducer(1, 1, 0, 0, 1);
    let s = reducer(initial, { type: "BEGIN" });
    s = tick(reducer, s, 2);
    expect(s.done).toBe(true);
    expect(s.running).toBe(false);
  });

  it("stays done after further TICKs", () => {
    const { reducer, initial } = makeReducer(1, 1, 0, 0, 1);
    let s = reducer(initial, { type: "BEGIN" });
    s = tick(reducer, s, 10);
    expect(s.done).toBe(true);
    expect(s.running).toBe(false);
  });
});

describe("makeBreathReducer — RESET", () => {
  it("returns to the initial state", () => {
    const { reducer, initial } = makeReducer(4, 4, 0, 0, 3);
    let s = reducer(initial, { type: "BEGIN" });
    s = tick(reducer, s, 2);
    s = reducer(s, { type: "RESET" });
    expect(s.running).toBe(false);
    expect(s.phaseIdx).toBe(0);
    expect(s.round).toBe(1);
    expect(s.done).toBe(false);
    expect(s.remaining).toBe(initial.remaining);
  });

  it("can BEGIN again after RESET from done state", () => {
    const { reducer, initial } = makeReducer(1, 1, 0, 0, 1);
    let s = reducer(initial, { type: "BEGIN" });
    s = tick(reducer, s, 2);
    expect(s.done).toBe(true);
    s = reducer(s, { type: "RESET" });
    s = reducer(s, { type: "BEGIN" });
    expect(s.running).toBe(true);
    expect(s.done).toBe(false);
  });
});

describe("makeBreathReducer — pause / resume", () => {
  it("pausing mid-phase preserves remaining", () => {
    const { reducer, initial } = makeReducer(4, 4, 0, 0, 3);
    let s = reducer(initial, { type: "BEGIN" });
    s = tick(reducer, s);
    const remaining = s.remaining;
    s = reducer(s, { type: "PAUSE" });
    s = tick(reducer, s);
    expect(s.remaining).toBe(remaining);
    s = reducer(s, { type: "BEGIN" });
    s = tick(reducer, s);
    expect(s.remaining).toBe(remaining - 1);
  });
});

describe("makeBreathReducer — four-phase cycle", () => {
  it("steps through inhale→holdIn→exhale→holdOut in sequence", () => {
    const phases = buildPhases({ inhale: 1, holdIn: 1, exhale: 1, holdOut: 1 });
    const reducer = makeBreathReducer(phases, 1);
    let s = makeInitialBreathState(phases);
    s = reducer(s, { type: "BEGIN" });
    expect(phases[s.phaseIdx]?.key).toBe("inhale");
    s = tick(reducer, s);
    expect(phases[s.phaseIdx]?.key).toBe("holdIn");
    s = tick(reducer, s);
    expect(phases[s.phaseIdx]?.key).toBe("exhale");
    s = tick(reducer, s);
    expect(phases[s.phaseIdx]?.key).toBe("holdOut");
    s = tick(reducer, s);
    expect(s.done).toBe(true);
  });
});
