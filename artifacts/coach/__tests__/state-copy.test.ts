import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { STATE_CALIBRATION_SENTENCE, STATE_ENTER_LABEL, STATE_LABEL } from "../src/lib/state-copy";

describe("State page copy (client wording, verbatim)", () => {
  it("has exactly the label, sentence and button", () => {
    expect(STATE_LABEL).toBe("STATE");
    expect(STATE_CALIBRATION_SENTENCE).toBe(
      "FRAME calibrates your state using your conversations, fight readiness score and patterns observed over time.",
    );
    expect(STATE_ENTER_LABEL).toBe("Enter");
  });

  it("the page shows only that copy under the orb and Enter opens the coach", () => {
    const src = readFileSync(new URL("../src/pages/state.tsx", import.meta.url), "utf8");
    expect(src).toContain("STATE_CALIBRATION_SENTENCE");
    expect(src).toContain('href="/chat"');
    for (const gone of ["Tip", "What feeds this state", "Continue coaching", "Start coaching", "Fight readiness", "Check-in history", "state-tips", "Tap the sphere"]) {
      expect(src).not.toContain(gone);
    }
  });
});
