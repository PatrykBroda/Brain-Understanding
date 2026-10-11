import { describe, expect, it } from "vitest";
import {
  detectTwoPeople,
  appDistance,
  gateExtras,
  kitScrub,
  pickerStill,
  poseQuality,
  scorePairs,
  scrubTrack,
  selectFighters,
  stitchTracks,
  trackPeople,
  type RawPoseFrame,
} from "../src/lib/pose-people";
import type { Landmark, PoseFrame } from "../src/lib/pose";
import { figure, type FigureOpts } from "./pose-fixtures";

const W = 1280;
const H = 720;

type Scene = (i: number) => (FigureOpts | null | { lm: Landmark[] })[];

function raw(n: number, scene: Scene, dt = 0.25, flip = false): RawPoseFrame[] {
  return Array.from({ length: n }, (_, i) => {
    const poses = scene(i)
      .filter((o): o is FigureOpts | { lm: Landmark[] } => !!o)
      .map((o) => ("lm" in o ? o.lm : figure(o)));
    if (flip && i % 2) poses.reverse();
    return { timestamp: i * dt, poses };
  });
}

// An active fighter: guard hands going up and down, stance opening and closing, rocking forward and back.
const fighter = (i: number, cx: number, facing: 1 | -1, phase = 0, extra: FigureOpts = {}): FigureOpts => ({
  cx: cx + 0.015 * Math.sin(i * 0.8 + phase),
  hipY: 0.5,
  facing,
  handsUp: 0.3 + 0.9 * Math.abs(Math.sin(i * 0.9 + phase)),
  stance: 1.4 + 0.8 * Math.abs(Math.sin(i * 1.3 + phase)),
  ...extra,
});
// A referee: upright, hands hanging, hardly moving.
const referee = (cx: number, extra: FigureOpts = {}): FigureOpts => ({
  cx,
  hipY: 0.5,
  facing: -1,
  handsUp: -3,
  stance: 0.8,
  ...extra,
});

const hipX = (f: PoseFrame) => (f.landmarks ? (f.landmarks[23]!.x + f.landmarks[24]!.x) / 2 : null);
const present = (t: PoseFrame[]) => t.filter((f) => f.landmarks).length;

describe("poseQuality", () => {
  it("accepts a complete skeleton", () => {
    const q = poseQuality(figure({}), W, H);
    expect(q.ok).toBe(true);
    expect(q.score).toBeGreaterThan(0.6);
  });

  it("rejects a skeleton whose torso is not visible (head and hands only)", () => {
    const lm = figure({}).map((p, i) => (i >= 11 && ![15, 16].includes(i) ? { ...p, visibility: 0.1 } : p));
    const q = poseQuality(lm, W, H);
    expect(q.ok).toBe(false);
    expect(q.reason).toBe("no-torso");
  });

  it("rejects a half-body fragment (hips but too few landmarks)", () => {
    const keep = new Set([11, 12, 23, 24, 13, 14]);
    const lm = figure({}).map((p, i) => (keep.has(i) ? p : { ...p, visibility: 0.1 }));
    expect(poseQuality(lm, W, H).ok).toBe(false);
  });

  it("rejects a collapsed / squashed skeleton (legs folded into the hips)", () => {
    const lm = figure({ handsUp: 0 }).map((p, i) => (i >= 25 ? { ...p, x: 0.5, y: 0.5 } : p));
    const q = poseQuality(lm, W, H);
    expect(q.ok).toBe(false);
    expect(q.reason).toBe("collapsed");
  });

  it("rejects a tiny far-away person", () => {
    expect(poseQuality(figure({ scale: 0.1 }), W, H).ok).toBe(false);
  });
});

