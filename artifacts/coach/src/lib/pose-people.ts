import type { Landmark, PoseFrame } from "./pose";

// ---------------------------------------------------------------------------
// Two people in one clip. MediaPipe is asked for up to 2 poses per sampled
// frame, in arbitrary order. This module keeps each PERSON's identity across
// frames (so "you" never jumps to the opponent mid-clip), decides whether the
// clip really has two people, and picks the frame + default suggestion for the
// "Which one is you?" picker. Pure and synchronous: no DOM, no MediaPipe.
// ---------------------------------------------------------------------------

export type RawPoseFrame = { timestamp: number; poses: Landmark[][] };

const VIS = 0.3;
// A track unseen for this long may be taken over by a detection that doesn't
// fit it (the person walked out of and back into frame).
const STALE_SEC = 2;
// Cost of leaving a detection unmatched; any gated match is cheaper.
const UNMATCHED_COST = 4;
// Two detections this overlapped in one frame are the same body twice.
const DUPLICATE_IOU = 0.75;
// "Meaningful share" for the picker.
export const MIN_SECOND_FRAMES = 6;
export const MIN_SECOND_SHARE = 0.2; // of all sampled frames
export const MIN_PAIRED_FRAMES = 3; // frames where both are present
export const MIN_SIZE_RATIO = 0.4; // second person's size vs the first's (ignore far background people)

type Geom = {
  cx: number;
  cy: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  size: number; // bbox height in px (floored)
  visible: number;
};

/** Pixel-space centre + box of a pose, or null if too little of it is visible. */
export function poseGeom(lm: Landmark[], w: number, h: number): Geom | null {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  let visible = 0;
  for (const p of lm) {
    if (!p || p.visibility < VIS) continue;
    visible++;
    x0 = Math.min(x0, p.x * w);
    x1 = Math.max(x1, p.x * w);
    y0 = Math.min(y0, p.y * h);
    y1 = Math.max(y1, p.y * h);
  }
  if (visible < 5) return null;
  // Centre on the hips (steadiest point of a fighter), else shoulders, else box.
  const mid = (a: number, b: number): { x: number; y: number } | null => {
    const pa = lm[a];
    const pb = lm[b];
    return pa && pb && pa.visibility >= VIS && pb.visibility >= VIS
      ? { x: ((pa.x + pb.x) / 2) * w, y: ((pa.y + pb.y) / 2) * h }
      : null;
  };
  const c = mid(23, 24) ?? mid(11, 12) ?? { x: (x0 + x1) / 2, y: (y0 + y1) / 2 };
  return { cx: c.x, cy: c.y, x0, y0, x1, y1, size: Math.max(y1 - y0, 0.08 * h), visible };
}

function iou(a: Geom, b: Geom): number {
  const iw = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
  const ih = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
  if (iw <= 0 || ih <= 0) return 0;
  const inter = iw * ih;
  const ua = (a.x1 - a.x0) * (a.y1 - a.y0) + (b.x1 - b.x0) * (b.y1 - b.y0) - inter;
  return ua > 0 ? inter / ua : 0;
}

type TrackState = {
  geom: Geom;
  lastT: number;
  vx: number; // px/s
  vy: number;
  frames: (Landmark[] | null)[];
};

function predicted(tr: TrackState, t: number): Geom {
  const dt = Math.min(Math.max(t - tr.lastT, 0), 1);
  const dx = tr.vx * dt;
  const dy = tr.vy * dt;
  const g = tr.geom;
  return { ...g, cx: g.cx + dx, cy: g.cy + dy, x0: g.x0 + dx, x1: g.x1 + dx, y0: g.y0 + dy, y1: g.y1 + dy };
}

/** Match cost of a detection to a track, or null when it can't be the same person. */
function matchCost(tr: TrackState, det: Geom, t: number): number | null {
  const dt = Math.max(t - tr.lastT, 0);
  const pred = predicted(tr, t);
  const ref = Math.max(tr.geom.size, 1);
  const d = Math.hypot(det.cx - pred.cx, det.cy - pred.cy) / ref;
  // At ~4fps a fighter moves well under one body height between samples.
  if (d > 0.8 + dt) return null;
  const sizeJump = Math.abs(Math.log(det.size / tr.geom.size));
  if (sizeJump > 1.0) return null;
  return d + (1 - iou(pred, det)) * 0.5 + sizeJump * 0.4;
}

