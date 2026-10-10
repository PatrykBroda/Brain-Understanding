import type { Landmark, PoseFrame } from "./pose";

// ---------------------------------------------------------------------------
// Compact per-frame pose track.
//
// The pose pass produces 33 BlazePose landmarks per sampled frame. They used to
// be thrown away once keyframes were captured. This module keeps them in a
// small quantised form (sent to / stored by the server) and gives the visual
// layers (overlay, graphs, annotated frames, comparisons) a decoded view.
//
// Wire layout (v1) — the server validates exactly this shape
// (api-server/src/lib/poseTrack.ts; a contract test keeps both in step):
//   t: integer milliseconds per frame (strictly increasing)
//   d: base64 of, per frame, 33 x [x u16 LE, y u16 LE, visibility u8]
//      x/y: [-0.5, 1.5] -> [0, 65535] (landmarks may sit slightly off-frame)
//      visibility: [0, 1] -> [0, 255]
//   Only frames WITH a pose lock are stored; a gap in t is a real gap.
// ---------------------------------------------------------------------------

export const TRACK_VERSION = 1;
export const TRACK_LANDMARKS = 33;
export const TRACK_BYTES_PER_FRAME = TRACK_LANDMARKS * 5;
export const TRACK_MAX_BYTES = 150_000;

const Q_MIN = -0.5;
const Q_RANGE = 2; // [-0.5, 1.5]

export type LeadSide = "left" | "right";

export type PoseTrackWire = {
  v: 1;
  w: number;
  h: number;
  lead: LeadSide | null;
  t: number[];
  d: string;
};

// A frame guaranteed to have landmarks.
export type PosedFrame = { timestamp: number; landmarks: Landmark[] };

export type DecodedTrack = {
  w: number;
  h: number;
  lead: LeadSide | null;
  frames: PosedFrame[];
  /** Timestamp (s) of the last pose frame. */
  endSec: number;
};

// A pose gap bigger than this (seconds) is a real hole: the skeleton is hidden
// and graphs break the line instead of inventing motion across it. Sampling is
// ~0.25s, so 0.6s means two consecutive frames lost their lock.
export const MAX_GAP_SEC = 0.6;

// BlazePose indices used across the visual layers.
export const LM = {
  NOSE: 0,
  L_EYE: 2,
  R_EYE: 5,
  L_EAR: 7,
  R_EAR: 8,
  L_SHOULDER: 11,
  R_SHOULDER: 12,
  L_ELBOW: 13,
  R_ELBOW: 14,
  L_WRIST: 15,
  R_WRIST: 16,
  L_HIP: 23,
  R_HIP: 24,
  L_KNEE: 25,
  R_KNEE: 26,
  L_ANKLE: 27,
  R_ANKLE: 28,
} as const;

// Connection pairs for the skeleton (subset that reads cleanly for combat).
export const SKELETON_CONNECTIONS: [number, number][] = [
  [11, 12],
  [11, 13],
  [13, 15],
  [12, 14],
  [14, 16],
  [11, 23],
  [12, 24],
  [23, 24],
  [23, 25],
  [25, 27],
  [24, 26],
  [26, 28],
  [27, 31],
  [28, 32],
];

// ---------------------------------------------------------------------------
// Encode / decode
// ---------------------------------------------------------------------------

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

export function quantiseCoord(v: number): number {
  return Math.round(clamp01((v - Q_MIN) / Q_RANGE) * 65535);
}

