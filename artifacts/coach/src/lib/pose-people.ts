import type { Landmark, PoseFrame } from "./pose";

// ---------------------------------------------------------------------------
// Two people in one clip. MediaPipe is asked for up to 2 poses per sampled
// frame, in arbitrary order. This module keeps each PERSON's identity across
// frames (so "you" never jumps to the opponent mid-clip), decides whether the
// clip really has two people, and picks the frame + default suggestion for the
// "Which one is you?" picker. Pure and synchronous: no DOM, no MediaPipe.
// ---------------------------------------------------------------------------

export type RawPoseFrame = {
  timestamp: number;
  poses: Landmark[][];
  /**
   * How many of `poses` (from the front) came from the normal detection pass; the
   * rest were found by the "blank out the found bodies and look again" pass. Absent
   * = all of them are from the normal pass.
   */
  primary?: number;
  /** Clothing-colour fingerprint per pose (aligned with `poses`; see bodyAppearance). Optional. */
  app?: (number[] | null)[];
};

const VIS = 0.3;
// Detect up to this many bodies per frame and follow them; selectFighters keeps the two fighters.
export const MAX_TRACKS = 4;
// A track unseen for this long may be taken over by a detection that doesn't
// fit it (the person walked out of and back into frame).
const STALE_SEC = 2;
// Cost of leaving a detection unmatched; any gated match is cheaper.
const UNMATCHED_COST = 4;
// Two detections this overlapped in one frame are the same body twice.
const DUPLICATE_IOU = 0.75;
// Clothing colour: mean RGB distance (0..441) between two fingerprints. Same person
// moving through the ring varies by tens; different kit by well over a hundred.
/** Switches for A/B measurement in the offline harness; production leaves them all on. */
export const tuning = { appearance: true, kitScrub: true };

const APP_GATE = 150;
const APP_WEIGHT = 1 / 50;
const APP_SAME = 45; // this close = very probably the same kit

// Brightness changes a lot under ring lights and shadow; hue much less. So weigh the
// colour (blue-vs-red, green-vs-rest) more than the brightness: a navy gi and a black
// suit are close in RGB but clearly different in hue, a lit and a shaded white gi the reverse.
function colourDistance(r1: number, g1: number, b1: number, r2: number, g2: number, b2: number): number {
  const y = (r1 + g1 + b1) / 3 - (r2 + g2 + b2) / 3;
  const c1 = b1 - r1 - (b2 - r2);
  const c2 = g1 - (r1 + b1) / 2 - (g2 - (r2 + b2) / 2);
  return Math.hypot(0.7 * y, 2.5 * c1, 2.5 * c2);
}

export function appDistance(a: number[] | null | undefined, b: number[] | null | undefined): number | null {
  if (!tuning.appearance || !a || !b) return null;
  let sum = 0;
  let n = 0;
  for (let k = 0; k + 2 < Math.min(a.length, b.length); k += 3) {
    if (a[k]! < 0 || b[k]! < 0) continue;
    sum += colourDistance(a[k]!, a[k + 1]!, a[k + 2]!, b[k]!, b[k + 1]!, b[k + 2]!);
    n++;
  }
  return n ? sum / n : null;
}

function blendApp(old: number[] | null, next: number[] | null): number[] | null {
  if (!next) return old;
  if (!old) return next;
  return old.map((v, k) => (v < 0 ? next[k]! : next[k]! < 0 ? v : Math.round(0.7 * v + 0.3 * next[k]!)));
}

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


// ---------------------------------------------------------------------------
// Pose quality: a "pose" can be a half-body fragment or a collapsed skeleton
// (a crowd member behind the ropes, a fighter mostly hidden by the other one).
// Those must not seed tracks, be drawn in the picker, or feed the metrics.
// ---------------------------------------------------------------------------
const Q_VIS = 0.5;
const CORE = [11, 12, 23, 24] as const; // shoulders + hips
export type PoseQuality = {
  ok: boolean;
  /** 0..1: how complete and confident the skeleton is (for picking the best still). */
  score: number;
  reason: "ok" | "few-landmarks" | "no-torso" | "tiny" | "collapsed";
};

