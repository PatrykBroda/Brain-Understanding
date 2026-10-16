import {
  OPPONENT_COLOR,
  OPPONENT_HEX,
  YOU_COLOR,
  YOU_HEX,
  medianTorsoPx,
  windowFrames,
  windowIsUsable,
  type DecodedTrack,
  type NormaliseSpec,
  type PosedFrame,
} from "./pose-track";
import type { ReplayMoment } from "./api";

// Pure builders for the Phase 4 comparison lanes (the components just play them).

const GOLD = "rgba(214,160,90,0.95)";
// Blue and red are reserved for "you" and "the opponent" (YOU_COLOR / OPPONENT_COLOR), so
// no other comparison lane may use a blue or a red - violet and amber stand in for them.
const VIOLET = "rgba(183,148,246,0.95)";
const AMBER = "rgba(251,191,36,0.95)";

export function fmtSec(t: number): string {
  return `${Math.max(0, t).toFixed(1)}s`;
}

export type CompareLane = {
  label: string;
  color: string;
  /** Hex/rgb used for the legend swatch (same as `color` minus alpha handling). */
  swatch: string;
  frames: PosedFrame[];
  spec: NormaliseSpec;
};

export function specFor(track: DecodedTrack): NormaliseSpec | null {
  const scale = medianTorsoPx(track);
  return scale > 0 ? { scale, w: track.w, h: track.h } : null;
}


// ---- (a) best rep vs worst rep within this clip -----------------------------

const WIN_LEAD_SEC = 1.0;
const WIN_LEN_SEC = 2.5;

/** The two lanes for best-vs-worst, or null when either moment/window lacks pose data. */
export function buildBestWorstLanes(
  moments: ReplayMoment[],
  track: DecodedTrack | null,
): { lanes: CompareLane[]; duration: number } | null {
  if (!track) return null;
  const best = moments.find((m) => m.role === "best_decision");
  const worst = moments.find((m) => m.role === "worst_habit");
  if (!best || !worst || Math.abs(best.timestamp - worst.timestamp) < 0.5) return null;
  const spec = specFor(track);
  if (!spec) return null;
  const mk = (ts: number) => windowFrames(track.frames, Math.max(0, ts - WIN_LEAD_SEC), WIN_LEN_SEC);
  const wb = mk(best.timestamp);
  const ww = mk(worst.timestamp);
  if (!windowIsUsable(wb) || !windowIsUsable(ww)) return null;
  const duration = Math.min(WIN_LEN_SEC, Math.max(wb[wb.length - 1]!.timestamp, ww[ww.length - 1]!.timestamp));
  return {
    duration,
    lanes: [
      { label: `Best decision · ${fmtSec(best.timestamp)}`, color: "rgba(52,211,153,0.95)", swatch: "#34d399", frames: wb, spec },
      { label: `Worst habit · ${fmtSec(worst.timestamp)}`, color: AMBER, swatch: "#fbbf24", frames: ww, spec },
    ],
  };
}

export function buildSessionLanes(
  current: DecodedTrack,
  previous: DecodedTrack,
  labels: { current: string; previous: string },
  colors?: { current: { color: string; swatch: string }; previous: { color: string; swatch: string } },
): { lanes: CompareLane[]; duration: number } | null {
  const sa = specFor(current);
  const sb = specFor(previous);
  if (!sa || !sb) return null;
  const duration = Math.min(current.endSec, previous.endSec);
  if (!(duration > 0.5)) return null;
  return {
    duration,
    lanes: [
      {
        label: labels.current,
        color: colors?.current.color ?? GOLD,
        swatch: colors?.current.swatch ?? "#d6a05a",
        frames: current.frames,
        spec: sa,
      },
      {
        label: labels.previous,
        color: colors?.previous.color ?? VIOLET,
        swatch: colors?.previous.swatch ?? "#b794f6",
        frames: previous.frames,
        spec: sb,
      },
    ],
  };
}

/**
 * You vs the opponent from ONE two-person clip: both tracks share the clip's
 * clock, so they play in step with no alignment needed. Blue = you, red = them.
 * Null when either side lacks usable pose data.
 */
export function buildSameClipLanes(
  you: DecodedTrack,
  opponent: DecodedTrack,
): { lanes: CompareLane[]; duration: number } | null {
  return buildSessionLanes(
    you,
    opponent,
    { current: "You (blue)", previous: "Opponent (red)" },
    {
      current: { color: YOU_COLOR, swatch: YOU_HEX },
      previous: { color: OPPONENT_COLOR, swatch: OPPONENT_HEX },
    },
  );
}

