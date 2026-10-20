import { describe, expect, it } from "vitest";
import { analysisUpgradeRequired, freeAnalysisAllowance, FREE_ANALYSIS_LIMIT } from "../lib/analysisAccess";

describe("new footage entitlement", () => {
  it("gives free users two self analyses, then requires FRAME+", () => {
    expect(FREE_ANALYSIS_LIMIT).toBe(2);
    expect(analysisUpgradeRequired("free", "self", 0)).toBeNull();
    expect(analysisUpgradeRequired("free", "self", 1)).toBeNull();
    expect(analysisUpgradeRequired("free", "self", 2)).toMatchObject({
      code: "FRAME_PLUS_REQUIRED",
      feature: "video_analysis",
    });
    expect(analysisUpgradeRequired("free", "self", 7)?.code).toBe("FRAME_PLUS_REQUIRED");
  });
  it("assumes the allowance is spent when the count is unknown", () => {
    expect(analysisUpgradeRequired("free", "self")?.code).toBe("FRAME_PLUS_REQUIRED");
  });
  it("computes the remaining allowance", () => {
    expect(freeAnalysisAllowance(0)).toEqual({ limit: 2, used: 0, remaining: 2 });
    expect(freeAnalysisAllowance(5)).toEqual({ limit: 2, used: 5, remaining: 0 });
  });
  it("requires FRAME+ for opponent analysis and remote footage", () => {
    expect(analysisUpgradeRequired("free", "opponent", 0)?.feature).toBe("opponent_analysis");
    expect(analysisUpgradeRequired("free")?.feature).toBe("video_analysis");
  });
  it("lets subscribers analyse either kind of footage", () => {
    expect(analysisUpgradeRequired("frame_plus", "self")).toBeNull();
    expect(analysisUpgradeRequired("frame_plus", "opponent")).toBeNull();
  });
});