describe("selectFighters: two fighters, referee/coach/crowd dropped", () => {
  it("keeps the two fighters when a referee is on screen more often than one of them", () => {
    const r = raw(40, (i) => [
      fighter(i, 0.28, 1),
      i % 10 < 3 ? null : fighter(i, 0.68, -1, 1), // fighter B often out of detection
      referee(0.48),
    ]);
    const tracks = selectFighters(r, W, H);
    expect(tracks).toHaveLength(2);
    // nobody static in the middle
    for (const t of tracks) {
      const xs = t.map(hipX).filter((x): x is number => x != null);
      expect(xs.every((x) => Math.abs(x - 0.48) > 0.12)).toBe(true);
    }
    expect(present(tracks[0]!)).toBeGreaterThanOrEqual(present(tracks[1]!));
  });

  it("does not pick the referee as 'you' even when he is biggest and on screen the whole time", () => {
    const r = raw(40, (i) => [
      fighter(i, 0.25, 1, 0, { scale: 0.8 }),
      fighter(i, 0.62, -1, 1, { scale: 0.8 }),
      referee(0.44, { scale: 1.15, hipY: 0.55 }),
    ]);
    const tracks = selectFighters(r, W, H);
    expect(tracks).toHaveLength(2);
    const you = tracks[0]!;
    expect(you.every((f) => f.landmarks && Math.abs(hipX(f)! - 0.44) > 0.1)).toBe(true);
  });

  it("drops a coach holding pads at the edge, a crowd member and keeps the active pair", () => {
    const r = raw(36, (i) => [
      fighter(i, 0.3, 1),
      fighter(i, 0.6, -1, 2),
      referee(0.93, { scale: 1.1 }),
      referee(0.06, { scale: 0.5, hipY: 0.4 }),
    ]);
    const tracks = selectFighters(r, W, H);
    expect(tracks).toHaveLength(2);
    const all = tracks.flatMap((t) => t.map(hipX)).filter((x): x is number => x != null);
    expect(all.every((x) => x > 0.2 && x < 0.75)).toBe(true);
  });

  it("never swaps fighters through a clinch, with the referee beside them and detection order flipping", () => {
    // A goes right, B goes left, they meet in the middle, clinch for a few frames, then part again.
    const aX = (i: number) => (i < 12 ? 0.25 + i * 0.02 : i < 20 ? 0.49 : 0.49 - (i - 20) * 0.015);
    const bX = (i: number) => (i < 12 ? 0.75 - i * 0.02 : i < 20 ? 0.53 : 0.53 + (i - 20) * 0.015);
    const r = raw(
      32,
      (i) => [fighter(i, aX(i), 1, 0), fighter(i, bX(i), -1, 1.3), referee(0.15, { scale: 0.95 })],
      0.25,
      true,
    );
    const tracks = selectFighters(r, W, H);
    expect(tracks).toHaveLength(2);
    // Each track is one person for the whole clip: it starts on one side and its path never jumps to the other fighter.
    for (const t of tracks) {
      const xs = t.map(hipX).filter((x): x is number => x != null);
      for (let k = 1; k < xs.length; k++) expect(Math.abs(xs[k]! - xs[k - 1]!)).toBeLessThan(0.12);
    }
    const starts = tracks.map((t) => hipX(t.find((f) => f.landmarks)!)!).sort();
    expect(starts[0]!).toBeLessThan(0.35);
    expect(starts[1]!).toBeGreaterThan(0.65);
  });

  it("stitches a fighter who is lost for a few seconds and found again into one track", () => {
    // B vanishes for 12 frames (3s) - long enough that the tracker may start a fresh track on return.
    const r = raw(44, (i) => [fighter(i, 0.3, 1), i >= 14 && i < 26 ? null : fighter(i, 0.66, -1, 1), referee(0.92)]);
    const tracks = selectFighters(r, W, H);
    expect(tracks).toHaveLength(2);
    const counts = tracks.map(present).sort((a, b) => a - b);
    expect(counts[0]!).toBeGreaterThanOrEqual(30); // B kept as ONE track across the gap
  });

  it("drops a partial skeleton frame from a fighter's track", () => {
    const partial = (o: FigureOpts) => ({
      lm: figure(o).map((p, i) => (i >= 23 ? { ...p, visibility: 0.1 } : p)), // lower body lost
    });
    const r = raw(30, (i) => [
      i >= 10 && i < 14 ? partial(fighter(i, 0.3, 1)) : fighter(i, 0.3, 1),
      fighter(i, 0.66, -1, 1),
    ]);
    const tracks = selectFighters(r, W, H);
    expect(tracks).toHaveLength(2);
    const a = tracks.find((t) => hipX(t.find((f) => f.landmarks)!)! < 0.5)!;
    for (let i = 10; i < 14; i++) expect(a[i]!.landmarks).toBeNull();
    expect(present(a)).toBe(26);
  });

  it("does not throw away a track that is only ever partial (hard footage keeps what it has)", () => {
    const lowerLost = (o: FigureOpts) => ({ lm: figure(o).map((p, i) => (i >= 25 ? { ...p, visibility: 0.1 } : p)) });
    const r = raw(30, (i) => [lowerLost(fighter(i, 0.3, 1))]);
    expect(present(selectFighters(r, W, H)[0]!)).toBeGreaterThan(20);
  });

  it("a half-body fragment never starts a second person", () => {
    const frag = (o: FigureOpts) => ({
      lm: figure(o).map((p, i) => (![0, 11, 12, 13, 14, 15, 16].includes(i) ? { ...p, visibility: 0.1 } : p)),
    });
    const r = raw(30, (i) => [fighter(i, 0.3, 1), frag(fighter(i, 0.7, -1))]);
    const tracks = trackPeople(r, W, H, { maxTracks: 4 });
    expect(tracks).toHaveLength(1);
  });

  it("single person: identical to the plain tracker, no extra person invented", () => {
    const r = raw(30, (i) => [fighter(i, 0.4, 1)]);
    const plain = trackPeople(r, W, H);
    const sel = selectFighters(r, W, H);
    expect(sel).toHaveLength(1);
    expect(sel[0]!.map((f) => f.landmarks)).toEqual(plain[0]!.map((f) => f.landmarks));
  });

  it("no pose anywhere: no tracks (caller keeps the empty timeline)", () => {
    expect(selectFighters(raw(10, () => []), W, H)).toEqual([]);
  });
});

