import { useEffect, useMemo, useRef } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";
import { computeSeries, type Series } from "@/lib/movement-series";
import type { DecodedTrack } from "@/lib/pose-track";
import type { Playback } from "@/lib/playback";
import type { DetectedEvent } from "@/lib/api";
import { SEVERITY_COLOR } from "@/components/footage-player";

// Half-width (s) of the shaded window drawn around a detected event. Events are
// single sampled frames, so the band just needs to be wide enough to read.
const EVENT_HALF_WINDOW = 0.4;

const Y_AXIS_WIDTH = 34;
const MARGIN = { top: 6, right: 8, bottom: 2, left: 0 };

function SeriesChart({
  series,
  events,
  duration,
  playback,
}: {
  series: Series;
  events: DetectedEvent[];
  duration: number;
  playback: Playback;
}) {
  const { def, rows } = series;
  const plotRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    return playback.subscribe((t) => {
      const el = headRef.current;
      if (el) el.style.left = `${Math.max(0, Math.min(1, t / duration)) * 100}%`;
    });
  }, [playback, duration]);

  function seekFromPointer(clientX: number) {
    const el = plotRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0) return;
    playback.seek(Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)) * duration);
  }

  return (
    <div className="space-y-1" data-testid={`graph-${def.key}`}>
      <div className="flex items-baseline justify-between gap-3">
        <div className="font-mono text-[9px] uppercase tracking-[0.25em] text-foreground/80">{def.title}</div>
        <div className="flex items-center gap-3">
          {def.lines.length > 1 &&
            def.lines.map((l) => (
              <span
                key={l.key}
                className="inline-flex items-center gap-1 font-mono text-[8px] uppercase tracking-widest text-muted-foreground/80"
              >
                <i className="inline-block w-3 h-[2px]" style={{ background: l.color }} />
                {l.label}
              </span>
            ))}
        </div>
      </div>
      <div className="relative w-full" style={{ height: 112 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={MARGIN}>
            <XAxis type="number" dataKey="t" domain={[0, duration]} hide allowDataOverflow />
            <YAxis
              width={Y_AXIS_WIDTH}
              domain={def.domain ?? ["auto", "auto"]}
              tick={{ fontSize: 9, fill: "rgba(255,255,255,0.45)" }}
              tickFormatter={(v: number) => (Math.abs(v) >= 10 ? v.toFixed(0) : v.toFixed(1))}
              axisLine={false}
              tickLine={false}
              tickCount={4}
            />
            {events.map((e, i) => (
              <ReferenceArea
                key={i}
                x1={Math.max(0, e.timestamp - EVENT_HALF_WINDOW)}
                x2={Math.min(duration, e.timestamp + EVENT_HALF_WINDOW)}
                fill={SEVERITY_COLOR[e.severity]}
                fillOpacity={0.2}
                stroke="none"
                ifOverflow="hidden"
              />
            ))}
            {def.reference && (
              <ReferenceLine y={def.reference.y} stroke="rgba(255,255,255,0.3)" strokeDasharray="3 3" />
            )}
            {def.lines.map((l) => (
              <Line
                key={l.key}
                dataKey={l.key}
                stroke={l.color}
                strokeWidth={1.6}
                dot={{ r: 1.6, fill: l.color, strokeWidth: 0 }}
                activeDot={false}
                connectNulls={false}
                isAnimationActive={false}
                type="linear"
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
        {/* Click/drag surface + playhead, aligned to the plot area. */}
        <div
          ref={plotRef}
          className="absolute cursor-pointer"
          style={{
            left: Y_AXIS_WIDTH + MARGIN.left,
            right: MARGIN.right,
            top: MARGIN.top,
            bottom: MARGIN.bottom,
            touchAction: "pan-y",
          }}
          onPointerDown={(e) => {
            (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
            seekFromPointer(e.clientX);
          }}
          onPointerMove={(e) => {
            if (e.buttons) seekFromPointer(e.clientX);
          }}
          data-testid="graph-surface"
        >
          <div
            ref={headRef}
            className="absolute top-0 bottom-0 w-px bg-white pointer-events-none"
            style={{ left: 0, boxShadow: "0 0 4px rgba(255,255,255,0.7)" }}
          />
        </div>
      </div>
      <div className="font-mono text-[8px] tracking-wide text-muted-foreground/60 leading-snug">
        {def.axis} · {def.hint}
      </div>
    </div>
  );
}

export function MovementGraphs({
  track,
  events,
  durationSec,
  playback,
}: {
  track: DecodedTrack;
  events: DetectedEvent[];
  durationSec: number;
  playback: Playback;
}) {
  const series = useMemo(() => computeSeries(track.frames, track.lead), [track]);
  const duration = Math.max(durationSec, track.endSec, 0.5);
  if (series.length === 0) return null;
  const hasEvents = events.length > 0;

  return (
    <section className="space-y-4" data-testid="movement-graphs">
      <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground border-b border-border/40 pb-1.5">
        Movement over time
      </div>
      {series.map((s) => (
        <SeriesChart key={s.def.key} series={s} events={events} duration={duration} playback={playback} />
      ))}
      <div className="flex items-center justify-between font-mono text-[8px] uppercase tracking-widest text-muted-foreground/55">
        <span>0s</span>
        <span>{duration.toFixed(0)}s</span>
      </div>
      <p className="font-mono text-[8px] uppercase tracking-widest text-muted-foreground/55 leading-relaxed">
        every line is measured from the tracked pose, same definitions as the scores
        {hasEvents ? " · shaded bands are detected events" : ""} · breaks in a line = pose lock lost, nothing is
        filled in · tap or drag to jump
      </p>
    </section>
  );
}