/** Best assignment of detections to tracks (tiny problem: brute force). */
function assign(costs: (number | null)[][]): number[] {
  const nDet = costs.length;
  const nTr = nDet ? costs[0]!.length : 0;
  const best = { total: Infinity, pick: new Array<number>(nDet).fill(-1) };
  const cur = new Array<number>(nDet).fill(-1);
  const used = new Array<boolean>(nTr).fill(false);
  const rec = (i: number, total: number) => {
    if (total >= best.total) return;
    if (i === nDet) {
      best.total = total;
      best.pick = cur.slice();
      return;
    }
    cur[i] = -1;
    rec(i + 1, total + UNMATCHED_COST);
    for (let j = 0; j < nTr; j++) {
      const c = costs[i]![j];
      if (c == null || used[j]) continue;
      used[j] = true;
      cur[i] = j;
      rec(i + 1, total + c);
      used[j] = false;
    }
    cur[i] = -1;
  };
  rec(0, 0);
  return best.pick;
}

/**
 * Follow up to two people through the clip. Returns one PoseFrame[] per person,
 * each the same length as `raw` (landmarks null where that person wasn't
 * found), ordered best-first: most pose frames, then biggest on screen — so
 * index 0 is the suggested "you". Never swaps identities when people cross
 * (motion is predicted), survives a person missing for a few frames, and
 * ignores a duplicate detection of the same body.
 */
export function trackPeople(raw: RawPoseFrame[], w: number, h: number): PoseFrame[][] {
  const tracks: TrackState[] = [];
  const n = raw.length;

  raw.forEach((rf, fi) => {
    const t = rf.timestamp;
    // 1. usable detections, de-duplicated (strongest first)
    let dets = rf.poses
      .map((lm) => ({ lm, g: poseGeom(lm, w, h) }))
      .filter((d): d is { lm: Landmark[]; g: Geom } => d.g != null)
      .sort((a, b) => b.g.visible - a.g.visible);
    dets = dets.filter((d, i) => !dets.slice(0, i).some((k) => iou(k.g, d.g) > DUPLICATE_IOU));

    // 2. match to existing tracks
    const costs = dets.map((d) => tracks.map((tr) => matchCost(tr, d.g, t)));
    const pick = assign(costs);

    const taken = new Set<number>();
    const place = (tr: TrackState, d: { lm: Landmark[]; g: Geom }, keepVelocity: boolean) => {
      const dt = t - tr.lastT;
      if (keepVelocity && dt > 0.01 && dt <= 1) {
        // light smoothing so one noisy frame can't fling the prediction
        tr.vx = 0.6 * tr.vx + 0.4 * ((d.g.cx - tr.geom.cx) / dt);
        tr.vy = 0.6 * tr.vy + 0.4 * ((d.g.cy - tr.geom.cy) / dt);
      } else {
        tr.vx = 0;
        tr.vy = 0;
      }
      tr.geom = d.g;
      tr.lastT = t;
      tr.frames[fi] = d.lm;
    };

    dets.forEach((d, i) => {
      const j = pick[i]!;
      if (j >= 0) {
        taken.add(j);
        place(tracks[j]!, d, true);
      }
    });

    // 3. unmatched detections: a new person, or a returning one
    dets.forEach((d, i) => {
      if (pick[i]! >= 0) return;
      if (tracks.length < 2) {
        const tr: TrackState = { geom: d.g, lastT: t, vx: 0, vy: 0, frames: new Array(n).fill(null) };
        tr.frames[fi] = d.lm;
        tracks.push(tr);
        taken.add(tracks.length - 1);
        return;
      }
      let stalest = -1;
      let stalestAge = STALE_SEC;
      tracks.forEach((tr, j) => {
        const age = t - tr.lastT;
        if (!taken.has(j) && age > stalestAge) {
          stalest = j;
          stalestAge = age;
        }
      });
      if (stalest >= 0) {
        taken.add(stalest);
        place(tracks[stalest]!, d, false);
      }
      // else: a third body while both people are being followed — ignored.
    });
  });

  const out: PoseFrame[][] = tracks.map((tr) =>
    raw.map((rf, i) => ({ timestamp: rf.timestamp, landmarks: tr.frames[i] ?? null })),
  );
  return rankTracks(out, w, h);
}