describe("scorePairs", () => {
  it("ranks the engaged, active, guard-up pair above any pair containing a static bystander", () => {
    const r = raw(32, (i) => [fighter(i, 0.3, 1), fighter(i, 0.62, -1, 1), referee(0.46)]);
    const tracks = trackPeople(r, W, H, { maxTracks: 4 });
    expect(tracks).toHaveLength(3);
    const best = scorePairs(tracks, W, H)[0]!;
    const idx = [best.i, best.j].sort();
    const stat = (t: PoseFrame[]) => hipX(t.find((f) => f.landmarks)!)!;
    expect(stat(tracks[idx[0]!]!)).not.toBeCloseTo(0.46, 1);
    expect(stat(tracks[idx[1]!]!)).not.toBeCloseTo(0.46, 1);
  });
});

describe("stitchTracks", () => {
  const mk = (xs: (number | null)[], t0 = 0): PoseFrame[] =>
    xs.map((x, i) => ({ timestamp: t0 + i * 0.25, landmarks: x == null ? null : figure({ cx: x }) }));

  it("merges a fragment that starts where another ended and never overlaps it", () => {
    const a = mk([0.3, 0.3, 0.31, null, null, null, null, null, null, null]);
    const b = mk([null, null, null, null, null, 0.32, 0.32, 0.33, 0.33, 0.34]);
    const out = stitchTracks([a, b], W, H);
    expect(out).toHaveLength(1);
    expect(present(out[0]!)).toBe(8);
  });

  it("does not merge two people who are in the same frame", () => {
    const a = mk([0.3, 0.3, 0.3, 0.3]);
    const b = mk([null, 0.34, 0.34, 0.34]);
    expect(stitchTracks([a, b], W, H)).toHaveLength(2);
  });

  it("does not merge a person who reappears on the other side of the ring", () => {
    const a = mk([0.2, 0.2, 0.2, null, null, null, null]);
    const b = mk([null, null, null, null, 0.85, 0.85, 0.85]);
    expect(stitchTracks([a, b], W, H)).toHaveLength(2);
  });
});

describe("scrubTrack", () => {
  it("nulls only the frames with partial skeletons", () => {
    const good = figure({});
    const bad = figure({}).map((p, i) => (i >= 23 ? { ...p, visibility: 0 } : p));
    const out = scrubTrack(
      [
        { timestamp: 0, landmarks: good },
        { timestamp: 0.25, landmarks: bad },
        { timestamp: 0.5, landmarks: null },
      ],
      W,
      H,
    );
    expect(out.map((f) => !!f.landmarks)).toEqual([true, false, false]);
  });
});

