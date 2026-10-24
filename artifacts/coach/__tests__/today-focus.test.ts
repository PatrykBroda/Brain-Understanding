import { describe, expect, it } from "vitest";
import { focusBecause } from "../src/lib/today";

describe("focusBecause", () => {
  it("drops the stored check-in line and keeps the rest", () => {
    expect(
      focusBecause({
        because: [
          "Camp phase: Fight Week, 3 days to the event.",
          "Your check-in today: sleep 70, energy 62, soreness 66/100, stress 39/100.",
        ],
      }),
    ).toEqual(["Camp phase: Fight Week, 3 days to the event."]);
    expect(focusBecause({ because: [] })).toEqual([]);
  });
});
