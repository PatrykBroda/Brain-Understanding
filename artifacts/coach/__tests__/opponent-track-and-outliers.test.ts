import { describe, expect, it } from "vitest";
import {
  MAX_HAND_OFFSET,
  MAX_STANCE,
  analyseFrame,
  computeMetrics,
  shoulderFloor,
  wristDrops,
} from "../src/lib/analysis-metrics";
import { computeSeries, torsoLeanDeg } from "../src/lib/movement-series";
import {
  decodeOpponentTrack,
  decodePoseTrack,
  encodePoseTrack,
  type PosedFrame,
} from "../src/lib/pose-track";
import { buildSameClipLanes } from "../src/lib/pose-compare";
import { sanitisePoseTrack } from "../../api-server/src/lib/poseTrack";
import type { Landmark, PoseFrame } from "../src/lib/pose";
import { figure, frames } from "./pose-fixtures";

// ---------------------------------------------------------------------------
// Graph / score outliers
// ---------------------------------------------------------------------------

/** A normal frame turned side-on: shoulders collapse together, so ratios blow up. */
function foreshortened(base: Landmark[], width = 0.05): Landmark[] {
  const lm = base.map((p) => ({ ...p }));
  const mid = (lm[11]!.x + lm[12]!.x) / 2;
  lm[11]!.x = mid - width / 2;
  lm[12]!.x = mid + width / 2; // above the 0.02 absolute floor, well below the clip median (0.13)
  return lm;
}

function asPosed(fs: PoseFrame[]): PosedFrame[] {
  return fs.filter((f) => f.landmarks).map((f) => ({ timestamp: f.timestamp, landmarks: f.landmarks! }));
}

