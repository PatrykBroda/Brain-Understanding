import { describe, expect, it } from "vitest";
import {
  ARROW_MIN_TRAVEL,
  containRect,
  decodePoseTrack,
  dequantiseCoord,
  encodePoseTrack,
  inferLeadSide,
  makePosePoints,
  medianTorsoPx,
  movementArrow,
  nearestFrameIndex,
  normaliseFrameInto,
  quantiseCoord,
  regionGeometry,
  regionLandmarks,
  sampleNormalisedInto,
  sampleTrack,
  windowFrames,
  windowIsUsable,
  TRACK_BYTES_PER_FRAME,
  type PosedFrame,
} from "../src/lib/pose-track";
import { sanitisePoseTrack } from "../../api-server/src/lib/poseTrack";
import { figure, frames } from "./pose-fixtures";

// The contract test below imports the SERVER sanitiser; it pulls in the db
// package for the region enum, which loads fine in the workspace.

function posed(fs: ReturnType<typeof frames>): PosedFrame[] {
  return fs.filter((f) => f.landmarks).map((f) => ({ timestamp: f.timestamp, landmarks: f.landmarks! }));
}

describe("quantise / dequantise", () => {
  it("round-trips coordinates to well under a pixel on a 4K frame", () => {
    for (const v of [-0.5, -0.1, 0, 0.123456, 0.5, 0.987654, 1, 1.4999]) {
      expect(Math.abs(dequantiseCoord(quantiseCoord(v)) - v)).toBeLessThan(2 / 65535 + 1e-9);
    }
  });
  it("clamps out-of-range values instead of wrapping", () => {
    expect(quantiseCoord(-5)).toBe(0);
    expect(quantiseCoord(9)).toBe(65535);
  });
});

describe("encodePoseTrack / decodePoseTrack", () => {
  const src = frames(20, (i) => ({ cx: 0.4 + i * 0.01, handsUp: 0.3 - i * 0.02 }));

  it("round-trips landmarks, timestamps and visibility", () => {
    const wire = encodePoseTrack(src, 1280, 720)!;
    expect(wire).not.toBeNull();
    expect(wire.v).toBe(1);
    expect(wire.t).toHaveLength(20);
    const dec = decodePoseTrack(wire)!;
    expect(dec.frames).toHaveLength(20);
    expect(dec.w).toBe(1280);
    expect(dec.h).toBe(720);
    for (let i = 0; i < src.length; i++) {
      expect(dec.frames[i]!.timestamp).toBeCloseTo(src[i]!.timestamp, 3);
      for (let j = 0; j < 33; j++) {
        const a = src[i]!.landmarks![j]!;
        const b = dec.frames[i]!.landmarks[j]!;
        expect(Math.abs(a.x - b.x)).toBeLessThan(1e-4);
        expect(Math.abs(a.y - b.y)).toBeLessThan(1e-4);
        expect(Math.abs(a.visibility - b.visibility)).toBeLessThanOrEqual(1 / 255 + 1e-9);
      }
    }
  });

  it("keeps only frames with a pose and leaves the gap in the timestamps", () => {
    const withHoles = frames(12, (i) => (i >= 4 && i <= 6 ? null : { cx: 0.5 }));
    const wire = encodePoseTrack(withHoles, 640, 360)!;
    expect(wire.t).toHaveLength(9);
    expect(wire.t).toEqual([0, 250, 500, 750, 1750, 2000, 2250, 2500, 2750]);
    const dec = decodePoseTrack(wire)!;
    expect(dec.frames).toHaveLength(9);
  });

  it("returns null when fewer than 3 frames locked a pose", () => {
    expect(encodePoseTrack(frames(10, (i) => (i < 2 ? { cx: 0.5 } : null)), 640, 360)).toBeNull();
    expect(encodePoseTrack([], 640, 360)).toBeNull();
  });

  it("stays far below the 150KB ceiling for a full 220-frame clip", () => {
    const wire = encodePoseTrack(frames(220, (i) => ({ cx: 0.3 + (i % 20) * 0.01 })), 1920, 1080)!;
    const bytes = wire.d.length + wire.t.length * 8;
    expect(bytes).toBeLessThan(150_000);
    expect(bytes).toBeLessThan(55_000); // ~48KB base64 + timestamps
    expect(wire.d.length).toBeGreaterThan(220 * TRACK_BYTES_PER_FRAME); // base64 overhead sanity
  });

  it("drops non-increasing timestamps rather than producing an invalid track", () => {
    const f = frames(6, () => ({ cx: 0.5 }));
    f[3] = { ...f[3]!, timestamp: f[2]!.timestamp }; // duplicate time
    const wire = encodePoseTrack(f, 640, 360)!;
    expect(wire.t).toEqual([0, 250, 500, 1000, 1250]);
  });

  it("decode rejects malformed wire objects", () => {
    expect(decodePoseTrack(null)).toBeNull();
    expect(decodePoseTrack({})).toBeNull();
    expect(decodePoseTrack({ v: 1, w: 640, h: 360, lead: null, t: [0, 250, 500], d: "AAAA" })).toBeNull();
    expect(decodePoseTrack({ v: 2, w: 640, h: 360, lead: null, t: [0], d: "" })).toBeNull();
  });

  it("CONTRACT: whatever the client encodes, the server sanitiser accepts unchanged", () => {
    const wire = encodePoseTrack(src, 1280, 720)!;
    const server = sanitisePoseTrack(JSON.parse(JSON.stringify(wire)));
    expect(server).not.toBeNull();
    expect(server).toEqual(wire);
    // ...and the stored form decodes back to the same frames.
    expect(decodePoseTrack(server)!.frames).toHaveLength(20);
  });
});