export function poseQuality(lm: Landmark[], w: number, h: number): PoseQuality {
  let vis = 0;
  let sum = 0;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const p of lm) {
    if (!p) continue;
    sum += Math.min(1, Math.max(0, p.visibility));
    if (p.visibility < Q_VIS) continue;
    vis++;
    x0 = Math.min(x0, p.x * w);
    x1 = Math.max(x1, p.x * w);
    y0 = Math.min(y0, p.y * h);
    y1 = Math.max(y1, p.y * h);
  }
  const mean = lm.length ? sum / lm.length : 0;
  const score = Math.min(1, (vis / 33) * 0.6 + mean * 0.4);
  const core = CORE.filter((i) => (lm[i]?.visibility ?? 0) >= Q_VIS).length;
  if (core < 3) return { ok: false, score, reason: "no-torso" };
  if (vis < 13) return { ok: false, score, reason: "few-landmarks" };
  const sh = mid(lm, 11, 12, w, h);
  const hp = mid(lm, 23, 24, w, h);
  if (!sh || !hp) return { ok: vis >= 13, score, reason: "ok" };
  const torso = Math.hypot(sh.x - hp.x, sh.y - hp.y);
  if (torso < 0.035 * h) return { ok: false, score, reason: "tiny" };
  // A real body spans several torso lengths (head to feet ~3.5, arms out more).
  // A squashed / folded-in skeleton does not.
  const extent = Math.max(x1 - x0, y1 - y0);
  if (extent < 2.0 * torso) return { ok: false, score, reason: "collapsed" };
  return { ok: true, score, reason: "ok" };
}

function mid(lm: Landmark[], a: number, b: number, w: number, h: number): { x: number; y: number } | null {
  const pa = lm[a];
  const pb = lm[b];
  if (!pa || !pb || pa.visibility < VIS || pb.visibility < VIS) return null;
  return { x: ((pa.x + pb.x) / 2) * w, y: ((pa.y + pb.y) / 2) * h };
}

