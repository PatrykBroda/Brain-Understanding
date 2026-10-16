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
