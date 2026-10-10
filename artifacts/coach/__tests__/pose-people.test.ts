import { describe, expect, it } from "vitest";
import {
  defaultAthleteIndex,
  detectTwoPeople,
  splitAthlete,
  trackPeople,
  type RawPoseFrame,
} from "../src/lib/pose-people";
import type { Landmark, PoseFrame } from "../src/lib/pose";
import { figure, type FigureOpts } from "./pose-fixtures";

const W = 1280;
const H = 720;

type Spec = { a?: FigureOpts | null; b?: FigureOpts | null; extra?: FigureOpts | null; flip?: boolean };

/** Raw per-frame detections from `make(i)`; `flip` reverses the detection order (MediaPipe order is arbitrary). */
function raw(n: number, make: (i: number) => Spec, dt = 0.25): RawPoseFrame[] {
  return Array.from({ length: n }, (_, i) => {
    const s = make(i);
    const poses: Landmark[][] = [];
    for (const o of [s.a, s.b, s.extra]) if (o) poses.push(figure(o));
    if (s.flip) poses.reverse();
    return { timestamp: i * dt, poses };
  });
}

const hipCx = (f: PoseFrame) => (f.landmarks ? (f.landmarks[23]!.x + f.landmarks[24]!.x) / 2 : null);

describe("trackPeople: identity across frames", () => {
  it("keeps two separate fighters apart even when detection order flips every frame", () => {
    const r = raw(20, (i) => ({
      a: { cx: 0.3, hipY: 0.45, scale: 1 },
      b: { cx: 0.7, hipY: 0.45, scale: 0.9 },
      flip: i % 2 === 1,
    }));
    const tracks = trackPeople(r, W, H);
    expect(tracks).toHaveLength(2);
    for (const tr of tracks) {
      const xs = tr.map(hipCx);
      expect(xs.every((x) => x != null)).toBe(true);
      const left = xs.every((x) => x! < 0.5);
      const right = xs.every((x) => x! > 0.5);
      expect(left || right).toBe(true);
    }
  });

  it("does not swap people who walk through each other", () => {
    // A (bigger) goes left->right, B (smaller) right->left, crossing at the middle.
    const aX = (i: number) => 0.15 + i * 0.035;
    const bX = (i: number) => 0.85 - i * 0.035;
    const r = raw(21, (i) => ({
      a: { cx: aX(i), hipY: 0.45, scale: 1.0 },
      b: { cx: bX(i), hipY: 0.45, scale: 0.85 },
      flip: i % 3 === 0,
    }));
    const tracks = trackPeople(r, W, H);
    expect(tracks).toHaveLength(2);
    let wrong = 0;
    let present = 0;
    tracks[0]!.forEach((f, i) => {
      const x = hipCx(f);
      if (x == null) return;
      present++;
      if (Math.abs(x - aX(i)) > Math.abs(x - bX(i)) + 1e-6) wrong++;
    });
    tracks[1]!.forEach((f, i) => {
      const x = hipCx(f);
      if (x == null) return;
      present++;
      if (Math.abs(x - bX(i)) > Math.abs(x - aX(i)) + 1e-6) wrong++;
    });
    expect(present).toBeGreaterThan(30);
    expect(wrong).toBe(0);
  });

  it("carries a person through a few missing frames without making a third person", () => {
    const r = raw(20, (i) => ({
      a: { cx: 0.3, hipY: 0.45 },
      b: i >= 6 && i <= 9 ? null : { cx: 0.7 - i * 0.002, hipY: 0.45 },
    }));
    const tracks = trackPeople(r, W, H);
    expect(tracks).toHaveLength(2);
    const second = tracks[1]!;
    expect(second.filter((f) => f.landmarks).length).toBe(16);
    // the gap is a gap (null), not interpolated
    for (let i = 6; i <= 9; i++) expect(second[i]!.landmarks).toBeNull();
    // and it's the same person on both sides of the gap
    expect(hipCx(second[5]!)!).toBeGreaterThan(0.6);
    expect(hipCx(second[10]!)!).toBeGreaterThan(0.6);
  });

  it("a person who stays hidden does not get replaced by the other person's detections", () => {
    const r = raw(12, (i) => ({
      a: { cx: 0.3 + (i % 2) * 0.01, hipY: 0.45 },
      b: i < 4 ? { cx: 0.7, hipY: 0.45 } : null,
    }));
    const tracks = trackPeople(r, W, H);
    expect(tracks[0]!.filter((f) => f.landmarks)).toHaveLength(12);
    expect(tracks[1]!.filter((f) => f.landmarks)).toHaveLength(4);
    expect(tracks[0]!.every((f) => hipCx(f)! < 0.5)).toBe(true);
  });

  it("collapses a duplicate detection of the same body to one person", () => {
    const r = raw(12, () => ({ a: { cx: 0.5 }, b: { cx: 0.501, scale: 1.01 } }));
    const tracks = trackPeople(r, W, H);
    expect(tracks).toHaveLength(1);
    expect(tracks[0]!.filter((f) => f.landmarks)).toHaveLength(12);
    expect(detectTwoPeople(tracks, W, H)).toBeNull();
  });

  it("ignores a third body while two people are being followed", () => {
    const r = raw(10, () => ({
      a: { cx: 0.2, hipY: 0.45 },
      b: { cx: 0.5, hipY: 0.45 },
      extra: { cx: 0.85, hipY: 0.45 },
    }));
    expect(trackPeople(r, W, H)).toHaveLength(2);
  });

  it("single person: one track, same landmarks as the input, no picker", () => {
    const r = raw(10, (i) => ({ a: { cx: 0.5, handsUp: i * 0.1 } }));
    const tracks = trackPeople(r, W, H);
    expect(tracks).toHaveLength(1);
    tracks[0]!.forEach((f, i) => expect(f.landmarks).toBe(r[i]!.poses[0]));
    expect(detectTwoPeople(tracks, W, H)).toBeNull();
  });

  it("no detections at all gives no tracks", () => {
    expect(trackPeople(raw(5, () => ({})), W, H)).toEqual([]);
  });
});