export function dequantiseCoord(q: number): number {
  return (q / 65535) * Q_RANGE + Q_MIN;
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * Quantise the pose frames into the wire form. Frames without a pose are
 * dropped (their absence is the gap). Returns null when there are fewer than 3
 * posed frames or the result would exceed the size cap — the analysis is then
 * sent without a track and simply renders without the visuals.
 */
export function encodePoseTrack(
  frames: PoseFrame[],
  width: number,
  height: number,
): PoseTrackWire | null {
  const posed: PosedFrame[] = [];
  let lastMs = -1;
  for (const f of frames) {
    if (!f.landmarks || f.landmarks.length < TRACK_LANDMARKS) continue;
    const ms = Math.round(f.timestamp * 1000);
    if (ms <= lastMs) continue; // keep t strictly increasing
    lastMs = ms;
    posed.push({ timestamp: f.timestamp, landmarks: f.landmarks });
  }
  if (posed.length < 3) return null;

  const buf = new Uint8Array(posed.length * TRACK_BYTES_PER_FRAME);
  const view = new DataView(buf.buffer);
  const t: number[] = [];
  let o = 0;
  for (const f of posed) {
    t.push(Math.round(f.timestamp * 1000));
    for (let i = 0; i < TRACK_LANDMARKS; i++) {
      const lm = f.landmarks[i]!;
      view.setUint16(o, quantiseCoord(lm.x), true);
      view.setUint16(o + 2, quantiseCoord(lm.y), true);
      buf[o + 4] = Math.round(clamp01(lm.visibility) * 255);
      o += 5;
    }
  }
  const d = bytesToBase64(buf);
  if (d.length + t.length * 8 > TRACK_MAX_BYTES) return null;

  return {
    v: 1,
    w: Math.max(16, Math.round(width)),
    h: Math.max(16, Math.round(height)),
    lead: inferLeadSide(posed),
    t,
    d,
  };
}

/** Decode a wire track. Returns null if it is not a well-formed v1 track. */
export function decodePoseTrack(wire: unknown): DecodedTrack | null {
  if (!wire || typeof wire !== "object") return null;
  const w = wire as Partial<PoseTrackWire>;
  if (w.v !== 1 || typeof w.d !== "string" || !Array.isArray(w.t)) return null;
  if (typeof w.w !== "number" || typeof w.h !== "number" || w.w <= 0 || w.h <= 0) return null;
  let bytes: Uint8Array;
  try {
    bytes = base64ToBytes(w.d);
  } catch {
    return null;
  }
  if (bytes.length !== w.t.length * TRACK_BYTES_PER_FRAME || w.t.length === 0) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const frames: PosedFrame[] = [];
  let o = 0;
  for (const ms of w.t) {
    const landmarks: Landmark[] = new Array(TRACK_LANDMARKS);
    for (let i = 0; i < TRACK_LANDMARKS; i++) {
      landmarks[i] = {
        x: dequantiseCoord(view.getUint16(o, true)),
        y: dequantiseCoord(view.getUint16(o + 2, true)),
        z: 0,
        visibility: bytes[o + 4]! / 255,
      };
      o += 5;
    }
    frames.push({ timestamp: ms / 1000, landmarks });
  }
  return {
    w: w.w,
    h: w.h,
    lead: w.lead === "left" || w.lead === "right" ? w.lead : null,
    frames,
    endSec: frames[frames.length - 1]!.timestamp,
  };
}

// ---------------------------------------------------------------------------
// Stance side
// ---------------------------------------------------------------------------

function visOk(lm: Landmark | undefined, min = 0.5): lm is Landmark {
  return !!lm && lm.visibility >= min;
}

/**
 * Which side is forward, measured — never assumed. In a profile-ish view the
 * nose sits ahead of the ear line, which tells us the facing direction; the
 * ankle further along that direction is the lead foot. We only call it when
 * enough frames agree. Frontal / ambiguous footage returns null, and every
 * visual that needs "lead"/"rear" is then hidden or labelled left/right.
 */
export function inferLeadSide(frames: PosedFrame[]): LeadSide | null {
  let left = 0;
  let right = 0;
  for (const f of frames) {
    const lm = f.landmarks;
    const nose = lm[LM.NOSE];
    const le = lm[LM.L_EAR];
    const re = lm[LM.R_EAR];
    const ls = lm[LM.L_SHOULDER];
    const rs = lm[LM.R_SHOULDER];
    const lh = lm[LM.L_HIP];
    const rh = lm[LM.R_HIP];
    const la = lm[LM.L_ANKLE];
    const ra = lm[LM.R_ANKLE];
    if (!visOk(nose) || !visOk(ls) || !visOk(rs) || !visOk(lh) || !visOk(rh)) continue;
    if (!visOk(la) || !visOk(ra)) continue;
    const ears = [le, re].filter((e): e is Landmark => visOk(e));
    if (!ears.length) continue;
    const earX = ears.reduce((s, e) => s + e.x, 0) / ears.length;
    const torso = Math.hypot((ls.x + rs.x) / 2 - (lh.x + rh.x) / 2, (ls.y + rs.y) / 2 - (lh.y + rh.y) / 2);
    if (torso < 0.05) continue;
    const facing = (nose.x - earX) / torso; // >0: facing image-right
    if (Math.abs(facing) < 0.06) continue;
    const sep = (la.x - ra.x) / torso;
    if (Math.abs(sep) < 0.15) continue;
    const leadIsLeft = facing > 0 ? la.x > ra.x : la.x < ra.x;
    if (leadIsLeft) left++;
    else right++;
  }
  const n = left + right;
  if (n < 6) return null;
  if (left / n >= 0.75) return "left";
  if (right / n >= 0.75) return "right";
  return null;
}

// ---------------------------------------------------------------------------
// Sampling / interpolation
// ---------------------------------------------------------------------------

export type TrackSample = { a: PosedFrame; b: PosedFrame; alpha: number };

/** Index of the last frame with timestamp <= t (or -1). */
export function frameIndexAtOrBefore(frames: PosedFrame[], t: number): number {
  let lo = 0;
  let hi = frames.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (frames[mid]!.timestamp <= t) {
      ans = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return ans;
}

/**
 * The pair of frames bracketing time t plus the blend factor, or null when
 * there is no honest pose at t (before the first frame / after the last by more
 * than half a gap, or inside a pose gap longer than MAX_GAP_SEC).
 */
export function sampleTrack(frames: PosedFrame[], t: number): TrackSample | null {
  if (!frames.length) return null;
  const i = frameIndexAtOrBefore(frames, t);
  const half = MAX_GAP_SEC / 2;
  if (i < 0) {
    const first = frames[0]!;
    return first.timestamp - t <= half ? { a: first, b: first, alpha: 0 } : null;
  }
  const a = frames[i]!;
  if (i === frames.length - 1) {
    return t - a.timestamp <= half ? { a, b: a, alpha: 0 } : null;
  }
  const b = frames[i + 1]!;
  const gap = b.timestamp - a.timestamp;
  if (gap > MAX_GAP_SEC) {
    // Inside a hole: hold the nearer edge only while it is genuinely close.
    if (t - a.timestamp <= half) return { a, b: a, alpha: 0 };
    if (b.timestamp - t <= half) return { a: b, b, alpha: 0 };
    return null;
  }
  return { a, b, alpha: gap > 0 ? (t - a.timestamp) / gap : 0 };
}

export type PosePoints = { x: Float32Array; y: Float32Array; v: Float32Array };

export function makePosePoints(): PosePoints {
  return {
    x: new Float32Array(TRACK_LANDMARKS),
    y: new Float32Array(TRACK_LANDMARKS),
    v: new Float32Array(TRACK_LANDMARKS),
  };
}

/** Blend two frames into a reusable buffer (no per-call allocation). */
export function blendInto(out: PosePoints, s: TrackSample): void {
  const { a, b, alpha } = s;
  for (let i = 0; i < TRACK_LANDMARKS; i++) {
    const la = a.landmarks[i]!;
    const lb = b.landmarks[i]!;
    out.x[i] = la.x + (lb.x - la.x) * alpha;
    out.y[i] = la.y + (lb.y - la.y) * alpha;
    out.v[i] = Math.min(la.visibility, lb.visibility);
  }
}

export const VIS_MIN = 0.3;

/** Draw a skeleton from screen-space points. Cheap: one path per colour. */
export function strokeSkeleton(
  ctx: CanvasRenderingContext2D,
  p: PosePoints,
  color: string,
  lineWidth: number,
  dotRadius: number,
): void {
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = "round";
  ctx.beginPath();
  for (const [a, b] of SKELETON_CONNECTIONS) {
    if (p.v[a]! < VIS_MIN || p.v[b]! < VIS_MIN) continue;
    ctx.moveTo(p.x[a]!, p.y[a]!);
    ctx.lineTo(p.x[b]!, p.y[b]!);
  }
  ctx.stroke();
  ctx.beginPath();
  for (let i = 11; i < TRACK_LANDMARKS; i++) {
    if (p.v[i]! < VIS_MIN) continue;
    ctx.moveTo(p.x[i]! + dotRadius, p.y[i]!);
    ctx.arc(p.x[i]!, p.y[i]!, dotRadius, 0, Math.PI * 2);
  }
  // head: nose only (the face mesh points clutter at phone size)
  if (p.v[LM.NOSE]! >= VIS_MIN) {
    ctx.moveTo(p.x[LM.NOSE]! + dotRadius * 1.4, p.y[LM.NOSE]!);
    ctx.arc(p.x[LM.NOSE]!, p.y[LM.NOSE]!, dotRadius * 1.4, 0, Math.PI * 2);
  }
  ctx.fill();
}

/**
 * Where the video content actually sits inside its element box. A <video> with
 * object-fit: contain letterboxes; landmarks are normalised to the video frame,
 * so the overlay must map into the content rect, not the element box.
 */
export function containRect(
  boxW: number,
  boxH: number,
  contentW: number,
  contentH: number,
): { x: number; y: number; w: number; h: number } {
  if (boxW <= 0 || boxH <= 0 || contentW <= 0 || contentH <= 0) return { x: 0, y: 0, w: boxW, h: boxH };
  const s = Math.min(boxW / contentW, boxH / contentH);
  const w = contentW * s;
  const h = contentH * s;
  return { x: (boxW - w) / 2, y: (boxH - h) / 2, w, h };
}

// ---------------------------------------------------------------------------
// Body regions (finding annotations)
// ---------------------------------------------------------------------------

export const BODY_REGION_LIST = [
  "lead_hand",
  "rear_hand",
  "head",
  "hips",
  "lead_foot",
  "rear_foot",
  "lead_knee",
  "rear_knee",
  "shoulders",
  "torso",
] as const;
export type BodyRegion = (typeof BODY_REGION_LIST)[number];

export function isBodyRegion(v: unknown): v is BodyRegion {
  return typeof v === "string" && (BODY_REGION_LIST as readonly string[]).includes(v);
}

export const REGION_LABEL: Record<BodyRegion, string> = {
  lead_hand: "Lead hand",
  rear_hand: "Rear hand",
  head: "Head",
  hips: "Hips",
  lead_foot: "Lead foot",
  rear_foot: "Rear foot",
  lead_knee: "Lead knee",
  rear_knee: "Rear knee",
  shoulders: "Shoulders",
  torso: "Torso",
};

// BlazePose: left wrist 15 + pinky 17 / index 19 / thumb 21; right 16/18/20/22.
// Left foot ankle 27, heel 29, toe 31; right 28/30/32.
const LEFT_RIGHT_LANDMARKS: Record<"hand" | "foot" | "knee", { left: number[]; right: number[] }> = {
  hand: { left: [15, 17, 19, 21], right: [16, 18, 20, 22] },
  foot: { left: [27, 29, 31], right: [28, 30, 32] },
  knee: { left: [25], right: [26] },
};

/**
 * Landmark indices for a region, or null when the region needs a lead side and
 * the stance side was not measured (then it is never guessed).
 */
export function regionLandmarks(region: BodyRegion, lead: LeadSide | null): number[] | null {
  switch (region) {
    case "head":
      return [0, 2, 5, 7, 8, 9, 10];
    case "hips":
      return [23, 24];
    case "shoulders":
      return [11, 12];
    case "torso":
      return [11, 12, 23, 24];
    default: {
      if (!lead) return null;
      const [kind, part] = region.split("_") as ["lead" | "rear", "hand" | "foot" | "knee"];
      const rear: LeadSide = lead === "left" ? "right" : "left";
      const side = kind === "lead" ? lead : rear;
      return LEFT_RIGHT_LANDMARKS[part][side];
    }
  }
}

export type RegionGeometry = {
  /** Centre in normalised frame coordinates (0..1). */
  cx: number;
  cy: number;
  /** Radius in normalised-y units (aspect-corrected by the caller via w/h). */
  r: number;
  /** Shoulder width in normalised-x units, the movement scale. */
  scale: number;
};

function centroid(lm: Landmark[], idx: number[]): { x: number; y: number; n: number; pts: Landmark[] } | null {
  const pts = idx.map((i) => lm[i]).filter((p): p is Landmark => !!p && p.visibility >= VIS_MIN);
  if (!pts.length) return null;
  return {
    x: pts.reduce((s, p) => s + p.x, 0) / pts.length,
    y: pts.reduce((s, p) => s + p.y, 0) / pts.length,
    n: pts.length,
    pts,
  };
}

function shoulderScale(lm: Landmark[]): number {
  const ls = lm[LM.L_SHOULDER];
  const rs = lm[LM.R_SHOULDER];
  if (!ls || !rs || ls.visibility < VIS_MIN || rs.visibility < VIS_MIN) return 0;
  return Math.hypot(ls.x - rs.x, ls.y - rs.y);
}

/** Ring geometry for a region on one frame, or null if its landmarks aren't visible. */
export function regionGeometry(
  frame: PosedFrame,
  region: BodyRegion,
  lead: LeadSide | null,
  aspect: number,
): RegionGeometry | null {
  const idx = regionLandmarks(region, lead);
  if (!idx) return null;
  const c = centroid(frame.landmarks, idx);
  if (!c) return null;
  // Spread in pixel-ish units (x scaled by aspect so the ring is round on screen).
  let spread = 0;
  for (const p of c.pts) spread = Math.max(spread, Math.hypot((p.x - c.x) * aspect, p.y - c.y));
  const sh = shoulderScale(frame.landmarks);
  const minR = Math.max(0.035, sh * 0.35);
  return { cx: c.x, cy: c.y, r: Math.max(minR, spread + 0.02), scale: sh };
}

export type MovementArrow = { from: { x: number; y: number }; to: { x: number; y: number } };

export const ARROW_LOOKBACK_FRAMES = 3;
// Minimum travel (in shoulder widths) before an arrow is worth drawing.
export const ARROW_MIN_TRAVEL = 0.3;

/**
 * Direction the region was travelling into the keyframe: where its centroid was
 * a few frames earlier -> where it is at the keyframe. Null (no arrow) when the
 * look-back crosses a pose gap, the region wasn't visible, or it barely moved —
 * an arrow is only drawn for movement that was actually measured.
 */
export function movementArrow(
  frames: PosedFrame[],
  keyframeIndex: number,
  region: BodyRegion,
  lead: LeadSide | null,
  aspect: number,
): MovementArrow | null {
  const idx = regionLandmarks(region, lead);
  if (!idx) return null;
  const to = frames[keyframeIndex];
  const fromI = keyframeIndex - ARROW_LOOKBACK_FRAMES;
  if (!to || fromI < 0) return null;
  const from = frames[fromI]!;
  // Any hole in between invalidates the look-back.
  for (let i = fromI + 1; i <= keyframeIndex; i++) {
    if (frames[i]!.timestamp - frames[i - 1]!.timestamp > MAX_GAP_SEC) return null;
  }
  const cTo = centroid(to.landmarks, idx);
  const cFrom = centroid(from.landmarks, idx);
  if (!cTo || !cFrom) return null;
  const scale = shoulderScale(to.landmarks);
  if (scale <= 0) return null;
  const travel = Math.hypot((cTo.x - cFrom.x) * aspect, cTo.y - cFrom.y) / (scale * aspect);
  if (travel < ARROW_MIN_TRAVEL) return null;
  return { from: { x: cFrom.x, y: cFrom.y }, to: { x: cTo.x, y: cTo.y } };
}

/** Nearest posed frame index to a timestamp within tol seconds, else -1. */
export function nearestFrameIndex(frames: PosedFrame[], t: number, tol = 0.05): number {
  let best = -1;
  let bestD = tol + 1e-9;
  const i = frameIndexAtOrBefore(frames, t);
  for (const j of [i, i + 1]) {
    const f = frames[j];
    if (!f) continue;
    const d = Math.abs(f.timestamp - t);
    if (d < bestD) {
      bestD = d;
      best = j;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Normalisation for comparison overlays
// ---------------------------------------------------------------------------

export type NormaliseSpec = { scale: number; w: number; h: number };

/** Median torso length (shoulder-mid -> hip-mid) in pixel units over the track. */
export function medianTorsoPx(track: DecodedTrack): number {
  const xs: number[] = [];
  for (const f of track.frames) {
    const lm = f.landmarks;
    const ls = lm[LM.L_SHOULDER]!;
    const rs = lm[LM.R_SHOULDER]!;
    const lh = lm[LM.L_HIP]!;
    const rh = lm[LM.R_HIP]!;
    if ([ls, rs, lh, rh].some((p) => p.visibility < 0.5)) continue;
    xs.push(
      Math.hypot(
        ((ls.x + rs.x) / 2 - (lh.x + rh.x) / 2) * track.w,
        ((ls.y + rs.y) / 2 - (lh.y + rh.y) / 2) * track.h,
      ),
    );
  }
  if (!xs.length) return 0;
  xs.sort((a, b) => a - b);
  return xs[Math.floor(xs.length / 2)]!;
}

/**
 * Express a frame in "torso units" centred on its own hip midpoint: x/y become
 * (pixel offset from hip centre) / torsoPx, so two athletes filmed at different
 * distances and framings overlay on the same scale. Returns null if the hips
 * aren't visible. Output arrays are written in place (len 33).
 */
export function normaliseFrameInto(
  out: PosePoints,
  frame: PosedFrame,
  spec: NormaliseSpec,
): boolean {
  const lh = frame.landmarks[LM.L_HIP]!;
  const rh = frame.landmarks[LM.R_HIP]!;
  if (lh.visibility < 0.3 || rh.visibility < 0.3 || spec.scale <= 0) return false;
  const hx = ((lh.x + rh.x) / 2) * spec.w;
  const hy = ((lh.y + rh.y) / 2) * spec.h;
  for (let i = 0; i < TRACK_LANDMARKS; i++) {
    const p = frame.landmarks[i]!;
    out.x[i] = (p.x * spec.w - hx) / spec.scale;
    out.y[i] = (p.y * spec.h - hy) / spec.scale;
    out.v[i] = p.visibility;
  }
  return true;
}

/**
 * sampleTrack + blend, but in normalised torso units. `ta`/`tb` are caller-owned
 * scratch buffers so the per-frame draw path allocates nothing. Returns false
 * when there is no honest pose at t.
 */
export function sampleNormalisedInto(
  out: PosePoints,
  ta: PosePoints,
  tb: PosePoints,
  frames: PosedFrame[],
  t: number,
  spec: NormaliseSpec,
): boolean {
  const s = sampleTrack(frames, t);
  if (!s) return false;
  if (!normaliseFrameInto(ta, s.a, spec)) return false;
  if (s.a === s.b || s.alpha === 0 || !normaliseFrameInto(tb, s.b, spec)) {
    out.x.set(ta.x);
    out.y.set(ta.y);
    out.v.set(ta.v);
    return true;
  }
  for (let i = 0; i < TRACK_LANDMARKS; i++) {
    out.x[i] = ta.x[i]! + (tb.x[i]! - ta.x[i]!) * s.alpha;
    out.y[i] = ta.y[i]! + (tb.y[i]! - ta.y[i]!) * s.alpha;
    out.v[i] = Math.min(ta.v[i]!, tb.v[i]!);
  }
  return true;
}

/**
 * Sub-track window [startSec, startSec + lenSec] re-based so its first moment is
 * t = 0 — used to align two reps at their start.
 */
export function windowFrames(frames: PosedFrame[], startSec: number, lenSec: number): PosedFrame[] {
  const out: PosedFrame[] = [];
  for (const f of frames) {
    if (f.timestamp < startSec - 1e-6) continue;
    if (f.timestamp > startSec + lenSec + 1e-6) break;
    out.push({ timestamp: f.timestamp - startSec, landmarks: f.landmarks });
  }
  return out;
}

/** True when a window holds enough pose frames (and no big hole) to be worth playing. */
export function windowIsUsable(win: PosedFrame[], minFrames = 3): boolean {
  if (win.length < minFrames) return false;
  for (let i = 1; i < win.length; i++) {
    if (win[i]!.timestamp - win[i - 1]!.timestamp > MAX_GAP_SEC) return false;
  }
  return true;
}
