import { useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play, ChevronLeft, ChevronRight } from "lucide-react";
import { OPPONENT_HEX, SKELETON_CONNECTIONS, YOU_HEX } from "@/lib/pose-track";
import type { Landmark, PoseFrame } from "@/lib/pose";
import { bodiesNear, matchTapToTrack, type TapMatch, type TapPoint } from "@/lib/pose-people";

// "Pause and tap": shown BEFORE anything is scored when two or more people are tracked in a clip
// (and again when the AI could not tell who the athlete is). The user scrubs their own clip, pauses
// on a clear moment and taps themselves. The tap is matched to a tracked person (pose-people.ts
// matchTapToTrack) and that person is highlighted blue (the others red) so the choice can be checked
// before it is confirmed. The choice decides whose movement is measured and what the AI is told.

/** What the user said about who is who (optional, free text). */
export type WhoIsWho = { athlete: string; other: string };

export type PersonPickerData = {
  /** Object URL of the user's own clip (local file). */
  videoUrl: string;
  /** The tracked people (2+), each a PoseFrame per sampled time. */
  tracks: PoseFrame[][];
  width: number;
  height: number;
  /** Where the player opens (the clearest frame with both people, when there is one). */
  startTime: number;
  /** "unsure" = the AI could not tell who the athlete was: same step, different words. */
  reason: "two" | "unsure";
};

export type PersonPick = TapPoint & TapMatch;

// Draw only joints the model is fairly sure of.
const VIS = 0.4;
const STEP = 0.25; // one sampled frame

function Skeleton({ lm, vbW, color, faint }: { lm: Landmark[]; vbW: number; color: string; faint?: boolean }) {
  const x = (p: Landmark) => p.x * vbW;
  const y = (p: Landmark) => p.y * 100;
  const ok = (p: Landmark | undefined): p is Landmark => !!p && p.visibility >= VIS;
  return (
    <g opacity={faint ? 0.55 : 1}>
      {[faint ? 2.4 : 3.2, faint ? 1.1 : 1.6].map((w, k) => (
        <g key={k} stroke={k === 0 ? "rgba(0,0,0,0.65)" : color} strokeWidth={w} strokeLinecap="round" fill="none">
          {SKELETON_CONNECTIONS.map(([a, b]) => {
            const pa = lm[a];
            const pb = lm[b];
            if (!ok(pa) || !ok(pb)) return null;
            return <line key={`${a}-${b}`} x1={x(pa)} y1={y(pa)} x2={x(pb)} y2={y(pb)} />;
          })}
        </g>
      ))}
      {!faint &&
        [0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28].map((i) => {
          const p = lm[i];
          if (!ok(p)) return null;
          return <circle key={i} cx={x(p)} cy={y(p)} r={i === 0 ? 1.7 : 1.2} fill={color} stroke="rgba(0,0,0,0.6)" strokeWidth={0.4} />;
        })}
    </g>
  );
}

function fmt(t: number): string {
  const s = Math.max(0, t);
  return `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, "0")}`;
}