describe("pickerStill + detectTwoPeople", () => {
  const frames = (n: number, make: (i: number) => FigureOpts | { lm: Landmark[] } | null): PoseFrame[] =>
    Array.from({ length: n }, (_, i) => {
      const o = make(i);
      return { timestamp: i * 0.25, landmarks: o == null ? null : "lm" in o ? o.lm : figure(o) };
    });

  it("picks a frame where both fighters are complete and apart, not one with a squashed skeleton or a clinch", () => {
    const squashed = (o: FigureOpts) => ({ lm: figure({ handsUp: 0, ...o }).map((p, i) => (i >= 25 ? { ...p, x: o.cx ?? 0.5, y: 0.5 } : p)) });
    const a = frames(10, (i) => ({ cx: i === 2 ? 0.45 : 0.3, hipY: 0.5 }));
    const b = frames(10, (i) =>
      i === 5 ? squashed({ cx: 0.7, hipY: 0.5 }) : { cx: i === 2 ? 0.52 : 0.7, hipY: 0.5, facing: -1 },
    );
    const s = pickerStill(a, b, W, H)!;
    expect(s.clean).toBe(true);
    expect([0, 1, 3, 4, 6, 7, 8, 9]).toContain(s.index);
  });

  it("prefers the higher-confidence pair", () => {
    const a = frames(6, (i) => ({ cx: 0.3, hipY: 0.5, vis: i === 4 ? 0.98 : 0.7 }));
    const b = frames(6, (i) => ({ cx: 0.7, hipY: 0.5, facing: -1, vis: i === 4 ? 0.98 : 0.7 }));
    expect(pickerStill(a, b, W, H)!.index).toBe(4);
  });

  it("does not choose a frame where one fighter is jammed against the frame edge", () => {
    const a = frames(8, (i) => ({ cx: i === 3 ? 0.05 : 0.3, hipY: 0.5, vis: i === 3 ? 0.99 : 0.8 }));
    const b = frames(8, (i) => ({ cx: 0.7, hipY: 0.5, facing: -1, vis: i === 3 ? 0.99 : 0.8 }));
    const s = pickerStill(a, b, W, H)!;
    expect(s.index).not.toBe(3);
    expect(s.clean).toBe(true);
  });

  it("does not call two very different sizes a clean pair (far bystander / folded skeleton)", () => {
    const a = frames(8, () => ({ cx: 0.3, hipY: 0.5 }));
    const b = frames(8, () => ({ cx: 0.7, hipY: 0.5, scale: 0.3, facing: -1 }));
    expect(pickerStill(a, b, W, H)!.clean).toBe(false);
    expect(detectTwoPeople([a, b], W, H)).toBeNull();
  });

  it("no picker when no frame has two complete skeletons (never choose between garbage)", () => {
    const sq = (cx: number) => ({ lm: figure({ cx, handsUp: 0 }).map((p, i) => (i >= 25 ? { ...p, x: cx, y: 0.5 } : p)) });
    const a = frames(14, () => sq(0.3));
    const b = frames(14, () => sq(0.7));
    expect(detectTwoPeople([a, b], W, H)).toBeNull();
  });

  it("asks (with a clean still) when both fighters are tracked well", () => {
    const a = frames(14, (i) => fighter(i, 0.3, 1));
    const b = frames(14, (i) => fighter(i, 0.7, -1, 1));
    const two = detectTwoPeople([a, b], W, H);
    expect(two?.clean).toBe(true);
  });
});

describe("gateExtras: the look-again pass is only trusted where two real bodies were seen", () => {
  // `primary` = how many poses came from the normal pass; the last pose from the look-again pass.
  const withExtra = (n: number, primaryTwo: (i: number) => boolean, extraOpts: FigureOpts): RawPoseFrame[] =>
    Array.from({ length: n }, (_, i) => {
      const poses = [figure(fighter(i, 0.3, 1))];
      if (primaryTwo(i)) poses.push(figure(fighter(i, 0.7, -1, 1)));
      const primary = poses.length;
      poses.push(figure(extraOpts));
      return { timestamp: i * 0.25, poses, primary };
    });

  it("drops look-again bodies in a one-person clip (a heavy bag that looks like a person)", () => {
    const r = withExtra(30, () => false, { cx: 0.7, hipY: 0.5 });
    expect(gateExtras(r, W, H).every((f) => f.poses.length === 1)).toBe(true);
    // ...so a one-person clip comes out as one person (no picker)
    expect(selectFighters(r, W, H)).toHaveLength(1);
  });

  it("keeps complete look-again bodies once the normal pass has seen two people together", () => {
    const r = withExtra(30, (i) => i % 5 === 0, { cx: 0.85, hipY: 0.5, facing: -1 });
    expect(gateExtras(r, W, H).every((f) => f.poses.length === (f.primary ?? 0) + 1)).toBe(true);
  });

  it("still drops look-again bodies that are partial skeletons", () => {
    const r = withExtra(30, (i) => i % 5 === 0, { cx: 0.85, hipY: 0.5 });
    r.forEach((f) => {
      f.poses[f.poses.length - 1] = figure({ cx: 0.85, hipY: 0.5 }).map((p, i) => (i >= 23 ? { ...p, visibility: 0.1 } : p));
    });
    expect(gateExtras(r, W, H).every((f) => f.poses.length === f.primary)).toBe(true);
  });

  it("frames without a primary count are untouched", () => {
    const r = raw(10, (i) => [fighter(i, 0.3, 1), fighter(i, 0.7, -1, 1)]);
    expect(gateExtras(r, W, H)).toBe(r);
  });
});