type TrackState = {
  geom: Geom;
  lastT: number;
  vx: number; // px/s
  vy: number;
  app: number[] | null; // running clothing fingerprint
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
function matchCost(tr: TrackState, det: Geom, t: number, detApp: number[] | null): number | null {
  const dt = Math.max(t - tr.lastT, 0);
  const pred = predicted(tr, t);
  // Normalise by the bigger of the two bodies: a fighter who goes down changes size a lot.
  const ref = Math.max(tr.geom.size, det.size, 1);
  const d = Math.hypot(det.cx - pred.cx, det.cy - pred.cy) / ref;
  const da = appDistance(tr.app, detApp);
  if (da != null && da > APP_GATE) return null; // different kit: not the same person
  // Same kit seen again: allow a bigger jump (throws, falls, the camera moving).
  const sameKit = da != null && da <= APP_SAME;
  // At ~4fps a fighter moves well under one body height between samples.
  if (d > (sameKit ? 1.3 : 0.8) + dt) return null;
  const sizeJump = Math.abs(Math.log(det.size / tr.geom.size));
  if (sizeJump > (sameKit ? 1.8 : 1.0)) return null;
  return d + (1 - iou(pred, det)) * 0.5 + sizeJump * 0.4 + (da ?? 0) * APP_WEIGHT;
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
export function trackPeople(
  raw: RawPoseFrame[],
  w: number,
  h: number,
  opts: { maxTracks?: number; qualityGate?: boolean } = {},
): PoseFrame[][] {
  return rankTracks(trackCore(raw, w, h, opts).frames, w, h);
}

/** The tracker proper: every track (unranked) and each one's clothing fingerprint. */
export function trackCore(
  raw: RawPoseFrame[],
  w: number,
  h: number,
  opts: { maxTracks?: number; qualityGate?: boolean } = {},
): { frames: PoseFrame[][]; apps: (number[] | null)[] } {
  const maxTracks = opts.maxTracks ?? 2;
  const gate = opts.qualityGate ?? true;
  const tracks: TrackState[] = [];
  const n = raw.length;

  raw.forEach((rf, fi) => {
    const t = rf.timestamp;
    // 1. usable detections, de-duplicated (strongest first)
    let dets = rf.poses
      .map((lm, k) => ({ lm, g: poseGeom(lm, w, h), app: rf.app?.[k] ?? null }))
      .filter((d): d is { lm: Landmark[]; g: Geom; app: number[] | null } => d.g != null)
      .sort((a, b) => b.g.visible - a.g.visible);
    dets = dets.filter((d, i) => !dets.slice(0, i).some((k) => iou(k.g, d.g) > DUPLICATE_IOU));

    // 2. match to existing tracks
    const costs = dets.map((d) => tracks.map((tr) => matchCost(tr, d.g, t, d.app)));
    const pick = assign(costs);

    const taken = new Set<number>();
    const place = (tr: TrackState, d: { lm: Landmark[]; g: Geom; app: number[] | null }, keepVelocity: boolean) => {
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
      tr.app = blendApp(tr.app, d.app);
      tr.frames[fi] = d.lm;
    };

    dets.forEach((d, i) => {
      const j = pick[i]!;
      if (j >= 0) {
        taken.add(j);
        place(tracks[j]!, d, true);
      }
    });

    // 3. unmatched detections: a new person, a returning one, or noise
    dets.forEach((d, i) => {
      if (pick[i]! >= 0) return;
      // A fragment / collapsed skeleton may continue a person we already follow, but
      // never starts a 2nd+ person (a crowd member's half-body is not a fighter).
      const weak = gate && tracks.length > 0 && !poseQuality(d.lm, w, h).ok;
      if (weak) return;
      if (tracks.length < maxTracks) {
        const tr: TrackState = { geom: d.g, lastT: t, vx: 0, vy: 0, app: d.app, frames: new Array(n).fill(null) };
        tr.frames[fi] = d.lm;
        tracks.push(tr);
        taken.add(tracks.length - 1);
        return;
      }
      // All slots used: a person unseen for a while may be taken over by whoever turns up,
      // unless their kit clearly says otherwise.
      let stalest = -1;
      let stalestAge = STALE_SEC;
      tracks.forEach((tr, j) => {
        const age = t - tr.lastT;
        const da = appDistance(tr.app, d.app);
        if (!taken.has(j) && age > stalestAge && (da == null || da <= APP_GATE * 0.6)) {
          stalest = j;
          stalestAge = age;
        }
      });
      if (stalest >= 0) {
        taken.add(stalest);
        place(tracks[stalest]!, d, false);
      }
      // else: another body while the maximum are being followed - ignored.
    });
  });

  const out: PoseFrame[][] = tracks.map((tr) =>
    raw.map((rf, i) => ({ timestamp: rf.timestamp, landmarks: tr.frames[i] ?? null })),
  );
  return { frames: out, apps: tracks.map((tr) => tr.app) };
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
  /** False when no frame had both skeletons complete + separated (best available is used). */
  clean: boolean;
};

type Box = { x0: number; y0: number; x1: number; y1: number };

function boxOf(lm: Landmark[], w: number, h: number): Box | null {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  let n = 0;
  for (const p of lm) {
    if (!p || p.visibility < Q_VIS) continue;
    n++;
    x0 = Math.min(x0, p.x * w);
    x1 = Math.max(x1, p.x * w);
    y0 = Math.min(y0, p.y * h);
    y1 = Math.max(y1, p.y * h);
  }
  return n ? { x0, y0, x1, y1 } : null;
}

function boxIou(a: Box, b: Box): number {
  const iw = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
  const ih = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
  if (iw <= 0 || ih <= 0) return 0;
  const inter = iw * ih;
  const ua = (a.x1 - a.x0) * (a.y1 - a.y0) + (b.x1 - b.x0) * (b.y1 - b.y0) - inter;
  return ua > 0 ? inter / ua : 0;
}

/**
 * The still for the "Which one is you?" picker: a frame where BOTH fighters are
 * fully visible (complete, non-squashed skeletons, not cropped by the frame edge),
 * well separated (boxes barely overlap, so the two skeletons are easy to tell
 * apart and tap), big enough to read, and detected with high confidence.
 */
export function pickerStill(
  a: PoseFrame[],
  b: PoseFrame[],
  w: number,
  h: number,
): { index: number; clean: boolean } | null {
  let best = -1;
  let bestScore = -Infinity;
  let bestClean = false;
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    const la = a[i]!.landmarks;
    const lb = b[i]!.landmarks;
    if (!la || !lb) continue;
    const qa = poseQuality(la, w, h);
    const qb = poseQuality(lb, w, h);
    const ba = boxOf(la, w, h);
    const bb = boxOf(lb, w, h);
    if (!ba || !bb) continue;
    const overlap = boxIou(ba, bb);
    // Legs running off the bottom of the frame are normal in a ring shot; a body
    // mostly outside the frame is not "fully visible".
    const spill = (bx: Box) =>
      (Math.max(0, -bx.x0) + Math.max(0, bx.x1 - w) + Math.max(0, -bx.y0) + Math.max(0, bx.y1 - h)) /
      Math.max(bx.y1 - bx.y0, 1);
    const cut = Math.max(spill(ba), spill(bb));
    // A fighter jammed against the left/right frame edge is half out of shot.
    const side = (bx: Box) => (bx.x0 < 0.015 * w || bx.x1 > 0.985 * w ? 1 : 0);
    const edge = side(ba) + side(bb);
    const sizeA = (ba.y1 - ba.y0) / h;
    const sizeB = (bb.y1 - bb.y0) / h;
    // Two fighters in one ring are about the same size on screen; a tiny one next to a big one is a
    // far-off bystander or a folded-up skeleton, not the second fighter.
    const alike = Math.min(sizeA, sizeB) / Math.max(sizeA, sizeB, 1e-6) >= 0.45;
    const clean = qa.ok && qb.ok && overlap <= 0.35 && cut <= 0.12 && edge === 0 && alike;
    // confidence (0..2) + separation (0..1.5) + readable size (0..0.6) - cropped
    const score =
      qa.score +
      qb.score +
      1.5 * Math.max(0, 1 - overlap * 4) +
      Math.min(0.6, Math.min(sizeA, sizeB)) -
      2 * cut +
      (clean ? 10 : 0);
    if (score > bestScore) {
      bestScore = score;
      best = i;
      bestClean = clean;
    }
  }
  return best < 0 ? null : { index: best, clean: bestClean };
}

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
  for (let i = 0; i < total; i++) {
    const la = a[i]!.landmarks;
    const lb = b[i]!.landmarks;
    if (!la || !lb) continue;
    if (poseGeom(la, w, h) && poseGeom(lb, w, h)) paired++;
  }
  if (paired < MIN_PAIRED_FRAMES) return null;
  const still = pickerStill(a, b, w, h);
  // Never ask the user to choose between garbage: no frame with two complete, separated skeletons = no picker.
  if (!still || !still.clean) return null;
  return { pickerFrame: still.index, pairedFrames: paired, clean: still.clean };
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


// ---------------------------------------------------------------------------
// Who are the two FIGHTERS? A clip can hold a referee, a coach, corner men and a
// crowd as well. Fighters (a) are in the frame most of the time, (b) stay close
// to each other and face each other, (c) are the busiest bodies (strikes, steps,
// grappling) with an active posture (guard up), and (d) are both big on screen.
// A referee is upright, hands low, mostly watching, and drifts at the edge.
// ---------------------------------------------------------------------------

export type TrackProfile = {
  count: number;
  size: number; // median bbox height, px
  act: number; // limb + body motion, body-heights per second
  guard: number; // 0..1 how often the hands are up at chest / face height
  quality: number; // mean pose quality score
  cx: number; // median hip centre, px
  cy: number;
};

const LIMBS = [13, 14, 15, 16, 25, 26, 27, 28] as const;

export function trackProfile(frames: PoseFrame[], w: number, h: number): TrackProfile {
  const sizes: number[] = [];
  const xs: number[] = [];
  const ys: number[] = [];
  const quals: number[] = [];
  const acts: number[] = [];
  const guards: number[] = [];
  let count = 0;
  let prev: { t: number; lm: Landmark[]; c: { x: number; y: number }; size: number } | null = null;
  for (const f of frames) {
    const lm = f.landmarks;
    const g = lm ? poseGeom(lm, w, h) : null;
    if (!lm || !g) continue;
    count++;
    sizes.push(g.size);
    xs.push(g.cx);
    ys.push(g.cy);
    quals.push(poseQuality(lm, w, h).score);
    const sh = mid(lm, 11, 12, w, h);
    const hp = mid(lm, 23, 24, w, h);
    if (sh && hp) {
      const torso = Math.max(Math.hypot(sh.x - hp.x, sh.y - hp.y), 1);
      let up = 0;
      let seen = 0;
      for (const i of [15, 16]) {
        const p = lm[i];
        if (!p || p.visibility < VIS) continue;
        seen++;
        if (p.y * h < sh.y + 0.5 * torso) up++;
      }
      if (seen) guards.push(up / seen);
    }
    const c = { x: g.cx, y: g.cy };
    if (prev && f.timestamp - prev.t > 0.01 && f.timestamp - prev.t <= 0.8) {
      const dt = f.timestamp - prev.t;
      const size = Math.max(g.size, prev.size);
      let sum = 0;
      let n = 0;
      for (const i of LIMBS) {
        const p = lm[i];
        const q = prev.lm[i];
        if (!p || !q || p.visibility < 0.4 || q.visibility < 0.4) continue;
        const dx = p.x * w - c.x - (q.x * w - prev.c.x);
        const dy = p.y * h - c.y - (q.y * h - prev.c.y);
        sum += Math.min(3, Math.hypot(dx, dy) / size);
        n++;
      }
      const body = Math.min(3, Math.hypot(c.x - prev.c.x, c.y - prev.c.y) / size);
      if (n >= 3) acts.push((sum / n + 0.5 * body) / dt);
    }
    prev = { t: f.timestamp, lm, c, size: g.size };
  }
  return {
    count,
    size: median(sizes),
    act: median(acts),
    guard: guards.length ? guards.reduce((a, b) => a + b, 0) / guards.length : 0,
    quality: quals.length ? quals.reduce((a, b) => a + b, 0) / quals.length : 0,
    cx: median(xs),
    cy: median(ys),
  };
}

export type PairStats = {
  together: number; // frames both are present
  engaged: number; // 0..1: share of those frames within ~1.5 body heights of each other
  prox: number; // 0..1 mean closeness
  facing: number; // 0..1 how often each is turned toward the other (0.5 = unknown)
};

function facingSign(lm: Landmark[]): number {
  const n = lm[0];
  const l = lm[11];
  const r = lm[12];
  if (!n || !l || !r || n.visibility < VIS || l.visibility < VIS || r.visibility < VIS) return 0;
  const sw = Math.abs(l.x - r.x);
  const off = n.x - (l.x + r.x) / 2;
  // Nose well to one side of the shoulder line = side-on; ~centred = facing the camera.
  return Math.abs(off) > 0.15 * sw ? Math.sign(off) : 0;
}

export function pairStats(a: PoseFrame[], b: PoseFrame[], w: number, h: number): PairStats {
  let together = 0;
  let engaged = 0;
  let prox = 0;
  let facingSum = 0;
  let facingN = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    const la = a[i]!.landmarks;
    const lb = b[i]!.landmarks;
    if (!la || !lb) continue;
    const ga = poseGeom(la, w, h);
    const gb = poseGeom(lb, w, h);
    if (!ga || !gb) continue;
    together++;
    const d = Math.hypot(ga.cx - gb.cx, ga.cy - gb.cy) / Math.max((ga.size + gb.size) / 2, 1);
    if (d < 1.5) engaged++;
    prox += Math.max(0, 1 - d / 2.5);
    const sa = facingSign(la);
    if (sa !== 0) {
      facingN++;
      if (sa === Math.sign(gb.cx - ga.cx)) facingSum++;
    }
    const sb = facingSign(lb);
    if (sb !== 0) {
      facingN++;
      if (sb === Math.sign(ga.cx - gb.cx)) facingSum++;
    }
  }
  return {
    together,
    engaged: together ? engaged / together : 0,
    prox: together ? prox / together : 0,
    facing: facingN ? facingSum / facingN : 0.5,
  };
}

