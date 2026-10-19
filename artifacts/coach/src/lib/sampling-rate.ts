// Adaptive play-through speed for pose extraction. The sampler takes one pose
// reading per SAMPLE_INTERVAL of *media* time; if a reading costs more wall time
// than the video advances in that interval, frames are skipped and the clip
// comes out sparse (and varies run to run). So the speed follows the measured
// cost per reading: fast devices keep MAX_RATE, slow ones slow the video down
// until every sample slot is hit.
export const MIN_RATE = 0.25;
export const MAX_RATE = 2;
const HEADROOM = 0.7; // spend at most 70% of a sample slot on one reading

/** Smoothed cost (ms) of one reading, given the previous estimate (null = none yet). */
export function smoothCost(prevMs: number | null, costMs: number): number {
  if (!Number.isFinite(costMs) || costMs < 0) return prevMs ?? 0;
  return prevMs == null ? costMs : prevMs * 0.6 + costMs * 0.4;
}

/** Playback rate at which one reading of `costMs` fits inside one sample slot. */
export function playbackRateFor(costMs: number, sampleIntervalSec: number): number {
  if (!Number.isFinite(costMs) || costMs <= 0) return MAX_RATE;
  const r = (sampleIntervalSec * 1000 * HEADROOM) / costMs;
  return Math.max(MIN_RATE, Math.min(MAX_RATE, r));
}

/**
 * MediaPipe's VIDEO mode wants strictly increasing timestamps and uses their DIFFERENCES for
 * landmark smoothing. The landmarker is reused across analyses, so each clip's timeline is laid
 * after everything already fed to it (`base`) instead of being clamped to last+1ms - which gave
 * every second analysis in a tab (and the first seconds after a warm-up) a ~1ms frame interval and
 * heavily over-smoothed, lagging landmarks.
 */
export function timelineBase(lastTs: number): number {
  return lastTs + 1000;
}

/** Timestamp (ms) to feed for a frame at `mediaTime` s on a timeline starting at `base`; never below last+1. */
export function frameTimestamp(lastTs: number, base: number, mediaTime: number): number {
  return Math.max(lastTs + 1, base + Math.round(mediaTime * 1000));
}

/** Timestamp for the warm-up inference: after everything fed so far but before any real frame of this clip. */
export function warmupTimestamp(base: number): number {
  return base - 500;
}
