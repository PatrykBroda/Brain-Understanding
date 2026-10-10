import {
  isBodyRegion,
  movementArrow,
  nearestFrameIndex,
  regionGeometry,
  REGION_LABEL,
  type DecodedTrack,
} from "./pose-track";
import type { AnalysisFinding, AnalysisKeyframe } from "./api";

export type FindingVisual = {
  keyframe: AnalysisKeyframe;
  /** viewBox units: x spans 0..aspect*100, y spans 0..100 so circles stay round. */
  vbW: number;
  ring: { cx: number; cy: number; r: number };
  arrow: { x1: number; y1: number; x2: number; y2: number } | null;
  label: string;
  labelPos: { x: number; y: number; anchor: "start" | "end" };
  lookbackSec: number | null;
};

/**
 * Work out what to draw for a finding, entirely from real data: the stored
 * keyframe, the pose-track frame at that keyframe's timestamp (landmarks), and
 * the frames just before it (movement arrow). Returns null — draw nothing —
 * unless every piece exists; a finding never gets a decorative guess.
 */
export function buildFindingVisual(
  finding: AnalysisFinding,
  keyframes: AnalysisKeyframe[],
  track: DecodedTrack | null,
): FindingVisual | null {
  if (!track || finding.keyframeIndex == null || !isBodyRegion(finding.bodyRegion)) return null;
  const keyframe = keyframes[finding.keyframeIndex];
  if (!keyframe || !keyframe.imageBase64) return null;
  const idx = nearestFrameIndex(track.frames, keyframe.timestamp, 0.05);
  if (idx < 0) return null;
  const aspect = track.w / track.h;
  const geo = regionGeometry(track.frames[idx]!, finding.bodyRegion, track.lead, aspect);
  if (!geo) return null;

  const vbW = aspect * 100;
  // Floor the ring so it stays legible on a phone-sized thumbnail.
  const ring = { cx: geo.cx * vbW, cy: geo.cy * 100, r: Math.max(geo.r * 100, 6) };
  const a = movementArrow(track.frames, idx, finding.bodyRegion, track.lead, aspect);
  const arrow = a
    ? { x1: a.from.x * vbW, y1: a.from.y * 100, x2: a.to.x * vbW, y2: a.to.y * 100 }
    : null;
  const lookbackSec =
    a && idx >= 3 ? track.frames[idx]!.timestamp - track.frames[idx - 3]!.timestamp : null;

  // Put the label on whichever side of the ring has room.
  const roomRight = vbW - (ring.cx + ring.r);
  const onRight = roomRight > ring.cx - ring.r;
  const labelY = ring.cy - ring.r - 2 > 6 ? ring.cy - ring.r - 2 : ring.cy + ring.r + 5;
  return {
    keyframe,
    vbW,
    ring,
    arrow,
    label: REGION_LABEL[finding.bodyRegion].toUpperCase(),
    labelPos: {
      x: onRight ? Math.min(vbW - 1, ring.cx + ring.r * 0.2) : Math.max(1, ring.cx - ring.r * 0.2),
      y: labelY,
      anchor: onRight ? "start" : "end",
    },
    lookbackSec,
  };
}