describe("picker: when to ask and what to suggest", () => {
  const twoPeople = (n = 16) =>
    trackPeople(
      raw(n, () => ({
        a: { cx: 0.3, hipY: 0.45, scale: 1 },
        b: { cx: 0.7, hipY: 0.45, scale: 0.95 },
      })),
      W,
      H,
    );

  it("asks when a second person shares enough of the clip, and offers a frame with both", () => {
    const tracks = twoPeople();
    const two = detectTwoPeople(tracks, W, H);
    expect(two).not.toBeNull();
    expect(tracks[0]![two!.pickerFrame]!.landmarks).not.toBeNull();
    expect(tracks[1]![two!.pickerFrame]!.landmarks).not.toBeNull();
  });

  it("does not ask for a fleeting second person (too few frames)", () => {
    const tracks = trackPeople(
      raw(20, (i) => ({ a: { cx: 0.3 }, b: i < 4 ? { cx: 0.7 } : null })),
      W,
      H,
    );
    expect(detectTwoPeople(tracks, W, H)).toBeNull();
  });

  it("does not ask for a tiny background person", () => {
    const tracks = trackPeople(
      raw(20, () => ({ a: { cx: 0.3, hipY: 0.45 }, b: { cx: 0.8, hipY: 0.3, scale: 0.25 } })),
      W,
      H,
    );
    expect(tracks).toHaveLength(2);
    expect(detectTwoPeople(tracks, W, H)).toBeNull();
  });

  it("does not ask when the two are never in the same frame", () => {
    const tracks = trackPeople(
      raw(20, (i) => (i < 10 ? { a: { cx: 0.3 } } : { b: { cx: 0.7 } })),
      W,
      H,
    );
    expect(detectTwoPeople(tracks, W, H)).toBeNull();
  });

  it("default choice: the person with the most pose frames is blue", () => {
    const tracks = trackPeople(
      raw(20, (i) => ({
        a: { cx: 0.3, hipY: 0.45, scale: 1.0 },
        // bigger on screen but only in 12 of 20 frames
        b: i % 5 < 3 ? { cx: 0.7, hipY: 0.45, scale: 1.3 } : null,
      })),
      W,
      H,
    );
    expect(defaultAthleteIndex(tracks, W, H)).toBe(0);
    expect(tracks[0]!.filter((f) => f.landmarks)).toHaveLength(20);
  });

  it("default choice: equal frame counts -> the bigger person", () => {
    const tracks: PoseFrame[][] = [
      Array.from({ length: 8 }, (_, i) => ({ timestamp: i / 4, landmarks: figure({ cx: 0.3, scale: 0.8 }) })),
      Array.from({ length: 8 }, (_, i) => ({ timestamp: i / 4, landmarks: figure({ cx: 0.7, scale: 1.2 }) })),
    ];
    expect(defaultAthleteIndex(tracks, W, H)).toBe(1);
    const t = trackPeople(
      raw(8, () => ({ a: { cx: 0.3, hipY: 0.45, scale: 0.8 }, b: { cx: 0.7, hipY: 0.45, scale: 1.2 } })),
      W,
      H,
    );
    expect(hipCx(t[0]![0]!)!).toBeGreaterThan(0.5);
  });

  it("splitAthlete: the chosen track is the athlete, the other is the opponent", () => {
    const tracks = twoPeople();
    const s0 = splitAthlete(tracks, 0);
    const s1 = splitAthlete(tracks, 1);
    expect(s0.athlete).toBe(tracks[0]);
    expect(s0.opponent).toBe(tracks[1]);
    expect(s1.athlete).toBe(tracks[1]);
    expect(s1.opponent).toBe(tracks[0]);
    expect(splitAthlete([tracks[0]!], 0).opponent).toBeNull();
  });
});
