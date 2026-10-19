import type { Landmark, PoseFrame } from "./pose";

// A skeleton the model is "confident" about can still be nonsense: in ground work, tight
// clinches and close-ups BlazePose folds the torso into a bow-tie, throws a limb across the
// frame or squashes the body flat. Drawing that (and scoring it) is worse than showing
// nothing, so frames that are anatomically impossible are dropped to "no lock" and the UI
// says so. All checks are on proportions (relative to the torso), so they hold at any zoom.

const VIS = 0.5;
// Longest believable bone, in torso lengths. Real: upper arm ~0.65, forearm ~0.55, thigh ~1.0,
// shin ~0.95 (all can only look SHORTER from an angle, never longer).
const MAX_BONE_TORSO = 1.7;
// Real shoulder/hip width is ~0.4-0.9 torso lengths frontally and shrinks side-on.
const MAX_WIDTH_TORSO = 1.8;
const MIN_TORSO_FRAC_OF_H = 0.02;

const BONES: ReadonlyArray<readonly [number, number]> = [
  [11, 13],
  [13, 15],
  [12, 14],
  [14, 16],
  [23, 25],
  [25, 27],
  [24, 26],
  [26, 28],
];

type P = { x: number; y: number };

function cross(a: P, b: P, c: P): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

/** Do segments ab and cd properly cross? */
function segmentsCross(a: P, b: P, c: P, d: P): boolean {
  const d1 = cross(a, b, c);
  const d2 = cross(a, b, d);
  const d3 = cross(c, d, a);
  const d4 = cross(c, d, b);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

/**
 * False when the skeleton is anatomically impossible (twisted torso, limb far longer than the
 * body allows, absurd shoulder/hip width, collapsed torso). True when it looks like a body or
 * when there is not enough visible (torso) to judge - partial skeletons are the tracker's
 * business (pose-people.poseQuality), not this check's.
 */
export function skeletonSane(lm: Landmark[], w: number, h: number): boolean {
  const pt = (i: number): P | null => {
    const p = lm[i];
    return p && p.visibility >= VIS ? { x: p.x * w, y: p.y * h } : null;
  };
  const s1 = pt(11);
  const s2 = pt(12);
  const h1 = pt(23);
  const h2 = pt(24);
  if (!s1 || !s2 || !h1 || !h2) return true; // cannot judge the torso
  const sm = { x: (s1.x + s2.x) / 2, y: (s1.y + s2.y) / 2 };
  const hm = { x: (h1.x + h2.x) / 2, y: (h1.y + h2.y) / 2 };
  const torso = Math.hypot(sm.x - hm.x, sm.y - hm.y);
  if (torso < MIN_TORSO_FRAC_OF_H * h) return false;
  // Bow-tie torso: the two sides (or the shoulder line and hip line) cross each other.
  if (segmentsCross(s1, h1, s2, h2) || segmentsCross(s1, s2, h1, h2)) return false;
  if (Math.hypot(s1.x - s2.x, s1.y - s2.y) > MAX_WIDTH_TORSO * torso) return false;
  if (Math.hypot(h1.x - h2.x, h1.y - h2.y) > MAX_WIDTH_TORSO * torso) return false;
  for (const [a, b] of BONES) {
    const pa = pt(a);
    const pb = pt(b);
    if (pa && pb && Math.hypot(pa.x - pb.x, pa.y - pb.y) > MAX_BONE_TORSO * torso) return false;
  }
  return true;
}

export type ScrubResult = { frames: PoseFrame[]; judged: number; dropped: number };

// A joint the model places outside the picture (an athlete cut off by the frame edge, or a crop
// of a wider shot) is a guess, not a measurement: it is marked not-visible so it is neither drawn
// nor measured (and the lead-side / guard maths simply don't see it).
const OFF_FRAME_MARGIN = 0.02;

export function maskOffFrame(lm: Landmark[]): Landmark[] {
  let any = false;
  const out = lm.map((p) => {
    if (p.visibility > 0 && (p.x < -OFF_FRAME_MARGIN || p.x > 1 + OFF_FRAME_MARGIN || p.y < -OFF_FRAME_MARGIN || p.y > 1 + OFF_FRAME_MARGIN)) {
      any = true;
      return { ...p, visibility: 0 };
    }
    return p;
  });
  return any ? out : lm;
}

/**
 * Same frames, with off-frame joints hidden and impossible skeletons turned into "no lock"
 * (null landmarks). Inputs are never mutated.
 */
export function scrubInsaneSkeletons(frames: PoseFrame[], w: number, h: number): ScrubResult {
  let judged = 0;
  let dropped = 0;
  const out = frames.map((f) => {
    if (!f.landmarks) return f;
    judged++;
    const lm = maskOffFrame(f.landmarks);
    if (!skeletonSane(lm, w, h)) {
      dropped++;
      return { ...f, landmarks: null };
    }
    return lm === f.landmarks ? f : { ...f, landmarks: lm };
  });
  return { frames: out, judged, dropped };
}

/** Angle (degrees, 0-180) of the shoulders-above-hips axis from vertical, or null when the torso is not visible. */
export function torsoTiltDeg(lm: Landmark[], w: number, h: number): number | null {
  const ok = (i: number) => (lm[i]?.visibility ?? 0) >= VIS;
  if (![11, 12, 23, 24].every(ok)) return null;
  const vx = ((lm[11]!.x + lm[12]!.x) / 2 - (lm[23]!.x + lm[24]!.x) / 2) * w;
  const vy = ((lm[23]!.y + lm[24]!.y) / 2 - (lm[11]!.y + lm[12]!.y) / 2) * h; // + = shoulders above hips
  return Math.abs(Math.atan2(vx, vy)) * (180 / Math.PI);
}

// ---------------------------------------------------------------------------
// Clip-level verdict: is this track good enough to DRAW (overlay, ghost, graphs, annotated
// findings, comparisons)? Calibrated on 19 real clips (jobs/frame-tracking/clips): standing
// work scores "good"; face close-ups (torso length jumping ~33% between samples) and clips
// where the athlete is rarely found are "low". It cannot tell a stable-but-wrong skeleton
// on seated/ground grappling from a right one - that is a model limit, stated in the UI copy.
// ---------------------------------------------------------------------------

const MIN_POSED_SHARE = 0.25; // of sampled frames
const MIN_SANE_SHARE = 0.75; // of posed frames
const MAX_TORSO_JITTER = 0.25; // median |change in torso length| between consecutive samples
// Guard/stance/level are defined for an upright athlete. Calibrated: standing work is tilted past
// 60 degrees in under ~7% of frames; floor grappling / lying / rotated video in 60-90%.
const TILT_DEG = 60;
const MAX_TILTED_SHARE = 0.5;

export type TrackReliability = {
  level: "good" | "low";
  /** Plain-language reasons (empty when good). */
  reasons: string[];
  posedShare: number;
  saneShare: number;
  torsoJitter: number;
  /** Share of judged frames whose torso is more than 60 degrees off vertical. */
  tiltedShare: number;
};

function median(a: number[]): number {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.floor(s.length / 2)]!;
}