/** Squash an unbounded non-negative value into 0..1 (half-way at `half`). */
const sat = (v: number, half: number) => v / (v + half);

export type PairScore = { i: number; j: number; score: number };

/** Score every pair of tracks as "these two are the fighters", best first. */
export function scorePairs(tracks: PoseFrame[][], w: number, h: number): PairScore[] {
  const total = tracks[0]?.length ?? 0;
  const prof = tracks.map((t) => trackProfile(t, w, h));
  const out: PairScore[] = [];
  for (let i = 0; i < tracks.length; i++) {
    for (let j = i + 1; j < tracks.length; j++) {
      const pa = prof[i]!;
      const pb = prof[j]!;
      const ps = pairStats(tracks[i]!, tracks[j]!, w, h);
      if (!total || ps.together < 1) {
        out.push({ i, j, score: -1 });
        continue;
      }
      const cover = Math.min(pa.count, pb.count) / total;
      const act = Math.min(sat(pa.act, 0.6), sat(pb.act, 0.6));
      const guard = Math.min(pa.guard, pb.guard);
      const sizeRatio = Math.min(pa.size, pb.size) / Math.max(pa.size, pb.size, 1);
      const score =
        1.2 * cover +
        1.6 * ps.engaged +
        0.6 * ps.prox +
        1.2 * act +
        0.8 * guard +
        0.5 * ps.facing +
        0.6 * sizeRatio;
      out.push({ i, j, score });
    }
  }
  return out.sort((x, y) => y.score - x.score);
}

