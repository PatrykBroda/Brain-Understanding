import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { STATE_CALIBRATION_SENTENCE, STATE_ENTER_LABEL, STATE_LABEL } from "../lib/stateCopy";

describe("State screen copy (client wording, verbatim)", () => {
  it("has exactly the label, sentence and button", () => {
    expect(STATE_LABEL).toBe("STATE");
    expect(STATE_CALIBRATION_SENTENCE).toBe(
      "FRAME calibrates your state using your conversations, fight readiness score and patterns observed over time.",
    );
    expect(STATE_ENTER_LABEL).toBe("Enter");
  });

  it("the screen shows only that copy under the orb and Enter opens the coach", () => {
    const src = readFileSync(resolve(__dirname, "../app/(tabs)/state.tsx"), "utf8");
    expect(src).toContain("STATE_CALIBRATION_SENTENCE");
    expect(src).toContain('router.push("/(tabs)/chat")');
    for (const gone of ["Tip", "What shapes this", "Continue with your coach", "Start coaching", "Fight readiness", "Check-in history", "stateTips"]) {
      expect(src).not.toContain(gone);
    }
  });
});