function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = xs.slice().sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)]!;
}

export function trackStats(frames: PoseFrame[], w: number, h: number) {
  const sizes: number[] = [];
  let count = 0;
  for (const f of frames) {
    if (!f.landmarks) continue;
    count++;
    const g = poseGeom(f.landmarks, w, h);
    if (g) sizes.push(g.size);
  }
  return { count, size: median(sizes) };
}

/** Order tracks best-first: most pose frames, then biggest on screen. */
export function rankTracks(tracks: PoseFrame[][], w: number, h: number): PoseFrame[][] {
  return tracks
    .map((frames) => ({ frames, ...trackStats(frames, w, h) }))
    .sort((a, b) => b.count - a.count || b.size - a.size)
    .map((t) => t.frames);
}

/**
 * Suggested "you": the person with the most pose frames, ties broken by who is
 * biggest on screen. (trackPeople already orders by this, so it is 0 there;
 * this stays explicit for tracks from any other source.)
 */
export function defaultAthleteIndex(tracks: PoseFrame[][], w: number, h: number): number {
  let best = 0;
  let bestKey: [number, number] = [-1, -1];
  tracks.forEach((tr, i) => {
    const s = trackStats(tr, w, h);
    if (s.count > bestKey[0] || (s.count === bestKey[0] && s.size > bestKey[1])) {
      best = i;
      bestKey = [s.count, s.size];
    }
  });
  return best;
}

export type TwoPeople = {
  /** Index into the sampled frames of the best frame to show both people. */
  pickerFrame: number;
  /** Frames where both people were present. */
  pairedFrames: number;
};

/**
 * Does this clip really have two people worth asking about? Needs the second
 * person in a meaningful share of frames, at a comparable size (not a speck in
 * the background), and in the same frame as the first for a few frames — so a
 * stray detection never triggers the picker and single-person clips skip it.
 * Returns the frame to draw both skeletons on, or null.
 */
export function detectTwoPeople(tracks: PoseFrame[][], w: number, h: number): TwoPeople | null {
  if (tracks.length < 2) return null;
  const [a, b] = tracks as [PoseFrame[], PoseFrame[]];
  const sa = trackStats(a, w, h);
  const sb = trackStats(b, w, h);
  const total = a.length;
  if (!total || sb.count < MIN_SECOND_FRAMES || sb.count / total < MIN_SECOND_SHARE) return null;
  if (sa.size <= 0 || sb.size / sa.size < MIN_SIZE_RATIO) return null;

  let paired = 0;
  let bestIdx = -1;
  let bestScore = -1;
  for (let i = 0; i < total; i++) {
    const la = a[i]!.landmarks;
    const lb = b[i]!.landmarks;
    if (!la || !lb) continue;
    const ga = poseGeom(la, w, h);
    const gb = poseGeom(lb, w, h);
    if (!ga || !gb) continue;
    paired++;
    // Prefer frames where both are well visible and not stacked on each other.
    const apart = Math.hypot(ga.cx - gb.cx, ga.cy - gb.cy) / Math.max(ga.size, gb.size);
    const score = Math.min(ga.visible, gb.visible) + (apart > 0.35 ? 100 : 0);
    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }
  if (paired < MIN_PAIRED_FRAMES || bestIdx < 0) return null;
  return { pickerFrame: bestIdx, pairedFrames: paired };
}

/** Split tracks into the athlete (chosen) and the opponent (the other, if any). */
export function splitAthlete(
  tracks: PoseFrame[][],
  athleteIndex: number,
): { athlete: PoseFrame[]; opponent: PoseFrame[] | null } {
  const athlete = tracks[athleteIndex] ?? tracks[0] ?? [];
  const other = tracks.find((_, i) => i !== athleteIndex) ?? null;
  return { athlete, opponent: other };
}

/** Axis-aligned box (normalised 0..1) of a pose, for tap targets in the picker. */
export function poseBoxNorm(lm: Landmark[]): { x: number; y: number; w: number; h: number } | null {
  const g = poseGeom(lm, 1, 1);
  if (!g) return null;
  return { x: g.x0, y: g.y0, w: g.x1 - g.x0, h: g.y1 - g.y0 };
}
