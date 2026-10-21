import { describe, expect, it } from "vitest";
import {
  autoSelectionPoint,
  bodiesNear,
  matchTapToTrack,
  nearestSampleIndex,
  pickerStartTime,
  splitAthlete,
} from "../src/lib/pose-people";
import { frames } from "./pose-fixtures";

const W = 1280;
const H = 720;

// Two fighters: A on the left, B on the right, both present every sample except where noted.
const A = frames(20, () => ({ cx: 0.3, hipY: 0.5, scale: 0.9 }));
const B = frames(20, (i) => (i >= 10 && i <= 13 ? null : { cx: 0.72, hipY: 0.5, scale: 0.9 }));
const tracks = [A, B];

describe("nearestSampleIndex", () => {
  it("finds the closest sampled time", () => {
    expect(nearestSampleIndex(A, 0)).toBe(0);
    expect(nearestSampleIndex(A, 1.1)).toBe(4);
    expect(nearestSampleIndex(A, 1.13)).toBe(5);
    expect(nearestSampleIndex(A, 99)).toBe(19);
    expect(nearestSampleIndex([], 1)).toBe(-1);
  });
});

describe("matchTapToTrack", () => {
  it("picks the body under the tap", () => {
    const body = bodiesNear(tracks, 1, W, H)[1]!;
    const m = matchTapToTrack(tracks, { timeSec: 1.02, x: body.cx, y: (body.box.y0 + body.cy) / 2 }, W, H);
    expect(m).toMatchObject({ index: 1, method: "tap", trackMatched: true, frameIndex: 4 });
    const left = matchTapToTrack(tracks, { timeSec: 1.02, x: 0.3, y: 0.45 }, W, H);
    expect(left).toMatchObject({ index: 0, method: "tap", trackMatched: true });
  });

  it("works whatever order the tracks come in", () => {
    const m = matchTapToTrack([B, A], { timeSec: 1, x: 0.3, y: 0.45 }, W, H);
    expect(m.index).toBe(1);
  });

  it("when overlapping boxes both contain the tap, takes the closer centre", () => {
    const P = frames(8, () => ({ cx: 0.45, hipY: 0.5 }));
    const Q = frames(8, () => ({ cx: 0.55, hipY: 0.5 }));
    expect(matchTapToTrack([P, Q], { timeSec: 0.5, x: 0.56, y: 0.5 }, W, H).index).toBe(1);
    expect(matchTapToTrack([P, Q], { timeSec: 0.5, x: 0.44, y: 0.5 }, W, H).index).toBe(0);
  });

  it("a tap on empty floor falls back to the person on that side", () => {
    const m = matchTapToTrack(tracks, { timeSec: 1, x: 0.98, y: 0.05 }, W, H);
    expect(m).toMatchObject({ index: 1, method: "side", trackMatched: true });
    const l = matchTapToTrack(tracks, { timeSec: 1, x: 0.02, y: 0.05 }, W, H);
    expect(l).toMatchObject({ index: 0, method: "side", trackMatched: true });
  });

  it("only one body seen at that moment, tap on the far side: the other person of a pair", () => {
    // B is missing at 2.5..3.25s; tapping empty space on the right means B.
    const m = matchTapToTrack(tracks, { timeSec: 2.9, x: 0.95, y: 0.1 }, W, H);
    expect(m).toMatchObject({ index: 1, method: "side", trackMatched: true });
  });

  it("nobody tracked near the tap: no match, flagged unverified", () => {
    const empty = [frames(10, () => null), frames(10, () => null)];
    const m = matchTapToTrack(empty, { timeSec: 1, x: 0.4, y: 0.4 }, W, H);
    expect(m.index).toBeNull();
    expect(m.trackMatched).toBe(false);
  });

  it("ignores poses too far in time from the tap", () => {
    const sparse = [frames(10, (i) => (i === 0 ? { cx: 0.3 } : null)), frames(10, (i) => (i === 0 ? { cx: 0.7 } : null))];
    expect(matchTapToTrack(sparse, { timeSec: 2, x: 0.3, y: 0.5 }, W, H).trackMatched).toBe(false);
    expect(matchTapToTrack(sparse, { timeSec: 0.2, x: 0.3, y: 0.5 }, W, H).index).toBe(0);
  });

  it("the chosen index drives splitAthlete (the measured person is the tapped one)", () => {
    const m = matchTapToTrack(tracks, { timeSec: 1, x: 0.72, y: 0.45 }, W, H);
    const split = splitAthlete(tracks, m.index!);
    expect(split.athlete).toBe(B);
    expect(split.opponent).toBe(A);
  });
});

describe("pickerStartTime / autoSelectionPoint", () => {
  it("opens on a frame with both people", () => {
    const t = pickerStartTime(tracks, W, H);
    const i = nearestSampleIndex(B, t);
    expect(A[i]!.landmarks).not.toBeNull();
    expect(B[i]!.landmarks).not.toBeNull();
  });
  it("single person: opens on their first frame; auto point is on them", () => {
    const solo = frames(6, (i) => (i < 2 ? null : { cx: 0.25, hipY: 0.5 }));
    expect(pickerStartTime([solo], W, H)).toBe(0.5);
    const p = autoSelectionPoint(solo, W, H)!;
    expect(p.x).toBeCloseTo(0.25, 2);
    expect(p.y).toBeCloseTo(0.5, 2);
    expect(autoSelectionPoint(frames(3, () => null), W, H)).toBeNull();
  });
});