/**
 * Merge track fragments that are the same person: one ends, another starts a
 * moment later close by, and they are never in the same frame. (A fighter lost
 * in a clinch and re-found must not become a "third person".)
 */
export function stitchTracks(
  tracks: PoseFrame[][],
  w: number,
  h: number,
  apps: (number[] | null)[] = [],
): PoseFrame[][] {
  const out = tracks.map((t) => t.slice());
  const app = apps.slice();
  const span = (t: PoseFrame[]) => {
    let s = -1;
    let e = -1;
    t.forEach((f, i) => {
      if (f.landmarks && poseGeom(f.landmarks, w, h)) {
        if (s < 0) s = i;
        e = i;
      }
    });
    return { s, e };
  };
  for (;;) {
    let best: { a: number; b: number; cost: number } | null = null;
    for (let a = 0; a < out.length; a++) {
      for (let b = 0; b < out.length; b++) {
        if (a === b) continue;
        const sa = span(out[a]!);
        const sb = span(out[b]!);
        if (sa.s < 0 || sb.s < 0 || sa.e >= sb.s) continue; // a must finish before b starts
        const gap = out[b]![sb.s]!.timestamp - out[a]![sa.e]!.timestamp;
        if (gap <= 0 || gap > 3) continue;
        let overlap = false;
        for (let k = 0; k < out[a]!.length && !overlap; k++) overlap = !!out[a]![k]!.landmarks && !!out[b]![k]!.landmarks;
        if (overlap) continue;
        const ga = poseGeom(out[a]![sa.e]!.landmarks!, w, h)!;
        const gb = poseGeom(out[b]![sb.s]!.landmarks!, w, h)!;
        const d = Math.hypot(ga.cx - gb.cx, ga.cy - gb.cy) / Math.max(ga.size, 1);
        const sj = Math.abs(Math.log(gb.size / ga.size));
        if (d > 0.5 + 0.6 * gap || sj > 0.7) continue;
        const da = appDistance(app[a], app[b]);
        if (da != null && da > APP_GATE) continue;
        const cost = d + sj + (da ?? 0) * APP_WEIGHT;
        if (!best || cost < best.cost) best = { a, b, cost };
      }
    }
    if (!best) break;
    const bTrack = out[best.b]!;
    out[best.a] = out[best.a]!.map((f, k) => (f.landmarks ? f : bTrack[k]!));
    app[best.a] = blendApp(app[best.a] ?? null, app[best.b] ?? null);
    out.splice(best.b, 1);
    app.splice(best.b, 1);
  }
  return out;
}

