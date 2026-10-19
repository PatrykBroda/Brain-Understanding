import { analyseFrame, shoulderFloor, wristDrops } from "./analysis-metrics";
import { LM, MAX_GAP_SEC, type LeadSide, type PosedFrame } from "./pose-track";
import type { Landmark } from "./pose";

// ---------------------------------------------------------------------------
// Per-frame movement series for the graphs. Every series is derived from the
// pose track with the SAME definitions the scores use (analysis-metrics.ts), so
// a graph can never disagree with the number it explains. A frame where a value
// can't be measured is a null, and a hole in the track becomes a null row —
// the chart breaks the line there instead of interpolating across it.
// ---------------------------------------------------------------------------

export type SeriesLine = { key: string; label: string; color: string };

export type SeriesDef = {
  key: "hands" | "stance" | "level" | "lean";
  title: string;
  /** What the axis means, in plain words. */
  axis: string;
  /** Which direction is "good"/"worse" so the chart can say so. */
  hint: string;
  lines: SeriesLine[];
  /** Fixed y-domain when the quantity has a natural range. */
  domain?: [number, number];
  /** y value to draw a reference line at (e.g. the shoulder line). */
  reference?: { y: number; label: string };
};

export type SeriesRow = { t: number } & Record<string, number | null>;

export type Series = { def: SeriesDef; rows: SeriesRow[]; hasData: boolean };

const GOLD = "#d6a05a";
const STEEL = "#7ab8d9";

function vis(lm: Landmark | undefined, min = 0.3): lm is Landmark {
  return !!lm && lm.visibility >= min;
}

function torsoLen(lm: Landmark[]): number | null {
  const ls = lm[LM.L_SHOULDER];
  const rs = lm[LM.R_SHOULDER];
  const lh = lm[LM.L_HIP];
  const rh = lm[LM.R_HIP];
  if (!vis(ls) || !vis(rs) || !vis(lh) || !vis(rh)) return null;
  const len = Math.hypot((ls.x + rs.x) / 2 - (lh.x + rh.x) / 2, (ls.y + rs.y) / 2 - (lh.y + rh.y) / 2);
  return len > 0.04 ? len : null;
}

/** Hip-midpoint height (normalised y; larger = lower in frame). */
function hipY(lm: Landmark[]): number | null {
  const lh = lm[LM.L_HIP];
  const rh = lm[LM.R_HIP];
  if (!vis(lh) || !vis(rh)) return null;
  return (lh.y + rh.y) / 2;
}

/**
 * Torso lean from vertical in degrees. 0 = upright; positive = the shoulders
 * are to the RIGHT of the hips in the picture, negative = to the left. (Picture
 * side, not "forward", because forward depends on camera angle.)
 */
export function torsoLeanDeg(lm: Landmark[]): number | null {
  const ls = lm[LM.L_SHOULDER];
  const rs = lm[LM.R_SHOULDER];
  const lh = lm[LM.L_HIP];
  const rh = lm[LM.R_HIP];
  if (!vis(ls) || !vis(rs) || !vis(lh) || !vis(rh)) return null;
  const dx = (ls.x + rs.x) / 2 - (lh.x + rh.x) / 2;
  const dy = (lh.y + rh.y) / 2 - (ls.y + rs.y) / 2; // up is positive
  if (Math.hypot(dx, dy) < 0.04) return null;
  const deg = (Math.atan2(dx, dy) * 180) / Math.PI;
  // Shoulders BELOW the hips (past horizontal) is an upside-down skeleton, not a lean.
  return Math.abs(deg) <= 90 ? deg : null;
}

/** Insert a null row wherever the track has a hole so lines break there. */
function withGaps(frames: PosedFrame[], keys: string[], values: (f: PosedFrame) => (number | null)[]): SeriesRow[] {
  const rows: SeriesRow[] = [];
  let prevT: number | null = null;
  for (const f of frames) {
    if (prevT != null && f.timestamp - prevT > MAX_GAP_SEC) {
      const gap: SeriesRow = { t: prevT + (f.timestamp - prevT) / 2 };
      for (const k of keys) gap[k] = null;
      rows.push(gap);
    }
    const v = values(f);
    const row: SeriesRow = { t: f.timestamp };
    keys.forEach((k, i) => {
      const x = v[i];
      row[k] = x != null && Number.isFinite(x) ? x : null;
    });
    rows.push(row);
    prevT = f.timestamp;
  }
  return rows;
}