describe("clothing colour keeps identities apart", () => {
  const RED = [200, 40, 40, 190, 50, 50];
  const NAVY = [20, 25, 90, 22, 28, 100];
  const BLACK = [20, 30, 38, 24, 30, 36]; // a referee's suit: close to navy in plain RGB, different in hue
  const WHITE = [220, 222, 225, 215, 218, 220];

  it("tells a navy gi from a black suit although both are dark", () => {
    expect(appDistance(NAVY, BLACK)!).toBeGreaterThan(70);
    expect(appDistance(NAVY, [24, 30, 100, 20, 26, 92])!).toBeLessThan(20);
    // a lit and a shaded white gi are the same kit
    expect(appDistance(WHITE, [150, 152, 156, 145, 148, 150])!).toBeLessThan(60);
  });

  it("keeps two fighters apart when they meet and bounce straight back (constant-velocity guess would swap them)", () => {
    // A: 0.25 -> 0.5 -> 0.25 ; B: 0.75 -> 0.5 -> 0.75, same speeds, meeting at the same spot.
    const pos = (i: number) => (i <= 10 ? 0.25 + i * 0.025 : 0.5 - (i - 10) * 0.025);
    const frames = Array.from({ length: 21 }, (_, i) => {
      const a = figure({ cx: pos(i), hipY: 0.5, facing: 1 });
      const b = figure({ cx: 1 - pos(i) + (i === 10 ? 0.02 : 0), hipY: 0.5, facing: -1 });
      return { timestamp: i * 0.25, poses: [a, b], app: [RED, NAVY] as (number[] | null)[] };
    });
    const tracks = trackPeople(frames, W, H, { maxTracks: 2 });
    expect(tracks).toHaveLength(2);
    for (const t of tracks) {
      const xs = t.map(hipX).filter((x): x is number => x != null);
      for (let k = 1; k < xs.length; k++) expect(Math.abs(xs[k]! - xs[k - 1]!)).toBeLessThan(0.06);
    }
  });

  it("a fighter in another kit never takes over a track that went quiet", () => {
    // fighter A (red) is lost from frame 8; a referee (black) walks up to where A was.
    const frames = Array.from({ length: 30 }, (_, i) => {
      const poses = [figure({ cx: 0.7, hipY: 0.5, facing: -1 })];
      const app: (number[] | null)[] = [NAVY];
      if (i < 8) {
        poses.push(figure({ cx: 0.3, hipY: 0.5 }));
        app.push(RED);
      } else if (i >= 14) {
        poses.push(figure({ cx: 0.32, hipY: 0.5, handsUp: -3 }));
        app.push(BLACK);
      }
      return { timestamp: i * 0.25, poses, app };
    });
    const tracks = trackPeople(frames, W, H, { maxTracks: 2 });
    const red = tracks.find((t) => t.some((f) => f.landmarks && hipX(f)! < 0.5))!;
    expect(red.filter((f) => f.landmarks).length).toBeLessThanOrEqual(8);
  });

  it("kitScrub drops the referee frames from a navy fighter's track and keeps the rest", () => {
    const lm = figure({});
    const ref = figure({ handsUp: -3 });
    const tr = (n: number, bad: number[]): PoseFrame[] =>
      Array.from({ length: n }, (_, i) => ({ timestamp: i * 0.25, landmarks: bad.includes(i) ? ref : lm }));
    const appOf = (l: Landmark[]) => (l === ref ? BLACK : l === lm ? NAVY : null);
    const [a] = kitScrub([tr(12, [4, 5])], appOf);
    expect(a!.filter((f) => f.landmarks)).toHaveLength(10);
    expect(a![4]!.landmarks).toBeNull();
  });

  it("kitScrub never empties a track", () => {
    const lm = figure({});
    const ref = figure({ handsUp: -3 });
    const frames = Array.from({ length: 10 }, (_, i) => ({ timestamp: i * 0.25, landmarks: i < 6 ? ref : lm }));
    const out = kitScrub([frames], (l) => (l === ref ? BLACK : NAVY));
    expect(out[0]!.filter((f) => f.landmarks).length).toBeGreaterThanOrEqual(5);
  });
});
