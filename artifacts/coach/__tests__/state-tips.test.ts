import { describe, expect, it } from "vitest";
import { STATE_TIPS, stateTipPrompt, type StateTipKey } from "../src/lib/state-tips";

const KEYS = Object.keys(STATE_TIPS) as StateTipKey[];

describe("state tips", () => {
  it("covers all eight states with a tip and a reason", () => {
    expect(KEYS).toHaveLength(8);
    for (const k of KEYS) {
      expect(STATE_TIPS[k].tip.length).toBeGreaterThan(10);
      expect(STATE_TIPS[k].why.length).toBeGreaterThan(40);
    }
  });

  it("every tip is distinct and no reason claims live biometrics", () => {
    expect(new Set(KEYS.map((k) => STATE_TIPS[k].tip)).size).toBe(8);
    for (const k of KEYS) expect(STATE_TIPS[k].why).not.toMatch(/heart rate|HRV|measured|sensor|wearable/i);
  });

  it("builds the coaching prompt from the state and tip", () => {
    expect(stateTipPrompt("Volatile")).toBe(
      "My state is Volatile. Coach me through 'Anchor the breath before the exchange' before my next session.",
    );
    expect(stateTipPrompt("Composed")).toContain("'Hold the standard. Add pressure, not pace'");
  });
});
