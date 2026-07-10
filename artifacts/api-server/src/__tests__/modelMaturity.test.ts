import { describe, expect, it } from "vitest";
import { computeModelMaturity, type MaturityFactInput } from "@workspace/ontology";

function fact(
  category: string,
  opts: { evidenceCount?: number; sourceTypes?: string[] } = {},
): MaturityFactInput {
  return {
    category,
    confidence: 3,
    evidenceCount: opts.evidenceCount ?? 1,
    sources: (opts.sourceTypes ?? ["chat"]).map((type) => ({ type })),
  };
}

describe("computeModelMaturity", () => {
  it("empty model is Observer at 0 completeness", () => {
    const m = computeModelMaturity([]);
    expect(m.stage.key).toBe("observer");
    expect(m.completeness).toBe(0);
    expect(m.factCount).toBe(0);
  });

  it("a few single-category facts stay Observer", () => {
    const m = computeModelMaturity([fact("weakness"), fact("weakness"), fact("strength")]);
    expect(m.stage.key).toBe("observer");
  });

  it("5+ facts across 3+ categories reaches Pattern recognition", () => {
    const m = computeModelMaturity([
      fact("weakness"),
      fact("strength"),
      fact("pattern"),
      fact("goal"),
      fact("context"),
    ]);
    expect(m.stage.key).toBe("pattern_recognition");
  });

  it("corroboration is required for Personal coach — breadth alone is not enough", () => {
    const broad = Array.from({ length: 12 }, (_, i) =>
      fact(["weakness", "strength", "pattern", "goal", "context"][i % 5]),
    );
    expect(computeModelMaturity(broad).stage.key).toBe("pattern_recognition");

    const withRepeats = broad.map((f, i) =>
      i < 3 ? { ...f, evidenceCount: 2 } : f,
    );
    expect(computeModelMaturity(withRepeats).stage.key).toBe("personal_coach");
  });

  it("Performance partner needs depth, breadth, corroboration AND cross-source evidence", () => {
    const cats = ["weakness", "strength", "pattern", "goal", "context", "preference"];
    const deep = Array.from({ length: 25 }, (_, i) =>
      fact(cats[i % 6], {
        evidenceCount: i < 8 ? 2 : 1,
        sourceTypes: i < 3 ? ["chat", "video"] : ["chat"],
      }),
    );
    expect(computeModelMaturity(deep).stage.key).toBe("performance_partner");

    // Remove the cross-source signal — drops back to personal coach
    const noCross = deep.map((f) => ({ ...f, sources: [{ type: "chat" }] }));
    expect(computeModelMaturity(noCross).stage.key).toBe("personal_coach");
  });

  it("marker source types never count toward cross-source diversity", () => {
    const m = computeModelMaturity([
      fact("weakness", { sourceTypes: ["chat", "athlete_confirmed", "athlete_stated"] }),
    ]);
    expect(m.crossSource).toBe(0);
  });

  it("completeness is monotonic in evidence and capped at 100", () => {
    const small = computeModelMaturity([fact("weakness")]);
    const cats = ["weakness", "strength", "pattern", "goal", "context", "preference", "event", "technical_knowledge"];
    const huge = Array.from({ length: 40 }, (_, i) =>
      fact(cats[i % 8], { evidenceCount: 3, sourceTypes: ["chat", "video", "calibration"] }),
    );
    const big = computeModelMaturity(huge);
    expect(big.completeness).toBeGreaterThan(small.completeness);
    expect(big.completeness).toBeLessThanOrEqual(100);
    expect(big.completeness).toBe(100);
  });

  it("is deterministic", () => {
    const facts = [fact("weakness", { evidenceCount: 2 }), fact("goal")];
    expect(computeModelMaturity(facts)).toEqual(computeModelMaturity(facts));
  });
});