/** Drop frames whose skeleton is partial / collapsed (a hidden fighter) from a track. */
export function scrubTrack(frames: PoseFrame[], w: number, h: number): PoseFrame[] {
  return frames.map((f) =>
    f.landmarks && !poseQuality(f.landmarks, w, h).ok ? { timestamp: f.timestamp, landmarks: null } : f,
  );
}

// The look-again pass also finds bodies that are not there (a hanging heavy bag, a
// pole), and even the normal pass sometimes sees a bag as a person for a frame or two.
// So a SECOND person is only believed in a clip where the normal pass has itself seen
// two separate bodies in the same frame; everywhere else the clip is
// treated as one person (exactly as before this feature) and extras are discarded.
export const MIN_EVIDENCE_FRAMES = 2;
export const MIN_EVIDENCE_SHARE = 0.03;

function isStrong(lm: Landmark[], w: number, h: number): boolean {
  return poseGeom(lm, w, h) != null && poseQuality(lm, w, h).ok;
}

export function twoBodyEvidence(raw: RawPoseFrame[], w: number, h: number): { frames: number; multi: boolean } {
  let frames = 0;
  for (const f of raw) {
    const n = f.primary ?? f.poses.length;
    // Real bodies of a sensible size (a skeleton may be partial in a hard shot; that is
    // judged later) - not one body twice.
    const bodies = f.poses
      .slice(0, n)
      .map((lm) => poseGeom(lm, w, h))
      .filter((g): g is Geom => g != null && g.size >= 0.15 * h);
    let two = false;
    for (let i = 0; i < bodies.length && !two; i++) {
      for (let j = i + 1; j < bodies.length && !two; j++) two = iou(bodies[i]!, bodies[j]!) < 0.5;
    }
    if (two) frames++;
  }
  return { frames, multi: frames >= Math.max(MIN_EVIDENCE_FRAMES, MIN_EVIDENCE_SHARE * raw.length) };
}

