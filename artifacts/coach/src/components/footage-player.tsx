import { useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play, ScanLine } from "lucide-react";
import {
  blendInto,
  containRect,
  decodePoseTrack,
  makePosePoints,
  sampleTrack,
  strokeSkeleton,
  type DecodedTrack,
  type PosePoints,
} from "@/lib/pose-track";
import type { Playback } from "@/lib/playback";
import type { DetectedEvent, PoseTrackWire, ReplayMoment } from "@/lib/api";

// ---------------------------------------------------------------------------
// Footage visuals: live skeleton overlay on the fresh upload, the "ghost"
// player for saved reports (no video is ever stored), and the event timeline.
// Everything is drawn from the real pose track; time comes from one shared
// Playback clock, written straight to canvas/DOM (no per-frame React state).
// ---------------------------------------------------------------------------

export const SEVERITY_COLOR: Record<DetectedEvent["severity"], string> = {
  high: "#ef4444",
  medium: "#f59e0b",
  low: "#7ab8d9",
};

export const ROLE_COLOR: Record<ReplayMoment["role"], string> = {
  best_decision: "#34d399",
  worst_habit: "#f87171",
  biggest_opportunity: "#d6a05a",
};

const SKELETON_GOLD = "rgba(214,160,90,0.95)";
const GHOST_BG = "#0a0908";

/** Decode the wire track once per object identity. */
export function useDecodedTrack(wire: PoseTrackWire | null | undefined): DecodedTrack | null {
  return useMemo(() => (wire ? decodePoseTrack(wire) : null), [wire]);
}

function fmtTime(t: number): string {
  const s = Math.max(0, t);
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  return `${m}:${r.toFixed(1).padStart(4, "0")}`;
}

/** Size a canvas to its CSS box at devicePixelRatio; returns false if it has no box (hidden). */
function fitCanvas(canvas: HTMLCanvasElement): { w: number; h: number; dpr: number } | null {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (w <= 0 || h <= 0) return null;
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const pw = Math.round(w * dpr);
  const ph = Math.round(h * dpr);
  if (canvas.width !== pw || canvas.height !== ph) {
    canvas.width = pw;
    canvas.height = ph;
  }
  return { w, h, dpr };
}

// requestVideoFrameCallback isn't in older TS DOM libs.
type RVFCVideo = HTMLVideoElement & {
  requestVideoFrameCallback?: (cb: (now: number, meta: { mediaTime: number }) => void) => number;
  cancelVideoFrameCallback?: (id: number) => void;
};

// ---------------------------------------------------------------------------
// Video with live skeleton overlay
// ---------------------------------------------------------------------------

