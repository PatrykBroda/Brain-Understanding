import { describe, expect, it } from "vitest";
import { maskOffFrame, scrubInsaneSkeletons, skeletonSane, trackReliability } from "../src/lib/pose-sanity";
import { figure, frames } from "./pose-fixtures";

const W = 1280;
const H = 720;

describe("skeletonSane", () => {
  it("accepts a normal figure, standing or side-on", () => {
    expect(skeletonSane(figure(), W, H)).toBe(true);
    expect(skeletonSane(figure({ stance: 0.4, lean: 0.3 }), W, H)).toBe(true);
  });

  it("rejects a bow-tie torso (shoulders/hips twisted so the sides cross)", () => {
    const lm = figure();
    const a = lm[23]!;
    lm[23] = lm[24]!;
    lm[24] = a; // hips swapped under the shoulders
    expect(skeletonSane(lm, W, H)).toBe(false);
  });

  it("rejects a limb far longer than any real bone (a joint thrown across the frame)", () => {
    const lm = figure();
    lm[15] = { x: 0.02, y: 0.95, z: 0, visibility: 0.9 }; // left wrist at the far corner
    expect(skeletonSane(lm, W, H)).toBe(false);
  });

  it("rejects a collapsed (near-zero) torso", () => {
    const lm = figure();
    for (const i of [11, 12, 23, 24]) lm[i] = { x: 0.5, y: 0.5, z: 0, visibility: 0.9 };
    expect(skeletonSane(lm, W, H)).toBe(false);
  });

  it("does not judge what it cannot see: no visible torso = left to the tracker's own quality gate", () => {
    const lm = figure();
    lm[23] = { ...lm[23]!, visibility: 0.1 };
    expect(skeletonSane(lm, W, H)).toBe(true);
  });
});

describe("scrubInsaneSkeletons", () => {
  it("turns only the impossible frames into 'no lock' and counts them", () => {
    const f = frames(10, () => ({}));
    const bad = f[3]!.landmarks!;
    bad[15] = { x: 0.01, y: 0.99, z: 0, visibility: 0.9 };
    f[6] = { timestamp: f[6]!.timestamp, landmarks: null }; // already no lock: not judged
    const r = scrubInsaneSkeletons(f, W, H);
    expect(r.judged).toBe(9);
    expect(r.dropped).toBe(1);
    expect(r.frames[3]!.landmarks).toBeNull();
    expect(r.frames[2]!.landmarks).not.toBeNull();
    expect(r.frames[3]!.timestamp).toBe(f[3]!.timestamp);
    expect(f[3]!.landmarks).not.toBeNull(); // input untouched
  });
});

describe("trackReliability", () => {
  const rel = (fs: ReturnType<typeof frames>) => trackReliability(scrubInsaneSkeletons(fs, W, H).frames, W, H, scrubInsaneSkeletons(fs, W, H));

  it("calls a steady, mostly-found track good", () => {
    const r = rel(frames(40, (i) => ({ cx: 0.4 + (i % 8) * 0.01 })));
    expect(r.level).toBe("good");
    expect(r.reasons).toEqual([]);
  });

  it("is low when the athlete is found in only a small part of the clip", () => {
    const r = rel(frames(40, (i) => (i < 6 ? {} : null)));
    expect(r.level).toBe("low");
    expect(r.reasons.join(" ")).toMatch(/small part/);
  });

  it("is low when the body outline keeps jumping (close-up / overlap)", () => {
    const r = rel(frames(40, (i) => ({ scale: i % 2 ? 1 : 0.55 })));
    expect(r.level).toBe("low");
    expect(r.reasons.join(" ")).toMatch(/jumping/);
  });

  it("is low when many skeletons were impossible", () => {
    const fs = frames(40, () => ({}));
    for (let i = 0; i < 40; i += 2) fs[i]!.landmarks![15] = { x: 0.01, y: 0.99, z: 0, visibility: 0.9 };
    const scrub = scrubInsaneSkeletons(fs, W, H);
    const r = trackReliability(scrub.frames, W, H, scrub);
    expect(r.level).toBe("low");
    expect(r.reasons.join(" ")).toMatch(/impossible/);
  });

  it("is low when the body is mostly horizontal (ground work, lying down, rotated video)", () => {
    const lying = frames(40, (i) => ({ cx: 0.4 + (i % 8) * 0.01 })).map((f) => ({
      ...f,
      // rotate the whole figure 90 degrees about its hip centre (image coordinates, y down)
      landmarks: f.landmarks!.map((p) => ({ ...p, x: 0.5 + (p.y - 0.55) * (H / W), y: 0.55 - (p.x - 0.5) * (W / H) })),
    }));
    const r = rel(lying);
    expect(r.level).toBe("low");
    expect(r.reasons.join(" ")).toMatch(/horizontal/);
    expect(r.tiltedShare).toBeGreaterThan(0.9);
  });

  it("an upright clip is not tilted", () => {
    expect(rel(frames(40, () => ({}))).tiltedShare).toBe(0);
  });

  it("one-off glitches in an otherwise good clip do not fail it", () => {
    const fs = frames(40, (i) => ({ cx: 0.4 + (i % 8) * 0.01 }));
    fs[10]!.landmarks![15] = { x: 0.01, y: 0.99, z: 0, visibility: 0.9 };
    const scrub = scrubInsaneSkeletons(fs, W, H);
    expect(trackReliability(scrub.frames, W, H, scrub).level).toBe("good");
  });
});

describe("maskOffFrame", () => {
  it("hides joints placed outside the picture and leaves the rest untouched", () => {
    const lm = figure();
    lm[28] = { ...lm[28]!, y: 1.2 }; // right ankle below the frame
    lm[16] = { ...lm[16]!, x: -0.1 }; // right wrist off the left edge
    const out = maskOffFrame(lm);
    expect(out[28]!.visibility).toBe(0);
    expect(out[16]!.visibility).toBe(0);
    expect(out[15]).toBe(lm[15]); // untouched joints are the same objects
    expect(lm[28]!.visibility).toBeGreaterThan(0); // input not mutated
  });

  it("returns the very same array when nothing is off-frame", () => {
    const lm = figure();
    expect(maskOffFrame(lm)).toBe(lm);
  });

  it("is applied by the scrub, so an athlete cut off by the edge keeps a body without guessed legs", () => {
    const f = frames(4, () => ({}));
    f[1]!.landmarks![27] = { ...f[1]!.landmarks![27]!, y: 1.15 };
    const r = scrubInsaneSkeletons(f, W, H);
    expect(r.dropped).toBe(0);
    expect(r.frames[1]!.landmarks![27]!.visibility).toBe(0);
    expect(r.frames[0]!.landmarks).toBe(f[0]!.landmarks);
  });
});
