import { useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import {
  makePosePoints,
  sampleNormalisedInto,
  sampleTrack,
  strokeSkeleton,
  type DecodedTrack,
} from "@/lib/pose-track";
import { buildBestWorstLanes, buildSessionLanes, fmtSec, type CompareLane } from "@/lib/pose-compare";
import { Playback } from "@/lib/playback";
import { useCompareTrack } from "@/hooks/use-analysis";
import { useDecodedTrack } from "@/components/footage-player";
import type { VideoAnalysis } from "@/lib/api";

// ---------------------------------------------------------------------------
// Phase 4 comparisons. Every lane is a REAL slice of a stored pose track,
// normalised by torso length and centred on its own hip midpoint so two
// different clips/framings are comparable as POSTURE and MOVEMENT (not as
// position in frame). A comparison that lacks data for either side isn't shown.
// ---------------------------------------------------------------------------

const BG = "#0a0908";

function CompareStage({
  lanes,
  layout,
  duration,
  testId,
}: {
  lanes: CompareLane[];
  layout: "overlay" | "side";
  duration: number;
  testId: string;
}) {
  const playback = useMemo(() => new Playback(), []);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rangeRef = useRef<HTMLInputElement>(null);
  const timeRef = useRef<HTMLSpanElement>(null);
  const [playing, setPlaying] = useState(false);
  const [slow, setSlow] = useState(false);
  const playingRef = useRef(false);
  const slowRef = useRef(false);
  const ctlRef = useRef<{ start: () => void; stop: () => void }>({ start: () => {}, stop: () => {} });
  slowRef.current = slow;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const out = makePosePoints();
    const ta = makePosePoints();
    const tb = makePosePoints();

    const draw = (t: number) => {
      if (rangeRef.current) rangeRef.current.value = String(t);
      if (timeRef.current) timeRef.current.textContent = `${fmtSec(t)} / ${fmtSec(duration)}`;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (w <= 0 || h <= 0) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = BG;
      ctx.fillRect(0, 0, w, h);

      const cols = layout === "side" ? lanes.length : 1;
      const cellW = w / cols;
      const unit = Math.min(h / 4.0, cellW / 3.2);
      const originY = h * 0.46;
      // faint hip-centre cross(es)
      ctx.strokeStyle = "rgba(255,255,255,0.06)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let c = 0; c < cols; c++) {
        const cx = cellW * (c + 0.5);
        ctx.moveTo(cx, 0);
        ctx.lineTo(cx, h);
      }
      ctx.moveTo(0, originY);
      ctx.lineTo(w, originY);
      if (layout === "side") {
        ctx.moveTo(cellW, 0);
        ctx.lineTo(cellW, h);
      }
      ctx.stroke();

      lanes.forEach((lane, li) => {
        if (!sampleNormalisedInto(out, ta, tb, lane.frames, t, lane.spec)) return;
        const cx = layout === "side" ? cellW * (li + 0.5) : w / 2;
        for (let i = 0; i < out.x.length; i++) {
          out.x[i] = cx + out.x[i]! * unit;
          out.y[i] = originY + out.y[i]! * unit;
        }
        strokeSkeleton(ctx, out, lane.color, Math.max(1.8, unit / 28), Math.max(2.2, unit / 22));
      });
    };

    playback.reset(duration);
    // Open on the first moment every lane actually has a pose (a clip rarely
    // locks on at exactly 0:00) so the first frame is never an empty canvas.
    let startAt = 0;
    for (let t = 0; t <= duration; t += 0.1) {
      if (lanes.every((l) => sampleTrack(l.frames, t) != null)) {
        startAt = t;
        break;
      }
    }
    const unsub = playback.subscribe(draw);
    playback.emit(startAt);
    let raf = 0;
    let last = 0;
    const tick = (now: number) => {
      if (!playingRef.current) return;
      const dt = last ? ((now - last) / 1000) * (slowRef.current ? 0.5 : 1) : 0;
      last = now;
      const next = playback.time + dt;
      if (next >= duration) {
        playback.emit(duration);
        playingRef.current = false;
        setPlaying(false);
        return;
      }
      playback.emit(next);
      raf = requestAnimationFrame(tick);
    };
    ctlRef.current = {
      start: () => {
        if (playback.time >= duration - 0.05) playback.emit(0);
        playingRef.current = true;
        last = 0;
        setPlaying(true);
        raf = requestAnimationFrame(tick);
      },
      stop: () => {
        playingRef.current = false;
        setPlaying(false);
        cancelAnimationFrame(raf);
      },
    };
    const unseek = playback.setSeeker((t) => playback.emit(t));
    const ro = new ResizeObserver(() => draw(playback.time));
    ro.observe(canvas);
    return () => {
      ctlRef.current.stop();
      unsub();
      unseek();
      ro.disconnect();
    };
  }, [lanes, layout, duration, playback]);

  return (
    <div className="space-y-2" data-testid={testId}>
      <div
        className="relative w-full border border-border/40 bg-black"
        style={{ aspectRatio: layout === "side" ? "16 / 9" : "4 / 3" }}
      >
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        {lanes.map((l) => (
          <span
            key={l.label}
            className="inline-flex items-center gap-1.5 font-mono text-[8px] uppercase tracking-widest text-muted-foreground/85"
          >
            <i className="inline-block w-3.5 h-[3px]" style={{ background: l.swatch }} />
            {l.label}
          </span>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => (playing ? ctlRef.current.stop() : ctlRef.current.start())}
          aria-label={playing ? "Pause comparison" : "Play comparison"}
          className="flex-none w-9 h-9 flex items-center justify-center border border-primary/50 text-primary/90 hover:border-primary transition-colors"
        >
          {playing ? <Pause className="w-4 h-4" strokeWidth={1.5} /> : <Play className="w-4 h-4" strokeWidth={1.5} />}
        </button>
        <input
          ref={rangeRef}
          type="range"
          min={0}
          max={duration}
          step={0.05}
          defaultValue={0}
          onChange={(e) => {
            ctlRef.current.stop();
            playback.seek(Number(e.target.value));
          }}
          aria-label="Scrub comparison"
          className="flex-1 min-w-0 accent-[#d6a05a] h-6"
        />
        <button
          type="button"
          onClick={() => setSlow((s) => !s)}
          aria-pressed={slow}
          className={`flex-none font-mono text-[9px] uppercase tracking-widest border px-2 py-2 ${
            slow ? "border-primary/60 text-primary/90" : "border-border/50 text-muted-foreground/70"
          }`}
        >
          0.5x
        </button>
        <span ref={timeRef} className="flex-none font-mono text-[9px] text-muted-foreground/80 tabular-nums flex-none text-right whitespace-nowrap">
          0.0s / {fmtSec(duration)}
        </span>
      </div>
    </div>
  );
}

function Block({ title, note, children }: { title: string; note: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2.5 border border-border/40 bg-black/20 p-3">
      <div className="space-y-0.5">
        <div className="font-mono text-[9px] uppercase tracking-[0.25em] text-foreground/85">{title}</div>
        <p className="font-mono text-[8px] tracking-wide text-muted-foreground/60 leading-relaxed">{note}</p>
      </div>
      {children}
    </div>
  );
}

function BestVsWorst({ analysis, track }: { analysis: VideoAnalysis; track: DecodedTrack | null }) {
  const built = useMemo(() => buildBestWorstLanes(analysis.replayMoments ?? [], track), [analysis.replayMoments, track]);
  if (!built) return null;
  return (
    <Block
      title="Best rep vs worst rep"
      note="Your best-decision and worst-habit moments from this clip, each starting 1s before the moment and played together. Scaled to torso size and centred on the hips."
    >
      <CompareStage lanes={built.lanes} layout="overlay" duration={built.duration} testId="compare-best-worst" />
    </Block>
  );
}

// ---- (b) this session vs the previous saved analysis of the same kind -------

function dateLabel(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

function VsPreviousSession({ analysis, track }: { analysis: VideoAnalysis; track: DecodedTrack | null }) {
  const { data } = useCompareTrack(analysis.id, !!track && analysis.subject !== "opponent");
  const baselineTrack = useDecodedTrack(data?.baseline?.poseTrack ?? null);
  const built = useMemo(() => {
    if (!track || !baselineTrack || !data?.baseline) return null;
    return buildSessionLanes(
      track,
      baselineTrack,
      { current: "This session", previous: `${data.baseline.kind} · ${dateLabel(data.baseline.createdAt)}` },
    );
  }, [track, baselineTrack, data]);
  if (!built) return null;
  return (
    <Block
      title="This session vs last time"
      note={`Overlaid with your previous ${data!.baseline!.kind} read, both starting at 0:00, scaled to torso size and centred on the hips — posture and movement, not position in frame.`}
    >
      <CompareStage lanes={built.lanes} layout="overlay" duration={built.duration} testId="compare-previous" />
    </Block>
  );
}

export function PoseComparisons({ analysis, track }: { analysis: VideoAnalysis; track: DecodedTrack | null }) {
  if (!track) return null;
  return (
    <div className="space-y-4" data-testid="pose-comparisons">
      <BestVsWorst analysis={analysis} track={track} />
      <VsPreviousSession analysis={analysis} track={track} />
    </div>
  );
}

// ---- (c) Opponent Mode: athlete vs opponent, side by side -------------------

export function AthleteVsOpponent({ analysis }: { analysis: VideoAnalysis }) {
  const oppTrack = useDecodedTrack(analysis.poseTrack ?? null);
  const { data } = useCompareTrack(analysis.id, !!oppTrack);
  const athleteTrack = useDecodedTrack(data?.baseline?.poseTrack ?? null);
  const built = useMemo(() => {
    if (!oppTrack || !athleteTrack || !data?.baseline) return null;
    return buildSessionLanes(athleteTrack, oppTrack, {
      current: `You · ${data.baseline.kind} ${dateLabel(data.baseline.createdAt)}`,
      previous: `${analysis.opponentName || "Opponent"}`,
    });
  }, [oppTrack, athleteTrack, data, analysis.opponentName]);
  if (!built) return null;
  return (
    <Block
      title="You vs opponent"
      note="Your most recent tracked read next to this scout, played in step from 0:00. Each is scaled to its own torso size, so you compare shape and timing, not distance from the camera."
    >
      <CompareStage lanes={built.lanes} layout="side" duration={built.duration} testId="compare-opponent" />
    </Block>
  );
}