/** Keep the look-again bodies only in a clip with two-body evidence, and only complete ones. */
export function gateExtras(raw: RawPoseFrame[], w: number, h: number): RawPoseFrame[] {
  if (!raw.some((f) => f.primary != null && f.primary < f.poses.length)) return raw;
  const trusted = twoBodyEvidence(raw, w, h).multi;
  return raw.map((f) => {
    const n = f.primary ?? f.poses.length;
    if (n >= f.poses.length) return f;
    const keep = f.poses.map((lm, k) => k < n || (trusted && isStrong(lm, w, h)));
    return {
      timestamp: f.timestamp,
      poses: f.poses.filter((_, k) => keep[k]),
      primary: n,
      app: f.app?.filter((_, k) => keep[k]),
    };
  });
}

// A frame whose kit differs this much from the rest of its track is somebody else.
export const KIT_OUTLIER = 70;

function medianApp(apps: (number[] | null)[]): number[] | null {
  const have = apps.filter((a): a is number[] => !!a);
  if (have.length < 3) return null;
  return [0, 1, 2, 3, 4, 5].map((k) => {
    const v = have.map((a) => a[k]!).filter((x) => x >= 0);
    return v.length >= 3 ? median(v) : -1;
  });
}

/**
 * Last line of defence against identity mix-ups (a referee in a dark suit picked up by
 * the navy fighter's track after a fall, two fighters swapped in a clinch): drop frames
 * whose clothing colour doesn't belong to the track, or fits the OTHER fighter better.
 * Never removes more than half a track.
 */