describe("graph/score outlier handling", () => {
  const clip = (): PoseFrame[] => {
    const fs = frames(24, () => ({ handsUp: 0.5, stance: 1.6 }));
    // three glitch frames in the middle
    for (const i of [10, 11, 12]) fs[i] = { timestamp: fs[i]!.timestamp, landmarks: foreshortened(fs[i]!.landmarks!) };
    return fs;
  };

  it("without the per-clip floor a foreshortened frame passes as plausible; with it, it is rejected", () => {
    const g = foreshortened(figure({ handsUp: 0.5, stance: 1.6 }));
    const naive = analyseFrame(g); // absolute 0.02 floor only
    expect(naive.stance!).toBeGreaterThan(3.5); // looks like a wide stance, but it is just the turn
    expect(analyseFrame(g, 0.065).stance).toBeNull();
    expect(wristDrops(g).left).not.toBeNull();
    expect(wristDrops(g, 0.065).left).toBeNull();
  });

  it("an extreme collapse is also caught by the plausibility cap alone", () => {
    const g = foreshortened(figure({ handsUp: 0.5, stance: 1.6 }), 0.025);
    expect(analyseFrame(g).stance).toBeNull(); // 8x shoulder widths is not a stance
  });

  it("shoulderFloor is half the clip's median shoulder width, and safe with no data", () => {
    const fs = clip();
    expect(shoulderFloor(fs)).toBeCloseTo(0.13 * 0.5, 2);
    expect(shoulderFloor([{ landmarks: null }])).toBe(0.02);
    expect(shoulderFloor([])).toBe(0.02);
  });

  it("foreshortened frames are gaps in the graphs, not spikes", () => {
    const series = computeSeries(asPosed(clip()), null);
    const stance = series.find((s) => s.def.key === "stance")!;
    const hands = series.find((s) => s.def.key === "hands")!;
    for (const i of [10, 11, 12]) {
      expect(stance.rows[i]!["stance"]).toBeNull();
      expect(hands.rows[i]!["left"]).toBeNull();
      expect(hands.rows[i]!["right"]).toBeNull();
    }
    const vals = stance.rows.map((r) => r["stance"]).filter((v): v is number => v != null);
    expect(vals.length).toBe(21);
    expect(Math.max(...vals)).toBeLessThan(2);
    const hv = hands.rows.flatMap((r) => [r["left"], r["right"]]).filter((v): v is number => v != null);
    expect(Math.min(...hv)).toBeGreaterThan(-MAX_HAND_OFFSET);
    expect(Math.max(...hv)).toBeLessThan(MAX_HAND_OFFSET);
  });

  it("scores and graphs agree: the same frames are excluded from both", () => {
    const fs = clip();
    const metrics = computeMetrics(fs);
    const stanceSignal = metrics.signals.find((s) => s.key === "stance_width")!;
    const series = computeSeries(asPosed(fs), null);
    const stance = series.find((s) => s.def.key === "stance")!;
    const vals = stance.rows.map((r) => r["stance"]).filter((v): v is number => v != null);
    const graphMean = vals.reduce((a, b) => a + b, 0) / vals.length;
    // The score says "feet average 1.60x shoulder width"; the graph's mean is that same 1.60.
    expect(stanceSignal.detail).toContain(`${graphMean.toFixed(2)}x`);
    expect(graphMean).toBeCloseTo(1.6, 1);
    // and the glitch did not drag the guard score either
    const clean = computeMetrics(frames(24, () => ({ handsUp: 0.5, stance: 1.6 })));
    const g1 = metrics.signals.find((s) => s.key === "guard_height")!;
    const g0 = clean.signals.find((s) => s.key === "guard_height")!;
    expect(g1.detail).toBe(g0.detail);
    expect(metrics.scores.map((s) => s.value)).toEqual(clean.scores.map((s) => s.value));
  });

  it("physically impossible values are rejected even when the shoulders look normal", () => {
    const far = figure({ handsUp: 3.1 }); // left wrist 3.1 shoulder widths above the line
    const d = wristDrops(far);
    expect(d.left).toBeNull();
    expect(d.right).not.toBeNull(); // the other wrist is fine: only the glitch is dropped
    const wide = figure({ stance: MAX_STANCE + 2 });
    expect(analyseFrame(wide).stance).toBeNull();
    expect(analyseFrame(figure({ stance: 3 })).stance).toBeCloseTo(3, 1);
  });

  it("an upside-down torso (shoulders below hips) is not plotted as a lean", () => {
    const g = figure({ lean: 0 });
    for (const i of [11, 12]) g[i] = { ...g[i]!, y: g[23]!.y + 0.2 }; // shoulders under the hips
    expect(torsoLeanDeg(g)).toBeNull();
    expect(torsoLeanDeg(figure({ lean: 0.5 }))).toBeGreaterThan(20);
  });

  it("a normal clip is untouched by the guards", () => {
    const fs = frames(16, (i) => ({ handsUp: 0.8 - i * 0.1, stance: 1.2 + i * 0.05 }));
    const series = computeSeries(asPosed(fs), null);
    expect(series.find((s) => s.def.key === "stance")!.rows.every((r) => r["stance"] != null)).toBe(true);
    expect(series.find((s) => s.def.key === "hands")!.rows.every((r) => r["left"] != null)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Opponent track: wire format, sanitiser, decode
// ---------------------------------------------------------------------------

describe("opponent track on the wire", () => {
  const you = frames(12, (i) => ({ cx: 0.3, handsUp: 0.2 + i * 0.01 }));
  const them = frames(12, (i) => ({ cx: 0.7, facing: -1 as const, handsUp: 0.5 - i * 0.01 }));

  it("round-trips: athlete in the main track, opponent in opp, both decodable", () => {
    const wire = encodePoseTrack(you, 1280, 720, them)!;
    expect(wire.opp).toBeDefined();
    const a = decodePoseTrack(wire)!;
    const o = decodeOpponentTrack(wire)!;
    expect(a.frames).toHaveLength(12);
    expect(o.frames).toHaveLength(12);
    expect(a.frames[0]!.landmarks[23]!.x).toBeCloseTo(0.3 - 0.04 * 0 , 1);
    expect(o.frames[0]!.landmarks[23]!.x).toBeGreaterThan(0.6);
    expect(o.w).toBe(1280);
    expect(o.h).toBe(720);
  });

  it("single-person encode is byte-identical to before: no opp key at all", () => {
    const wire = encodePoseTrack(you, 1280, 720)!;
    expect("opp" in wire).toBe(false);
    expect(Object.keys(wire).sort()).toEqual(["d", "h", "lead", "t", "v", "w"]);
    expect(decodeOpponentTrack(wire)).toBeNull();
    // null / undefined opponent behave the same
    expect(encodePoseTrack(you, 1280, 720, null)).toEqual(wire);
  });

  it("an opponent with too few pose frames is simply left out", () => {
    const sparse = frames(12, (i) => (i < 2 ? { cx: 0.7 } : null));
    const wire = encodePoseTrack(you, 1280, 720, sparse)!;
    expect(wire.opp).toBeUndefined();
  });

  it("no athlete track means no wire, even with an opponent", () => {
    expect(encodePoseTrack(frames(12, () => null), 1280, 720, them)).toBeNull();
  });

  it("CONTRACT: the server sanitiser accepts exactly what the client encodes, opponent included", () => {
    const wire = encodePoseTrack(you, 1280, 720, them)!;
    const server = sanitisePoseTrack(JSON.parse(JSON.stringify(wire)));
    expect(server).toEqual(wire);
  });

  it("decodeOpponentTrack tolerates garbage and old rows", () => {
    expect(decodeOpponentTrack(null)).toBeNull();
    expect(decodeOpponentTrack({ v: 1, w: 10, h: 10, t: [], d: "" })).toBeNull();
    expect(decodeOpponentTrack({ ...encodePoseTrack(you, 640, 360)!, opp: { lead: null, t: [0, 1, 2], d: "AAAA" } })).toBeNull();
  });
});

describe("same-clip comparison lanes", () => {
  it("blue you vs red opponent, sharing the clip clock", () => {
    const you = frames(16, () => ({ cx: 0.3 }));
    const them = frames(16, () => ({ cx: 0.7, facing: -1 as const }));
    const wire = encodePoseTrack(you, 1280, 720, them)!;
    const built = buildSameClipLanes(decodePoseTrack(wire)!, decodeOpponentTrack(wire)!)!;
    expect(built.lanes.map((l) => l.label)).toEqual(["You (blue)", "Opponent (red)"]);
    expect(built.lanes[0]!.swatch).toBe("#4da3ff");
    expect(built.lanes[1]!.swatch).toBe("#ff5656");
    expect(built.duration).toBeGreaterThan(3);
  });

  it("is hidden when a side has no usable data", () => {
    const wire = encodePoseTrack(frames(16, () => ({})), 1280, 720, frames(16, () => ({ cx: 0.7 })))!;
    const dec = decodePoseTrack(wire)!;
    const one = { ...decodeOpponentTrack(wire)!, endSec: 0.2 };
    expect(buildSameClipLanes(dec, one)).toBeNull();
  });
});
