// The per-state coaching tip on the State screen. Deterministic: keyed to the
// same honestly-derived state label, never generated, never a metric. `why` only
// ever refers to what FRAME actually reads (the athlete's notes), never live
// biometrics. Keep in sync with artifacts/coach/src/lib/state-tips.ts.

export type StateTipKey =
  | "Dormant"
  | "Stable"
  | "Loaded"
  | "Recovering"
  | "Tight"
  | "Volatile"
  | "Composed"
  | "Overextended";

export interface StateTip {
  tip: string;
  why: string;
}

export const STATE_TIPS: Record<StateTipKey, StateTip> = {
  Dormant: {
    tip: "Step in. The frame reads what you feed it.",
    why: "FRAME doesn't have enough on you to read a state yet. A few honest notes on training and how you feel give it something to work with.",
  },
  Stable: {
    tip: "Narrow the decision tree.",
    why: "What you've told FRAME shows a steady pattern with no strong flag. That's the moment to simplify: pick two things to own this session and drop the rest.",
  },
  Loaded: {
    tip: "Trade speed for position.",
    why: "What you've told FRAME points to heavy load or over-intensity. When load is high, speed is the first thing to slip, so lean on position and let clean work carry the session.",
  },
  Recovering: {
    tip: "Protect the rebuild.",
    why: "What you've told FRAME mentions recovery, fatigue or an injury. Recovery is where the gains lock in, so keep this session light on volume and clean on technique.",
  },
  Tight: {
    tip: "Commit earlier than comfort wants.",
    why: "What you've told FRAME points to tension or hesitation. Tight tends to show up as second-guessing, so decide sooner and move on the first clean read.",
  },
  Volatile: {
    tip: "Anchor the breath before the exchange.",
    why: "What you've told FRAME points to things coming apart under pressure, with emotion or focus drifting mid-exchange. A slow breath before you engage gives you a reset point to come back to.",
  },
  Composed: {
    tip: "Hold the standard. Add pressure, not pace.",
    why: "What you've told FRAME reads calm and controlled. Keep that base and raise the stakes in training rather than the speed, so your composure gets tested.",
  },
  Overextended: {
    tip: "Cut volume. Keep structure.",
    why: "What you've told FRAME suggests you're past what you can absorb. Trim the load but keep the technical shape, so you stay sharp without digging deeper.",
  },
};

/** The coaching prompt the Tip hands to the chat composer. The user still taps send. */
export function stateTipPrompt(state: StateTipKey): string {
  const tip = STATE_TIPS[state].tip.replace(/\.$/, "");
  return `My state is ${state}. Coach me through '${tip}' before my next session.`;
}