/** `scrubbed` = the result of scrubInsaneSkeletons on `frames`' source; `frames` are the scrubbed frames. */
export function trackReliability(
  frames: PoseFrame[],
  w: number,
  h: number,
  scrubbed: Pick<ScrubResult, "judged" | "dropped">,
): TrackReliability {
  const posed = frames.filter((f) => f.landmarks).length;
  const posedShare = frames.length ? posed / (frames.length || 1) : 0;
  const sane = scrubbed.judged ? 1 - scrubbed.dropped / scrubbed.judged : 0;
  const dT: number[] = [];
  let tilted = 0;
  let judgedTorso = 0;
  let prev: { t: number; torso: number } | null = null;
  for (const f of frames) {
    const lm = f.landmarks;
    if (!lm) {
      prev = null;
      continue;
    }
    const ok = (i: number) => (lm[i]?.visibility ?? 0) >= VIS;
    if (![11, 12, 23, 24].every(ok)) {
      prev = null;
      continue;
    }
    const torso = Math.hypot(
      ((lm[11]!.x + lm[12]!.x) / 2 - (lm[23]!.x + lm[24]!.x) / 2) * w,
      ((lm[11]!.y + lm[12]!.y) / 2 - (lm[23]!.y + lm[24]!.y) / 2) * h,
    );
    judgedTorso++;
    if ((torsoTiltDeg(lm, w, h) ?? 0) > TILT_DEG) tilted++;
    if (prev && f.timestamp - prev.t <= 0.6 && torso + prev.torso > 0) {
      dT.push(Math.abs(torso - prev.torso) / ((torso + prev.torso) / 2));
    }
    prev = { t: f.timestamp, torso };
  }
  const torsoJitter = median(dT);
  const tiltedShare = judgedTorso ? tilted / judgedTorso : 0;
  const reasons: string[] = [];
  if (posedShare < MIN_POSED_SHARE) reasons.push("the athlete was found in only a small part of the clip");
  if (scrubbed.judged >= 5 && sane < MIN_SANE_SHARE) reasons.push("many skeletons were physically impossible (a folded or twisted body)");
  if (dT.length >= 5 && torsoJitter > MAX_TORSO_JITTER) reasons.push("the body outline kept jumping between frames (close-up or heavy overlap)");
  if (judgedTorso >= 5 && tiltedShare > MAX_TILTED_SHARE)
    reasons.push("the body was mostly horizontal or upside down (ground work, lying down or a rotated video)");
  return { level: reasons.length ? "low" : "good", reasons, posedShare, saneShare: sane, torsoJitter, tiltedShare };
}