describe("inferLeadSide", () => {
  it("calls left when the left foot is forward in the facing direction", () => {
    const fs = posed(frames(12, () => ({ facing: 1, leadLeft: true })));
    expect(inferLeadSide(fs)).toBe("left");
  });
  it("calls right when the right foot is forward, and mirrors when facing image-left", () => {
    expect(inferLeadSide(posed(frames(12, () => ({ facing: 1, leadLeft: false }))))).toBe("right");
    expect(inferLeadSide(posed(frames(12, () => ({ facing: -1, leadLeft: true }))))).toBe("left");
    expect(inferLeadSide(posed(frames(12, () => ({ facing: -1, leadLeft: false }))))).toBe("right");
  });
  it("returns null (never guesses) with too few usable frames or a mixed vote", () => {
    expect(inferLeadSide(posed(frames(4, () => ({ facing: 1, leadLeft: true }))))).toBeNull();
    const mixed = posed(frames(12, (i) => ({ facing: 1, leadLeft: i % 2 === 0 })));
    expect(inferLeadSide(mixed)).toBeNull();
  });
  it("returns null for a frontal view (nose not ahead of the ears)", () => {
    const front = posed(frames(12, () => ({ facing: 1, leadLeft: true }))).map((f) => {
      const lm = f.landmarks.map((l) => ({ ...l }));
      lm[0]!.x = (lm[7]!.x + lm[8]!.x) / 2; // nose dead-centre
      return { ...f, landmarks: lm };
    });
    expect(inferLeadSide(front)).toBeNull();
  });
  it("is stored in the encoded track", () => {
    const wire = encodePoseTrack(frames(12, () => ({ facing: 1, leadLeft: true })), 640, 360)!;
    expect(wire.lead).toBe("left");
  });
});

describe("sampleTrack — gaps are gaps", () => {
  const track = posed(frames(12, (i) => (i >= 4 && i <= 7 ? null : { cx: 0.2 + i * 0.05 })));
  // present: 0..0.75s and 2.0..2.75s -> a 1.25s hole (0.75 -> 2.0)

  it("interpolates between adjacent samples", () => {
    const s = sampleTrack(track, 0.125)!;
    expect(s.alpha).toBeCloseTo(0.5, 5);
    expect(s.a.timestamp).toBe(0);
    expect(s.b.timestamp).toBe(0.25);
  });
  it("returns null in the middle of a long pose gap", () => {
    expect(sampleTrack(track, 1.35)).toBeNull();
  });
  it("holds the edge only while it is genuinely close, never bridging the hole", () => {
    expect(sampleTrack(track, 0.9)).not.toBeNull(); // 0.15s after last good frame
    expect(sampleTrack(track, 1.1)).toBeNull(); // 0.35s after -> beyond half the max gap
    const s = sampleTrack(track, 1.9)!; // 0.1s before the next good frame
    expect(s.a.timestamp).toBe(2.0);
    expect(s.alpha).toBe(0);
  });
  it("is null well before the first and after the last frame", () => {
    expect(sampleTrack(track, -1)).toBeNull();
    expect(sampleTrack(track, 10)).toBeNull();
  });
});

