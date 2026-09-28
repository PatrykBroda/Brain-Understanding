import { describe, expect, it } from "vitest";
import { analysisUpgradeRequired } from "../lib/analysisAccess";

describe("new footage entitlement", () => {
  it("requires FRAME+ even for the first self analysis", () => {
    expect(analysisUpgradeRequired("free", "self")).toMatchObject({
      code: "FRAME_PLUS_REQUIRED",
      feature: "video_analysis",
    });
  });
  it("requires FRAME+ for opponent analysis and remote footage", () => {
    expect(analysisUpgradeRequired("free", "opponent")?.feature).toBe("opponent_analysis");
    expect(analysisUpgradeRequired("free")?.feature).toBe("video_analysis");
  });
  it("lets subscribers analyse either kind of footage", () => {
    expect(analysisUpgradeRequired("frame_plus", "self")).toBeNull();
    expect(analysisUpgradeRequired("frame_plus", "opponent")).toBeNull();
  });
});