function anyValue(rows: SeriesRow[], keys: string[]): boolean {
  return rows.some((r) => keys.some((k) => r[k] != null));
}

function median(xs: number[]): number {
  const s = xs.slice().sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)]! : 0;
}

/**
 * Build the four movement series. `lead` only changes labels: when the stance
 * side was measured the two hands read "Lead hand"/"Rear hand", otherwise they
 * are honestly "Left hand"/"Right hand" (the person's own sides).
 */
export function computeSeries(frames: PosedFrame[], lead: LeadSide | null): Series[] {
  if (!frames.length) return [];
  // Same foreshortening floor the scores use (computeMetrics), so a glitch frame
  // is a gap in the graph exactly where it is excluded from the score.
  const shoulderMin = shoulderFloor(frames);

  // Which wrist is lead/rear (only if measured).
  const leadKey = lead === "left" ? "left" : lead === "right" ? "right" : null;
  const handLines: SeriesLine[] = leadKey
    ? [
        { key: "lead", label: "Lead hand", color: GOLD },
        { key: "rear", label: "Rear hand", color: STEEL },
      ]
    : [
        { key: "left", label: "Left hand", color: GOLD },
        { key: "right", label: "Right hand", color: STEEL },
      ];
  const handKeys = handLines.map((l) => l.key);

  const handRows = withGaps(frames, handKeys, (f) => {
    const d = wristDrops(f.landmarks, shoulderMin);
    // Height above the shoulder line (so UP is up): the negative of the drop.
    const left = d.left != null ? -d.left : null;
    const right = d.right != null ? -d.right : null;
    return leadKey === "left"
      ? [left, right]
      : leadKey === "right"
        ? [right, left]
        : [left, right];
  });

  const stanceRows = withGaps(frames, ["stance"], (f) => [analyseFrame(f.landmarks, shoulderMin).stance]);

  const hipYs = frames.map((f) => hipY(f.landmarks)).filter((y): y is number => y != null);
  const baseHip = median(hipYs);
  const levelRows = withGaps(frames, ["level"], (f) => {
    const y = hipY(f.landmarks);
    const torso = torsoLen(f.landmarks);
    if (y == null || torso == null) return [null];
    // Higher = standing taller than the clip's typical hip height; lower = level change.
    return [-(y - baseHip) / torso];
  });

  const leanRows = withGaps(frames, ["lean"], (f) => [torsoLeanDeg(f.landmarks)]);

  const series: Series[] = [
    {
      def: {
        key: "hands",
        title: "Hand height",
        axis: "shoulder widths above the shoulder line",
        hint: "Above 0 = hands up. Below 0 = guard dropped.",
        lines: handLines,
        reference: { y: 0, label: "shoulder line" },
      },
      rows: handRows,
      hasData: anyValue(handRows, handKeys),
    },
    {
      def: {
        key: "stance",
        title: "Stance width",
        axis: "foot gap in shoulder widths",
        hint: "Narrow base = less margin under pressure.",
        lines: [{ key: "stance", label: "Stance", color: GOLD }],
      },
      rows: stanceRows,
      hasData: anyValue(stanceRows, ["stance"]),
    },
    {
      def: {
        key: "level",
        title: "Level change",
        axis: "torso lengths vs your typical hip height",
        hint: "Above 0 = taller than usual, below 0 = sunk or dropped.",
        lines: [{ key: "level", label: "Hip height", color: GOLD }],
        reference: { y: 0, label: "typical" },
      },
      rows: levelRows,
      hasData: anyValue(levelRows, ["level"]),
    },
    {
      def: {
        key: "lean",
        title: "Torso lean",
        axis: "degrees from upright (+ = shoulders right of hips in frame)",
        hint: "0 = stacked over the hips.",
        lines: [{ key: "lean", label: "Lean", color: GOLD }],
        reference: { y: 0, label: "upright" },
      },
      rows: leanRows,
      hasData: anyValue(leanRows, ["lean"]),
    },
  ];
  return series.filter((s) => s.hasData);
}
