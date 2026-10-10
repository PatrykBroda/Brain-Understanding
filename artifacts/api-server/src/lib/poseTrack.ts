import type { PoseTrack } from "@workspace/db";

// Server side of the compact pose-track wire format (v1). The browser quantises
// the per-frame BlazePose landmarks (see artifacts/coach/src/lib/pose-track.ts —
// that file owns the layout and a contract test keeps the two in step). The
// server never needs the coordinates themselves, only to refuse anything that is
// not exactly a well-formed track of a sane size, so it validates structure and
// byte length and re-builds a clean object rather than trusting the payload.

export const POSE_TRACK_VERSION = 1;
export const POSE_LANDMARKS = 33;
export const POSE_BYTES_PER_FRAME = POSE_LANDMARKS * 5; // x u16, y u16, vis u8
export const POSE_TRACK_MAX_FRAMES = 400;
export const POSE_TRACK_MAX_MS = 3_600_000;
// Hard ceiling on the persisted size (base64 payload + timestamp array).
export const POSE_TRACK_MAX_BYTES = 150_000;

const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/;

function isInt(v: unknown, min: number, max: number): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;
}

/**
 * Validate + canonicalise an untrusted pose track. Returns null for anything
 * missing, oversize or malformed (the analysis is still saved, just without a
 * track — it then renders exactly like a pre-track analysis). Pure.
 */
export function sanitisePoseTrack(input: unknown): PoseTrack | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const it = input as Record<string, unknown>;
  if (it["v"] !== POSE_TRACK_VERSION) return null;
  if (!isInt(it["w"], 16, 8192) || !isInt(it["h"], 16, 8192)) return null;

  const leadRaw = it["lead"];
  if (leadRaw !== "left" && leadRaw !== "right" && leadRaw !== null && leadRaw !== undefined) {
    return null;
  }
  const lead = leadRaw === "left" || leadRaw === "right" ? leadRaw : null;

  const t = it["t"];
  if (!Array.isArray(t) || t.length < 3 || t.length > POSE_TRACK_MAX_FRAMES) return null;
  let prev = -1;
  for (const ms of t) {
    if (!isInt(ms, 0, POSE_TRACK_MAX_MS) || ms <= prev) return null;
    prev = ms;
  }

  const d = it["d"];
  if (typeof d !== "string" || d.length === 0) return null;
  // Cheap size gate BEFORE decoding anything.
  if (d.length + t.length * 8 > POSE_TRACK_MAX_BYTES) return null;
  if (d.length % 4 !== 0 || !BASE64_RE.test(d)) return null;
  const decodedLen = Buffer.from(d, "base64").length;
  if (decodedLen !== t.length * POSE_BYTES_PER_FRAME) return null;

  return { v: 1, w: it["w"] as number, h: it["h"] as number, lead, t: t.slice() as number[], d };
}

/** True when the track has a pose frame within `tolSec` of `timestampSec`. */
export function trackHasFrameNear(
  track: PoseTrack | null,
  timestampSec: number,
  tolSec = 0.05,
): boolean {
  if (!track) return false;
  const ms = timestampSec * 1000;
  return track.t.some((x) => Math.abs(x - ms) <= tolSec * 1000);
}
