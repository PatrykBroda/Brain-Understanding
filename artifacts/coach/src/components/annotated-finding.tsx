import { useMemo } from "react";
import { buildFindingVisual } from "@/lib/finding-visual";
import type { DecodedTrack } from "@/lib/pose-track";
import type { AnalysisFinding, AnalysisKeyframe } from "@/lib/api";

const RING = "#d6a05a";
const ARROW = "#7ab8d9";

export function AnnotatedFindingFrame({
  finding,
  keyframes,
  track,
  onJump,
}: {
  finding: AnalysisFinding;
  keyframes: AnalysisKeyframe[];
  track: DecodedTrack | null;
  onJump?: (timestamp: number) => void;
}) {
  const v = useMemo(() => buildFindingVisual(finding, keyframes, track), [finding, keyframes, track]);
  if (!v) return null;
  const sw = 1.5;
  return (
    <figure className="space-y-1.5" data-testid="annotated-finding">
      <div
        className="relative w-full max-w-[520px] border border-border/40 bg-black overflow-hidden rounded-2xl"
        style={{ aspectRatio: String(v.vbW / 100) }}
      >
        <img src={v.keyframe.imageBase64} alt={v.keyframe.caption} className="absolute inset-0 w-full h-full" />
        <svg
          viewBox={`0 0 ${v.vbW} 100`}
          preserveAspectRatio="none"
          className="absolute inset-0 w-full h-full"
          aria-hidden
        >
          <defs>
            <marker id={`ah-${finding.keyframeIndex}`} markerWidth="5" markerHeight="5" refX="3.6" refY="2.5" orient="auto">
              <path d="M0,0 L5,2.5 L0,5 Z" fill={ARROW} />
            </marker>
          </defs>
          {v.arrow && (
            <>
              <circle cx={v.arrow.x1} cy={v.arrow.y1} r={0.9} fill={ARROW} opacity={0.8} />
              <line
                x1={v.arrow.x1}
                y1={v.arrow.y1}
                x2={v.arrow.x2}
                y2={v.arrow.y2}
                stroke="rgba(0,0,0,0.6)"
                strokeWidth={sw + 1.2}
                strokeLinecap="round"
              />
              <line
                x1={v.arrow.x1}
                y1={v.arrow.y1}
                x2={v.arrow.x2}
                y2={v.arrow.y2}
                stroke={ARROW}
                strokeWidth={sw}
                strokeLinecap="round"
                markerEnd={`url(#ah-${finding.keyframeIndex})`}
              />
            </>
          )}
          <circle cx={v.ring.cx} cy={v.ring.cy} r={v.ring.r} fill="none" stroke="rgba(0,0,0,0.6)" strokeWidth={sw + 1.2} />
          <circle cx={v.ring.cx} cy={v.ring.cy} r={v.ring.r} fill="none" stroke={RING} strokeWidth={sw} />
          <text
            x={v.labelPos.x}
            y={v.labelPos.y}
            textAnchor={v.labelPos.anchor}
            fontSize={4.2}
            fontFamily="ui-monospace, monospace"
            letterSpacing={0.4}
            fill={RING}
            stroke="rgba(0,0,0,0.85)"
            strokeWidth={1}
            paintOrder="stroke"
          >
            {v.label}
          </text>
        </svg>
      </div>
      <figcaption className="label leading-relaxed">
        {v.keyframe.timestamp.toFixed(1)}s · {v.keyframe.caption}
        {v.arrow && v.lookbackSec != null
          ? ` · arrow = measured travel over the previous ${v.lookbackSec.toFixed(1)}s`
          : ""}
        {onJump && (
          <button
            type="button"
            onClick={() => onJump(v.keyframe.timestamp)}
            className="ml-2 underline underline-offset-2 text-[#B9A477]"
          >
            jump to moment
          </button>
        )}
      </figcaption>
    </figure>
  );
}
