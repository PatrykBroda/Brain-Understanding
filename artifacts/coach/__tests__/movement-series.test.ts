import { describe, expect, it } from "vitest";
import { computeSeries, torsoLeanDeg } from "../src/lib/movement-series";
import { analyseFrame, wristDrops } from "../src/lib/analysis-metrics";
import { decodePoseTrack, encodePoseTrack, type PosedFrame } from "../src/lib/pose-track";
import { figure, frames } from "./pose-fixtures";

function posed(fs: ReturnType<typeof frames>): PosedFrame[] {
  return fs.filter((f) => f.landmarks).map((f) => ({ timestamp: f.timestamp, landmarks: f.landmarks! }));
}

describe("graphs agree with the scores (same definitions)", () => {
  it("per-wrist drops average to analyseFrame's guardDrop", () => {
    for (const up of [-0.4, 0, 0.3, 0.9]) {
      const lm = figure({ handsUp: up });
      const d = wristDrops(lm);
      expect(d.left).not.toBeNull();
      expect(d.right).not.toBeNull();
      expect(analyseFrame(lm).guardDrop).toBeCloseTo((d.left! + d.right!) / 2, 10);
    }
  });

  it("the hands series is the negated per-wrist drop (up is up), and stance matches analyseFrame", () => {
    const fs = posed(frames(8, (i) => ({ handsUp: 0.8 - i * 0.2, stance: 1.2 + i * 0.1 })));
    const series = computeSeries(fs, null);
    const hands = series.find((s) => s.def.key === "hands")!;
    const stance = series.find((s) => s.def.key === "stance")!;
    fs.forEach((f, i) => {
      const d = wristDrops(f.landmarks);
      expect(hands.rows[i]!["left"]).toBeCloseTo(-d.left!, 10);
      expect(hands.rows[i]!["right"]).toBeCloseTo(-d.right!, 10);
      expect(stance.rows[i]!["stance"]).toBeCloseTo(analyseFrame(f.landmarks).stance!, 10);
    });
    // hands dropping over time => the series falls
    expect(hands.rows[7]!["left"]!).toBeLessThan(hands.rows[0]!["left"]!);
  });

  it("works on a track that went through quantise/decode (what the UI actually sees)", () => {
    const src = frames(16, (i) => ({ handsUp: 0.6 - i * 0.05 }));
    const dec = decodePoseTrack(encodePoseTrack(src, 1280, 720)!)!;
    const a = computeSeries(posed(src), null).find((s) => s.def.key === "hands")!;
    const b = computeSeries(dec.frames, null).find((s) => s.def.key === "hands")!;
    for (let i = 0; i < a.rows.length; i++) {
      expect(Math.abs((a.rows[i]!["left"] as number) - (b.rows[i]!["left"] as number))).toBeLessThan(0.02);
    }
  });
});

describe("lead / rear labelling", () => {
  it("uses Lead hand / Rear hand only when the stance side was measured", () => {
    const fs = posed(frames(6, () => ({})));
    const unknown = computeSeries(fs, null).find((s) => s.def.key === "hands")!;
    expect(unknown.def.lines.map((l) => l.label)).toEqual(["Left hand", "Right hand"]);
    const known = computeSeries(fs, "right").find((s) => s.def.key === "hands")!;
    expect(known.def.lines.map((l) => l.label)).toEqual(["Lead hand", "Rear hand"]);
  });

  it("maps the lead series to the lead side's wrist", () => {
    // left wrist held high, right wrist low
    const fs = posed(frames(6, () => ({ handsUp: 0.3 })));
    const asLeft = computeSeries(fs, "left").find((s) => s.def.key === "hands")!;
    const asRight = computeSeries(fs, "right").find((s) => s.def.key === "hands")!;
    expect(asLeft.rows[0]!["lead"]).toBeCloseTo(asRight.rows[0]!["rear"] as number, 10);
    expect(asLeft.rows[0]!["rear"]).toBeCloseTo(asRight.rows[0]!["lead"] as number, 10);
  });
});

describe("gaps stay gaps", () => {
  it("inserts a null row across a pose hole so the line breaks (no interpolation)", () => {
    const fs = posed(frames(14, (i) => (i >= 5 && i <= 8 ? null : { handsUp: 0.3 })));
    const hands = computeSeries(fs, null).find((s) => s.def.key === "hands")!;
    const gapRows = hands.rows.filter((r) => r["left"] == null && r["right"] == null);
    expect(gapRows).toHaveLength(1);
    const g = gapRows[0]!;
    const before = fs[4]!.timestamp;
    const after = fs[5]!.timestamp;
    expect(g.t).toBeGreaterThan(before);
    expect(g.t).toBeLessThan(after);
    // every other row carries real values
    expect(hands.rows.filter((r) => r["left"] != null)).toHaveLength(fs.length);
  });

  it("does not insert a gap row for normal ~0.25s spacing", () => {
    const fs = posed(frames(10, () => ({})));
    const hands = computeSeries(fs, null).find((s) => s.def.key === "hands")!;
    expect(hands.rows).toHaveLength(10);
  });

  it("yields null (not 0) where a value cannot be measured", () => {
    const fs = posed(frames(6, () => ({})));
    for (const i of [11, 12]) fs[2]!.landmarks[i]!.visibility = 0.05; // shoulders lost on one frame
    const hands = computeSeries(fs, null).find((s) => s.def.key === "hands")!;
    expect(hands.rows[2]!["left"]).toBeNull();
    expect(hands.rows[2]!["right"]).toBeNull();
    expect(hands.rows[1]!["left"]).not.toBeNull();
  });

  it("drops a series entirely when it can never be measured", () => {
    const fs = posed(frames(6, () => ({})));
    for (const f of fs) for (const i of [27, 28]) f.landmarks[i]!.visibility = 0; // ankles never visible
    expect(computeSeries(fs, null).some((s) => s.def.key === "stance")).toBe(false);
    expect(computeSeries([], null)).toEqual([]);
  });
});

describe("level change and torso lean", () => {
  it("level is relative to the clip's typical hip height: sinking reads negative", () => {
    const fs = posed(frames(9, (i) => ({ hipY: i === 4 ? 0.7 : 0.55 })));
    const level = computeSeries(fs, null).find((s) => s.def.key === "level")!;
    expect(level.rows[4]!["level"]!).toBeLessThan(-0.3);
    expect(Math.abs(level.rows[0]!["level"] as number)).toBeLessThan(0.05);
  });

  it("torso lean is 0 when stacked and signed by picture side", () => {
    expect(torsoLeanDeg(figure({ lean: 0 }))!).toBeCloseTo(0, 5);
    expect(torsoLeanDeg(figure({ lean: 0.3 }))!).toBeGreaterThan(10);
    expect(torsoLeanDeg(figure({ lean: -0.3 }))!).toBeLessThan(-10);
  });
});