describe("nearestFrameIndex", () => {
  const t = posed(frames(8, () => ({ cx: 0.5 })));
  it("finds the frame at a keyframe timestamp and refuses far ones", () => {
    expect(nearestFrameIndex(t, 0.5)).toBe(2);
    expect(nearestFrameIndex(t, 0.52)).toBe(2);
    expect(nearestFrameIndex(t, 0.62)).toBe(-1);
  });
});

describe("normalisation for comparisons", () => {
  const spec = { w: 1000, h: 1000, scale: 100 };
  const out = makePosePoints();

  it("centres on the hip midpoint (hips map to ~0,0)", () => {
    const f: PosedFrame = { timestamp: 0, landmarks: figure({ cx: 0.31, hipY: 0.61 }) };
    expect(normaliseFrameInto(out, f, { w: 1000, h: 1000, scale: 220 })).toBe(true);
    expect((out.x[23]! + out.x[24]!) / 2).toBeCloseTo(0, 5);
    expect((out.y[23]! + out.y[24]!) / 2).toBeCloseTo(0, 5);
  });

  it("is translation invariant: the same pose elsewhere in frame normalises identically", () => {
    const a: PosedFrame = { timestamp: 0, landmarks: figure({ cx: 0.3, hipY: 0.5 }) };
    const b: PosedFrame = { timestamp: 0, landmarks: figure({ cx: 0.7, hipY: 0.6 }) };
    const pa = makePosePoints();
    const pb = makePosePoints();
    normaliseFrameInto(pa, a, spec);
    normaliseFrameInto(pb, b, spec);
    for (let i = 0; i < 33; i++) {
      expect(pa.x[i]).toBeCloseTo(pb.x[i]!, 3);
      expect(pa.y[i]).toBeCloseTo(pb.y[i]!, 3);
    }
  });

  it("is scale invariant when each side uses its own torso length", () => {
    const small = encodePoseTrack(frames(6, () => ({ scale: 0.6 })), 1000, 1000)!;
    const big = encodePoseTrack(frames(6, () => ({ scale: 1.1 })), 1000, 1000)!;
    const ds = decodePoseTrack(small)!;
    const db = decodePoseTrack(big)!;
    const ss = { scale: medianTorsoPx(ds), w: ds.w, h: ds.h };
    const sb = { scale: medianTorsoPx(db), w: db.w, h: db.h };
    expect(sb.scale / ss.scale).toBeCloseTo(1.1 / 0.6, 1);
    const pa = makePosePoints();
    const pb = makePosePoints();
    normaliseFrameInto(pa, ds.frames[0]!, ss);
    normaliseFrameInto(pb, db.frames[0]!, sb);
    for (const i of [0, 11, 12, 15, 16, 27, 28]) {
      expect(pa.x[i]).toBeCloseTo(pb.x[i]!, 1);
      expect(pa.y[i]).toBeCloseTo(pb.y[i]!, 1);
    }
  });

  it("accounts for non-square frames (pixel units, not normalised units)", () => {
    const f: PosedFrame = { timestamp: 0, landmarks: figure({}) };
    const wide = makePosePoints();
    const sq = makePosePoints();
    normaliseFrameInto(wide, f, { w: 1600, h: 900, scale: 100 });
    normaliseFrameInto(sq, f, { w: 900, h: 900, scale: 100 });
    // x is stretched by the width, y identical
    expect(wide.y[27]).toBeCloseTo(sq.y[27]!, 6);
    expect(Math.abs(wide.x[27]!)).toBeGreaterThan(Math.abs(sq.x[27]!) * 1.5);
  });

  it("refuses frames whose hips are not visible", () => {
    const lm = figure({});
    lm[23]!.visibility = 0.1;
    expect(normaliseFrameInto(out, { timestamp: 0, landmarks: lm }, spec)).toBe(false);
  });

  it("sampleNormalisedInto blends two frames and reports no-pose in a gap", () => {
    const tr = posed(frames(8, (i) => (i === 3 || i === 4 || i === 5 ? null : { handsUp: i * 0.1 })));
    const a = makePosePoints();
    const b = makePosePoints();
    const o = makePosePoints();
    expect(sampleNormalisedInto(o, a, b, tr, 0.125, spec)).toBe(true);
    expect(sampleNormalisedInto(o, a, b, tr, 0.9, spec)).toBe(false);
  });

  it("windowFrames re-bases a slice to t=0 and windowIsUsable rejects holes/short slices", () => {
    const tr = posed(frames(40, () => ({})));
    const w = windowFrames(tr, 2, 2.5);
    expect(w[0]!.timestamp).toBe(0);
    expect(w[w.length - 1]!.timestamp).toBeCloseTo(2.5, 6);
    expect(windowIsUsable(w)).toBe(true);
    expect(windowIsUsable(w.slice(0, 2))).toBe(false);
    const holey = posed(frames(40, (i) => (i > 12 && i < 20 ? null : {})));
    expect(windowIsUsable(windowFrames(holey, 2, 4))).toBe(false);
  });
});