export function SkeletonVideo({
  src,
  track,
  playback,
  skeletonOn,
  className,
  style,
}: {
  src: string;
  track: DecodedTrack | null;
  playback: Playback;
  skeletonOn: boolean;
  className?: string;
  style?: React.CSSProperties;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const onRef = useRef(skeletonOn);
  const redrawRef = useRef<() => void>(() => {});

  useEffect(() => {
    onRef.current = skeletonOn;
    redrawRef.current();
  }, [skeletonOn]);

  useEffect(() => {
    const video = videoRef.current as RVFCVideo | null;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const pts: PosePoints = makePosePoints();
    let disposed = false;
    let rvfcId = 0;
    let rafId = 0;

    const draw = (t: number) => {
      const fit = fitCanvas(canvas);
      if (!fit) return; // layout hidden (the other breakpoint's copy)
      ctx.setTransform(fit.dpr, 0, 0, fit.dpr, 0, 0);
      ctx.clearRect(0, 0, fit.w, fit.h);
      if (!onRef.current || !track) return;
      const s = sampleTrack(track.frames, t);
      if (!s) return; // no honest pose here (lost lock) -> no skeleton
      blendInto(pts, s);
      const r = containRect(fit.w, fit.h, video.videoWidth || track.w, video.videoHeight || track.h);
      for (let i = 0; i < pts.x.length; i++) {
        pts.x[i] = r.x + pts.x[i]! * r.w;
        pts.y[i] = r.y + pts.y[i]! * r.h;
      }
      const lw = Math.max(1.6, r.w / 260);
      const dot = Math.max(2, r.w / 150);
      strokeSkeleton(ctx, pts, "rgba(0,0,0,0.55)", lw + 2.4, dot + 1.2);
      strokeSkeleton(ctx, pts, SKELETON_GOLD, lw, dot);
    };

    const unsub = playback.subscribe(draw);
    redrawRef.current = () => draw(video.currentTime);

    const emitNow = () => playback.emit(video.currentTime);
    const onMeta = () => {
      if (Number.isFinite(video.duration) && video.duration > 0) {
        playback.duration = Math.max(playback.duration, video.duration);
      }
      emitNow();
    };

    // Frame-accurate sync where the browser supports it, rAF otherwise.
    const loopRvfc = (_now: number, meta: { mediaTime: number }) => {
      if (disposed) return;
      playback.emit(meta.mediaTime);
      rvfcId = video.requestVideoFrameCallback!(loopRvfc);
    };
    const loopRaf = () => {
      if (disposed) return;
      if (!video.paused) playback.emit(video.currentTime);
      rafId = requestAnimationFrame(loopRaf);
    };
    if (video.requestVideoFrameCallback) rvfcId = video.requestVideoFrameCallback(loopRvfc);
    else rafId = requestAnimationFrame(loopRaf);

    video.addEventListener("loadedmetadata", onMeta);
    video.addEventListener("seeked", emitNow);
    video.addEventListener("seeking", emitNow);
    video.addEventListener("pause", emitNow);
    video.addEventListener("play", emitNow);
    video.addEventListener("timeupdate", emitNow);
    const ro = new ResizeObserver(() => draw(video.currentTime));
    ro.observe(canvas);
    const unseek = playback.setSeeker((t) => {
      try {
        video.currentTime = t;
      } catch {
        // metadata not ready yet — ignore
      }
    });
    if (video.readyState >= 1) onMeta();

    return () => {
      disposed = true;
      unsub();
      unseek();
      ro.disconnect();
      if (rvfcId && video.cancelVideoFrameCallback) video.cancelVideoFrameCallback(rvfcId);
      if (rafId) cancelAnimationFrame(rafId);
      video.removeEventListener("loadedmetadata", onMeta);
      video.removeEventListener("seeked", emitNow);
      video.removeEventListener("seeking", emitNow);
      video.removeEventListener("pause", emitNow);
      video.removeEventListener("play", emitNow);
      video.removeEventListener("timeupdate", emitNow);
      redrawRef.current = () => {};
    };
  }, [track, playback, src]);

  return (
    <div className="relative w-full" data-testid="skeleton-video">
      <video
        ref={videoRef}
        src={src}
        controls
        playsInline
        className={className}
        style={style}
      />
      <canvas
        ref={canvasRef}
        aria-hidden
        className="absolute inset-0 w-full h-full pointer-events-none"
        data-testid="skeleton-canvas"
      />
    </div>
  );
}

export function SkeletonToggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      aria-pressed={on}
      className={`inline-flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.25em] border px-2.5 py-1.5 transition-colors ${
        on ? "border-primary/60 text-primary/90" : "border-border/50 text-muted-foreground/70"
      }`}
    >
      <ScanLine className="w-3 h-3" strokeWidth={1.5} />
      Skeleton {on ? "on" : "off"}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Ghost player: saved reports have no video, but the track does — replay the
// movement as a skeleton on a dark canvas, on the same clock as the timeline.
// ---------------------------------------------------------------------------

export function GhostPlayer({
  track,
  playback,
  duration,
}: {
  track: DecodedTrack;
  playback: Playback;
  duration: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rangeRef = useRef<HTMLInputElement>(null);
  const timeRef = useRef<HTMLSpanElement>(null);
  const [playing, setPlaying] = useState(false);
  const playingRef = useRef(false);
  const startRef = useRef<() => void>(() => {});
  const stopRef = useRef<() => void>(() => {});
  const endSec = Math.max(duration, track.endSec);
  const aspect = Math.min(1.9, Math.max(0.5, track.w / track.h));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const pts = makePosePoints();
    playback.duration = Math.max(playback.duration, endSec);

    const draw = (t: number) => {
      if (rangeRef.current) rangeRef.current.value = String(t);
      if (timeRef.current) timeRef.current.textContent = `${fmtTime(t)} / ${fmtTime(endSec)}`;
      const fit = fitCanvas(canvas);
      if (!fit) return;
      ctx.setTransform(fit.dpr, 0, 0, fit.dpr, 0, 0);
      ctx.fillStyle = GHOST_BG;
      ctx.fillRect(0, 0, fit.w, fit.h);
      ctx.strokeStyle = "rgba(255,255,255,0.05)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(fit.w / 2, 0);
      ctx.lineTo(fit.w / 2, fit.h);
      ctx.moveTo(0, fit.h * 0.97);
      ctx.lineTo(fit.w, fit.h * 0.97);
      ctx.stroke();
      const s = sampleTrack(track.frames, t);
      if (!s) {
        ctx.fillStyle = "rgba(255,255,255,0.35)";
        ctx.font = "10px ui-monospace, monospace";
        ctx.textAlign = "center";
        ctx.fillText("NO POSE LOCK HERE", fit.w / 2, fit.h / 2);
        return;
      }
      blendInto(pts, s);
      const r = containRect(fit.w, fit.h, track.w, track.h);
      for (let i = 0; i < pts.x.length; i++) {
        pts.x[i] = r.x + pts.x[i]! * r.w;
        pts.y[i] = r.y + pts.y[i]! * r.h;
      }
      const lw = Math.max(1.8, r.w / 200);
      const dot = Math.max(2.2, r.w / 120);
      strokeSkeleton(ctx, pts, SKELETON_GOLD, lw, dot);
    };

    const unsub = playback.subscribe(draw);
    let raf = 0;
    let last = 0;
    const tick = (now: number) => {
      if (!playingRef.current) return;
      const dt = last ? (now - last) / 1000 : 0;
      last = now;
      const next = playback.time + dt;
      if (next >= endSec) {
        playback.emit(endSec);
        playingRef.current = false;
        setPlaying(false);
        return;
      }
      playback.emit(next);
      raf = requestAnimationFrame(tick);
    };
    const start = () => {
      if (playback.time >= endSec - 0.05) playback.emit(0);
      playingRef.current = true;
      last = 0;
      setPlaying(true);
      raf = requestAnimationFrame(tick);
    };
    const stop = () => {
      playingRef.current = false;
      setPlaying(false);
      cancelAnimationFrame(raf);
    };
    startRef.current = start;
    stopRef.current = stop;
    const unseek = playback.setSeeker((t) => playback.emit(t));
    const ro = new ResizeObserver(() => draw(playback.time));
    ro.observe(canvas);
    return () => {
      stop();
      unsub();
      unseek();
      ro.disconnect();
      startRef.current = () => {};
      stopRef.current = () => {};
    };
  }, [track, playback, endSec]);

  return (
    <div className="w-full space-y-2" data-testid="ghost-player">
      <div className="relative w-full border border-border/40 bg-black" style={{ aspectRatio: String(aspect) }}>
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" data-testid="ghost-canvas" />
        <div className="absolute left-2 top-2 font-mono text-[8px] uppercase tracking-[0.3em] text-muted-foreground/70">
          Movement replay · footage not stored
        </div>
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => (playing ? stopRef.current() : startRef.current())}
          aria-label={playing ? "Pause replay" : "Play replay"}
          className="flex-none w-9 h-9 flex items-center justify-center border border-primary/50 text-primary/90 hover:border-primary transition-colors"
        >
          {playing ? <Pause className="w-4 h-4" strokeWidth={1.5} /> : <Play className="w-4 h-4" strokeWidth={1.5} />}
        </button>
        <input
          ref={rangeRef}
          type="range"
          min={0}
          max={endSec}
          step={0.05}
          defaultValue={0}
          onChange={(e) => {
            stopRef.current();
            playback.seek(Number(e.target.value));
          }}
          aria-label="Scrub movement replay"
          className="flex-1 accent-[#d6a05a] h-6"
        />
        <span ref={timeRef} className="flex-none font-mono text-[9px] text-muted-foreground/80 tabular-nums w-[84px] text-right">
          {fmtTime(0)} / {fmtTime(endSec)}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Timeline: detected events (by severity) + Replay moments; tap/click to seek.
// ---------------------------------------------------------------------------

export function FootageTimeline({
  duration,
  events,
  moments,
  playback,
}: {
  duration: number;
  events: DetectedEvent[];
  moments: ReplayMoment[];
  playback: Playback;
}) {
  const barRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<HTMLDivElement>(null);
  const dur = Math.max(duration, 0.1);

  useEffect(() => {
    return playback.subscribe((t) => {
      const el = headRef.current;
      if (el) el.style.left = `${Math.max(0, Math.min(1, t / dur)) * 100}%`;
    });
  }, [playback, dur]);

  function seekFromPointer(clientX: number) {
    const bar = barRef.current;
    if (!bar) return;
    const rect = bar.getBoundingClientRect();
    if (rect.width <= 0) return;
    playback.seek(Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)) * dur);
  }

  if (events.length === 0 && moments.length === 0) return null;

  return (
    <div className="space-y-1.5" data-testid="footage-timeline">
      <div
        ref={barRef}
        role="slider"
        aria-label="Footage timeline"
        aria-valuemin={0}
        aria-valuemax={Math.round(dur)}
        tabIndex={0}
        className="relative h-11 bg-black/50 border border-border/40 select-none cursor-pointer"
        style={{ touchAction: "pan-y" }}
        onPointerDown={(e) => {
          (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
          seekFromPointer(e.clientX);
        }}
        onPointerMove={(e) => {
          if (e.buttons) seekFromPointer(e.clientX);
        }}
      >
        <div className="absolute left-0 right-0 top-1/2 h-px bg-border/50" />
        {events.map((ev, i) => (
          <button
            key={`e${i}`}
            type="button"
            title={`${ev.label} · ${ev.timestamp.toFixed(1)}s`}
            aria-label={`${ev.label} at ${ev.timestamp.toFixed(1)} seconds`}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => playback.seek(ev.timestamp)}
            className="absolute top-0 h-[22px] w-5 -ml-2.5 flex items-center justify-center"
            style={{ left: `${Math.min(100, (ev.timestamp / dur) * 100)}%` }}
            data-testid="timeline-event"
          >
            <span className="block w-[3px] h-4" style={{ background: SEVERITY_COLOR[ev.severity] }} />
          </button>
        ))}
        {moments.map((m, i) => (
          <button
            key={`m${i}`}
            type="button"
            title={`${m.label} · ${m.timestamp.toFixed(1)}s`}
            aria-label={`${m.label} at ${m.timestamp.toFixed(1)} seconds`}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => playback.seek(m.timestamp)}
            className="absolute bottom-0 h-[22px] w-5 -ml-2.5 flex items-center justify-center"
            style={{ left: `${Math.min(100, (m.timestamp / dur) * 100)}%` }}
            data-testid="timeline-moment"
          >
            <span
              className="block w-2.5 h-2.5 rotate-45"
              style={{ background: ROLE_COLOR[m.role], boxShadow: "0 0 0 1px rgba(0,0,0,0.6)" }}
            />
          </button>
        ))}
        <div
          ref={headRef}
          className="absolute top-0 bottom-0 w-px bg-white pointer-events-none"
          style={{ left: 0, boxShadow: "0 0 4px rgba(255,255,255,0.7)" }}
        />
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[8px] uppercase tracking-widest text-muted-foreground/70">
        <span className="inline-flex items-center gap-1">
          <i className="inline-block w-[3px] h-2.5" style={{ background: SEVERITY_COLOR.high }} /> high
        </span>
        <span className="inline-flex items-center gap-1">
          <i className="inline-block w-[3px] h-2.5" style={{ background: SEVERITY_COLOR.medium }} /> medium
        </span>
        <span className="inline-flex items-center gap-1">
          <i className="inline-block w-[3px] h-2.5" style={{ background: SEVERITY_COLOR.low }} /> low
        </span>
        {moments.length > 0 && (
          <span className="inline-flex items-center gap-1">
            <i className="inline-block w-2 h-2 rotate-45" style={{ background: ROLE_COLOR.best_decision }} /> replay moment
          </span>
        )}
        <span className="text-muted-foreground/45">· tap to jump</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The composed block used by both the phone report and the desktop workstation.