export function kitScrub(
  tracks: PoseFrame[][],
  appOf: (lm: Landmark[]) => number[] | null,
): PoseFrame[][] {
  const meds = tracks.map((t) => medianApp(t.map((f) => (f.landmarks ? appOf(f.landmarks) : null))));
  const distinct = tracks.length === 2 && (appDistance(meds[0], meds[1]) ?? 0) > KIT_OUTLIER;
  return tracks.map((t, k) => {
    const out = t.map((f) => {
      if (!f.landmarks || !meds[k]) return f;
      const a = appOf(f.landmarks);
      if (!a) return f;
      const own = appDistance(meds[k], a);
      if (own == null) return f;
      const other = distinct ? appDistance(meds[1 - k], a) : null;
      const foreign = own > KIT_OUTLIER || (other != null && other + 15 < own);
      return foreign ? { timestamp: f.timestamp, landmarks: null } : f;
    });
    const n = (x: PoseFrame[]) => x.filter((f) => f.landmarks).length;
    return n(out) >= Math.max(6, 0.5 * n(t)) ? out : t;
  });
}

/**
 * Follow everyone (up to 4 bodies), then keep the two FIGHTERS only, best-first
 * (index 0 = the suggested "you"). One-person clips come back exactly as the
 * plain tracker returns them. For a fight with a referee / coach / crowd the
 * extras are dropped and partial skeletons are removed from the kept tracks.
 */
export function selectFighters(raw: RawPoseFrame[], w: number, h: number): PoseFrame[][] {
  if (!twoBodyEvidence(raw, w, h).multi) {
    // One person (or never two bodies at once): the plain tracker on the normal-pass poses.
    const solo = raw.map((f) => ({
      timestamp: f.timestamp,
      poses: f.poses.slice(0, f.primary ?? f.poses.length),
      app: f.app?.slice(0, f.primary ?? f.poses.length),
    }));
    return trackPeople(solo, w, h, { maxTracks: 1 });
  }
  const gated = gateExtras(raw, w, h);
  const appByPose = new Map<Landmark[], number[] | null>();
  gated.forEach((f) => f.poses.forEach((lm, k) => appByPose.set(lm, f.app?.[k] ?? null)));
  const core = trackCore(gated, w, h, { maxTracks: MAX_TRACKS });
  const all = core.frames;
  if (all.length <= 1) return rankTracks(all, w, h);
  const stitched = stitchTracks(all, w, h, core.apps);
  if (stitched.length <= 1) return stitched;
  const pair = scorePairs(stitched, w, h)[0];
  if (!pair || pair.score < 0) return rankTracks(stitched.slice(0, 2), w, h);
  const kept = [stitched[pair.i]!, stitched[pair.j]!].map((t) => {
    const scrubbed = scrubTrack(t, w, h);
    // Never scrub a track away: if most of it is partial skeletons the clip is just hard
    // footage and the unscrubbed track is still the best information we have.
    const n = (x: PoseFrame[]) => x.filter((f) => f.landmarks).length;
    return n(scrubbed) >= Math.max(6, 0.5 * n(t)) ? scrubbed : t;
  });
  const clean = kept.length === 2 && tuning.kitScrub ? kitScrub(kept, (lm) => appByPose.get(lm) ?? null) : kept;
  return rankTracks(
    clean.filter((t) => t.some((f) => f.landmarks)),
    w,
    h,
  );
}