describe("body regions", () => {
  it("resolves lead/rear to the measured side and refuses to guess without one", () => {
    expect(regionLandmarks("lead_hand", "left")![0]).toBe(15);
    expect(regionLandmarks("rear_hand", "left")![0]).toBe(16);
    expect(regionLandmarks("lead_foot", "right")![0]).toBe(28);
    expect(regionLandmarks("rear_knee", "right")).toEqual([25]);
    expect(regionLandmarks("lead_hand", null)).toBeNull();
    expect(regionLandmarks("rear_foot", null)).toBeNull();
    expect(regionLandmarks("head", null)).toEqual([0, 2, 5, 7, 8, 9, 10]);
    expect(regionLandmarks("hips", null)).toEqual([23, 24]);
  });

  it("puts the ring on the region's real landmarks", () => {
    const f: PosedFrame = { timestamp: 0, landmarks: figure({}) };
    const g = regionGeometry(f, "lead_hand", "left", 16 / 9)!;
    const wrist = f.landmarks[15]!;
    expect(Math.abs(g.cx - wrist.x)).toBeLessThan(0.02);
    expect(Math.abs(g.cy - wrist.y)).toBeLessThan(0.02);
    expect(g.r).toBeGreaterThan(0.03);
    expect(regionGeometry(f, "lead_hand", null, 1)).toBeNull();
  });

  it("returns null geometry when the region's landmarks are not visible", () => {
    const lm = figure({});
    for (const i of [15, 17, 19, 21]) lm[i]!.visibility = 0.05;
    expect(regionGeometry({ timestamp: 0, landmarks: lm }, "lead_hand", "left", 1)).toBeNull();
  });
});

describe("movementArrow", () => {
  it("points from where the region was a few frames earlier to where it is at the keyframe", () => {
    const tr = posed(frames(10, (i) => ({ cx: 0.3 + i * 0.04, facing: 1 })));
    const a = movementArrow(tr, 6, "hips", null, 16 / 9)!;
    expect(a).not.toBeNull();
    expect(a.to.x).toBeGreaterThan(a.from.x); // moving image-right
    expect(a.from.x).toBeCloseTo(0.3 + 3 * 0.04, 2);
    expect(a.to.x).toBeCloseTo(0.3 + 6 * 0.04, 2);
  });
  it("draws no arrow when the region barely moved", () => {
    const tr = posed(frames(10, () => ({ cx: 0.5 })));
    expect(movementArrow(tr, 6, "hips", null, 16 / 9)).toBeNull();
    expect(ARROW_MIN_TRAVEL).toBeGreaterThan(0);
  });
  it("draws no arrow when the look-back crosses a pose gap or runs off the start", () => {
    const gappy = posed(frames(12, (i) => (i >= 4 && i <= 6 ? null : { cx: 0.3 + i * 0.04 })));
    const idx = gappy.findIndex((f) => f.timestamp === 2);
    expect(movementArrow(gappy, idx, "hips", null, 1)).toBeNull();
    const tr = posed(frames(10, (i) => ({ cx: 0.3 + i * 0.04 })));
    expect(movementArrow(tr, 1, "hips", null, 1)).toBeNull();
  });
  it("draws no arrow for a sided region without a measured lead side", () => {
    const tr = posed(frames(10, (i) => ({ cx: 0.3 + i * 0.04 })));
    expect(movementArrow(tr, 6, "lead_hand", null, 1)).toBeNull();
  });
});

describe("containRect", () => {
  it("letterboxes a 16:9 video inside a square box", () => {
    const r = containRect(400, 400, 1600, 900);
    expect(r.w).toBe(400);
    expect(r.h).toBeCloseTo(225, 5);
    expect(r.y).toBeCloseTo(87.5, 5);
  });
  it("pillarboxes a portrait video inside a wide box", () => {
    const r = containRect(800, 400, 900, 1600);
    expect(r.h).toBe(400);
    expect(r.x).toBeGreaterThan(0);
  });
});