// ---------------------------------------------------------------------------

export function FootageBlock({
  videoUrl,
  track,
  events,
  moments,
  durationSec,
  playback,
  videoClassName,
  videoStyle,
}: {
  videoUrl: string | null;
  track: DecodedTrack | null;
  events: DetectedEvent[];
  moments: ReplayMoment[];
  durationSec: number;
  playback: Playback;
  videoClassName?: string;
  videoStyle?: React.CSSProperties;
}) {
  const [skeletonOn, setSkeletonOn] = useState(true);
  const duration = Math.max(durationSec, track?.endSec ?? 0);

  // Make sure the shared clock knows how long the read is, even before the
  // video's own metadata arrives.
  useEffect(() => {
    playback.duration = Math.max(playback.duration, duration);
  }, [playback, duration]);

  if (!videoUrl && !track) return null;

  return (
    <div className="space-y-2.5" data-testid="footage-block">
      {videoUrl ? (
        <SkeletonVideo
          src={videoUrl}
          track={track}
          playback={playback}
          skeletonOn={skeletonOn}
          className={videoClassName}
          style={videoStyle}
        />
      ) : track ? (
        <GhostPlayer track={track} playback={playback} duration={duration} />
      ) : null}
      {videoUrl && track && (
        <div className="flex items-center justify-between gap-3">
          <SkeletonToggle on={skeletonOn} onChange={setSkeletonOn} />
          <span className="font-mono text-[8px] uppercase tracking-widest text-muted-foreground/55 text-right">
            measured pose · drawn live
          </span>
        </div>
      )}
      <FootageTimeline duration={duration} events={events} moments={moments} playback={playback} />
    </div>
  );
}