export function PersonPicker({
  data,
  who,
  setWho,
  onConfirm,
  onCancel,
  mode = "athlete",
}: {
  data: PersonPickerData;
  who: WhoIsWho;
  setWho: (w: WhoIsWho) => void;
  onConfirm: (pick: PersonPick) => void;
  onCancel: () => void;
  /** "scout" = an Opponent Scout upload: pick whose movement is read (not "you"). */
  mode?: "athlete" | "scout";
}) {
  const scout = mode === "scout";
  const aspect = data.width / Math.max(data.height, 1);
  const vbW = aspect * 100;
  const videoRef = useRef<HTMLVideoElement>(null);
  const [time, setTime] = useState(data.startTime);
  const [duration, setDuration] = useState(() => {
    const last = data.tracks[0]?.[data.tracks[0].length - 1]?.timestamp ?? 0;
    return Math.max(last, data.startTime, 0.1);
  });
  const [playing, setPlaying] = useState(false);
  const [pick, setPick] = useState<PersonPick | null>(null);

  // Follow the playhead while playing (timeupdate alone is too coarse for the overlay).
  useEffect(() => {
    if (!playing) return;
    let id = 0;
    const tick = () => {
      const v = videoRef.current;
      if (v) setTime(v.currentTime);
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [playing]);

  const bodies = useMemo(() => bodiesNear(data.tracks, time, data.width, data.height), [data, time]);

  function seek(t: number) {
    const v = videoRef.current;
    const clamped = Math.min(Math.max(t, 0), duration);
    setTime(clamped);
    if (v) {
      try {
        v.currentTime = clamped;
      } catch {
        // not seekable yet; loadedmetadata re-applies the time
      }
    }
  }

  function pause() {
    const v = videoRef.current;
    if (v && !v.paused) v.pause();
    setPlaying(false);
  }

  function togglePlay() {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      void Promise.resolve(v.play())
        .then(() => setPlaying(true))
        .catch(() => setPlaying(false));
    } else {
      pause();
    }
  }

  function onTap(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    pause();
    const v = videoRef.current;
    const t = v ? v.currentTime : time;
    setTime(t);
    const tap: TapPoint = {
      timeSec: t,
      x: Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)),
    };
    setPick({ ...tap, ...matchTapToTrack(data.tracks, tap, data.width, data.height) });
  }

  const chosen = pick?.index ?? null;
  const unsure = data.reason === "unsure";
  const title = scout ? "Who are you scouting?" : "Which one are you?";
  const intro = unsure
    ? "FRAME couldn't tell which person is you, so that read isn't final. Pause on a clear moment and tap yourself, and it's run again for that person."
    : scout
      ? "Pause on a clear moment and tap the fighter you're scouting."
      : "Pause on a clear moment and tap yourself.";
  const you = scout ? "the fighter you're scouting" : "you";
  const status = !pick
    ? "Tap a person on the paused frame."
    : pick.trackMatched && pick.method === "tap"
      ? `Got it. ${scout ? "They're" : "You're"} in blue. Scrub to check it stays on ${scout ? "them" : "you"}.`
      : pick.trackMatched
        ? `That wasn't on a body, so we'll use the person on the ${pick.x < 0.5 ? "left" : "right"}. Check that's ${you} in blue.`
        : "Nobody was tracked at that moment. Try another moment, or continue and your tap goes to the read as a note.";

  const field =
    "w-full bg-transparent border-b border-border/50 focus:border-primary/50 outline-none py-2.5 font-sans text-sm text-foreground placeholder:text-foreground/40 transition-colors";

  return (
    <div
      className="fixed inset-0 z-50 bg-black/95 backdrop-blur-sm flex flex-col items-center gap-4 px-4 py-6 overflow-y-auto font-sans"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      data-testid="person-picker"
    >
      <div className="my-auto w-full flex flex-col items-center gap-4">
        <div className="text-center space-y-1.5 max-w-sm">
          <div className="text-lg font-medium text-foreground">{title}</div>
          <p className="text-sm text-foreground/75 leading-relaxed">{intro}</p>
        </div>

        <div
          className="relative bg-black select-none"
          style={{ aspectRatio: String(aspect), width: `min(100%, calc(50vh * ${aspect}))`, maxWidth: 560 }}
          data-testid="person-picker-frame"
        >
          <video
            ref={videoRef}
            src={`${data.videoUrl}#t=${data.startTime.toFixed(2)}`}
            className="absolute inset-0 w-full h-full"
            muted
            playsInline
            preload="auto"
            onLoadedMetadata={(e) => {
              const v = e.currentTarget;
              if (Number.isFinite(v.duration) && v.duration > 0) setDuration(v.duration);
              if (Math.abs(v.currentTime - time) > 0.05) {
                try {
                  v.currentTime = time;
                } catch {
                  // ignore
                }
              }
            }}
            onSeeked={(e) => setTime(e.currentTarget.currentTime)}
            onPause={() => setPlaying(false)}
            onEnded={() => setPlaying(false)}
          />
          <svg viewBox={`0 0 ${vbW} 100`} preserveAspectRatio="none" className="absolute inset-0 w-full h-full pointer-events-none">
            {bodies.map((b, i) => {
              if (!b || i === chosen) return null;
              return (
                <Skeleton key={i} lm={b.landmarks} vbW={vbW} color={chosen == null ? "#f4f4f1" : OPPONENT_HEX} faint={chosen == null} />
              );
            })}
            {chosen != null && bodies[chosen] && <Skeleton lm={bodies[chosen]!.landmarks} vbW={vbW} color={YOU_HEX} />}
            {pick && Math.abs(pick.timeSec - time) < 0.05 && (
              <circle
                cx={pick.x * vbW}
                cy={pick.y * 100}
                r={2.6}
                fill="none"
                stroke={pick.trackMatched ? YOU_HEX : "#f4f4f1"}
                strokeWidth={0.8}
              />
            )}
          </svg>
          <div
            className="absolute inset-0 cursor-crosshair touch-manipulation"
            onClick={onTap}
            role="button"
            aria-label={scout ? "Tap the fighter you're scouting" : "Tap yourself"}
            data-testid="person-picker-tap"
          />
        </div>

        <div className="w-full max-w-[560px] space-y-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                pause();
                seek(time - STEP);
              }}
              aria-label="Back one frame"
              className="p-2 text-foreground/80 hover:text-foreground"
            >
              <ChevronLeft className="w-4 h-4" strokeWidth={1.5} />
            </button>
            <button
              type="button"
              onClick={togglePlay}
              aria-label={playing ? "Pause" : "Play"}
              data-testid="person-picker-play"
              className="p-2 text-foreground hover:text-foreground"
            >
              {playing ? <Pause className="w-4 h-4" strokeWidth={1.5} /> : <Play className="w-4 h-4" strokeWidth={1.5} />}
            </button>
            <button
              type="button"
              onClick={() => {
                pause();
                seek(time + STEP);
              }}
              aria-label="Forward one frame"
              className="p-2 text-foreground/80 hover:text-foreground"
            >
              <ChevronRight className="w-4 h-4" strokeWidth={1.5} />
            </button>
            <input
              type="range"
              min={0}
              max={duration}
              step={0.04}
              value={Math.min(time, duration)}
              onChange={(e) => {
                pause();
                seek(Number(e.target.value));
              }}
              aria-label="Scrub through the clip"
              data-testid="person-picker-scrub"
              className="flex-1 accent-[#4da3ff]"
            />
            <span className="text-xs tabular-nums text-foreground/70 w-12 text-right">{fmt(time)}</span>
          </div>
          <p className="text-sm text-foreground/85 leading-relaxed min-h-[2.5rem]" aria-live="polite" data-testid="person-picker-status">
            {status}
          </p>
        </div>

        <div className="w-full max-w-[560px] space-y-1">
          <input
            type="text"
            data-testid="who-athlete"
            value={who.athlete}
            onChange={(e) => setWho({ ...who, athlete: e.target.value.slice(0, 80) })}
            placeholder={scout ? "What they're wearing, e.g. white gi (optional)" : "What you're wearing, e.g. black rashguard (optional)"}
            className={field}
          />
          <input
            type="text"
            data-testid="who-other"
            value={who.other}
            onChange={(e) => setWho({ ...who, other: e.target.value.slice(0, 80) })}
            placeholder="The other person, e.g. white gi, black shorts (optional)"
            className={field}
          />
        </div>

        <div className="flex w-full max-w-[560px] gap-3 pt-1">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 py-3 text-sm text-foreground/80 border border-border/50 hover:text-foreground"
          >
            {unsure ? "Keep this read" : "Cancel"}
          </button>
          <button
            type="button"
            disabled={!pick}
            onClick={() => pick && onConfirm(pick)}
            data-testid="person-picker-confirm"
            className="flex-[2] py-3 text-sm font-medium text-foreground border active:scale-[0.98] transition-transform disabled:opacity-40"
            style={{ borderColor: YOU_HEX, background: `${YOU_HEX}22` }}
          >
            {scout ? "Scout this person" : pick && !pick.trackMatched ? "Continue with my tap" : "This is me"}
          </button>
        </div>
      </div>
    </div>
  );
}
