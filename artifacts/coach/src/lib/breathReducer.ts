export type Breath = {
  title?: string;
  purpose?: string;
  inhale?: number;
  holdIn?: number;
  exhale?: number;
  holdOut?: number;
  rounds?: number;
  note?: string;
};

export type PhaseKey = "inhale" | "holdIn" | "exhale" | "holdOut";
export type Phase = { key: PhaseKey; label: string; seconds: number; scale: number };

const PHASE_LABELS: Record<PhaseKey, string> = {
  inhale: "Inhale",
  holdIn: "Hold",
  exhale: "Exhale",
  holdOut: "Hold",
};

const PHASE_SCALE: Record<PhaseKey, number> = {
  inhale: 1,
  holdIn: 1,
  exhale: 0.62,
  holdOut: 0.62,
};

export function clampSec(v: number | undefined, fallback: number): number {
  if (typeof v !== "number" || Number.isNaN(v)) return fallback;
  return Math.max(0, Math.min(30, Math.round(v)));
}

export function buildPhases(b: Breath): Phase[] {
  const order: PhaseKey[] = ["inhale", "holdIn", "exhale", "holdOut"];
  const secs: Record<PhaseKey, number> = {
    inhale: clampSec(b.inhale, 4),
    holdIn: clampSec(b.holdIn, 0),
    exhale: clampSec(b.exhale, 4),
    holdOut: clampSec(b.holdOut, 0),
  };
  return order
    .filter((k) => secs[k] > 0)
    .map((k) => ({ key: k, label: PHASE_LABELS[k], seconds: secs[k], scale: PHASE_SCALE[k] }));
}

export type BreathState = {
  running: boolean;
  phaseIdx: number;
  remaining: number;
  round: number;
  done: boolean;
};

export type BreathAction = { type: "BEGIN" } | { type: "PAUSE" } | { type: "RESET" } | { type: "TICK" };

export function makeBreathReducer(phases: Phase[], totalRounds: number) {
  const initial = (): BreathState => ({
    running: false,
    phaseIdx: 0,
    remaining: phases[0]?.seconds ?? 0,
    round: 1,
    done: false,
  });
  return (state: BreathState, action: BreathAction): BreathState => {
    switch (action.type) {
      case "BEGIN":
        if (state.done || phases.length === 0) return state;
        return { ...state, running: true };
      case "PAUSE":
        return { ...state, running: false };
      case "RESET":
        return initial();
      case "TICK": {
        if (!state.running || state.done) return state;
        if (state.remaining > 1) return { ...state, remaining: state.remaining - 1 };
        const nextPi = state.phaseIdx + 1;
        if (nextPi < phases.length) {
          return { ...state, phaseIdx: nextPi, remaining: phases[nextPi]!.seconds };
        }
        if (state.round >= totalRounds) {
          return { ...state, running: false, done: true };
        }
        return {
          ...state,
          round: state.round + 1,
          phaseIdx: 0,
          remaining: phases[0]?.seconds ?? 0,
        };
      }
      default:
        return state;
    }
  };
}

export function makeInitialBreathState(phases: Phase[]): BreathState {
  return {
    running: false,
    phaseIdx: 0,
    remaining: phases[0]?.seconds ?? 0,
    round: 1,
    done: false,
  };
}
