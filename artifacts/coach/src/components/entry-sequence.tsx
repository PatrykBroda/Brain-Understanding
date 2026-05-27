import { useEffect, useMemo, useRef, useState } from "react";

interface EntrySequenceProps {
  fighterName: string | null;
  onDismiss: () => void;
}

const APHORISMS: string[] = [
  "Most mistakes are nervous system mistakes.",
  "Pressure is not the problem. Fragmentation under pressure is.",
  "The system you build is the system that tests you.",
  "Coherence beats intensity.",
  "What you can name, you can hold.",
  "Position before submission. Regulation before position.",
  "The roll reveals what the drill hides.",
  "Tilt is data.",
  "Anchor before you act.",
  "Narrow the decision tree.",
  "The frame is built one rep at a time.",
  "You do not rise to the level of your hope. You fall to the level of your wiring.",
];

const MOODS: { light: string; accent: string; rim: string; halo: string }[] = [
  { light: "rgba(220, 160, 90, 0.28)",  accent: "rgba(90, 130, 180, 0.18)", rim: "rgba(220, 160, 90, 0.18)", halo: "rgba(255, 180, 100, 0.22)" },
  { light: "rgba(110, 170, 220, 0.25)", accent: "rgba(220, 160, 90, 0.15)", rim: "rgba(110, 170, 220, 0.16)", halo: "rgba(140, 200, 255, 0.22)" },
  { light: "rgba(210, 110, 100, 0.26)", accent: "rgba(90, 140, 170, 0.14)", rim: "rgba(210, 110, 100, 0.16)", halo: "rgba(255, 140, 120, 0.22)" },
  { light: "rgba(180, 180, 200, 0.22)", accent: "rgba(220, 160, 90, 0.14)", rim: "rgba(200, 200, 220, 0.14)", halo: "rgba(220, 220, 240, 0.20)" },
  { light: "rgba(200, 140, 110, 0.26)", accent: "rgba(140, 110, 180, 0.16)", rim: "rgba(200, 140, 110, 0.16)", halo: "rgba(230, 160, 140, 0.22)" },
];

const NOISE_SVG = `data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.5 0"/></filter><rect width="100%" height="100%" filter="url(#n)" opacity="0.85"/></svg>`,
)}`;

const MIN_DISPLAY_MS = 3200;
const FADE_OUT_MS = 520;

function pickRotated<T>(arr: T[], storageKey: string): T {
  if (arr.length === 0) throw new Error("empty array");
  if (arr.length === 1) return arr[0]!;
  let lastIdx = -1;
  try {
    const stored = window.localStorage.getItem(storageKey);
    if (stored !== null) lastIdx = Number(stored);
  } catch {
    /* ignore */
  }
  let idx = Math.floor(Math.random() * arr.length);
  if (idx === lastIdx) idx = (idx + 1) % arr.length;
  try {
    window.localStorage.setItem(storageKey, String(idx));
  } catch {
    /* ignore */
  }
  return arr[idx]!;
}

interface Mote {
  left: number;
  size: number;
  delay: number;
  duration: number;
  drift: number;
  opacity: number;
}

function buildMotes(count: number): Mote[] {
  return Array.from({ length: count }, () => ({
    left: Math.random() * 100,
    size: 1 + Math.random() * 1.6,
    delay: Math.random() * 14,
    duration: 14 + Math.random() * 12,
    drift: -10 + Math.random() * 20,
    opacity: 0.18 + Math.random() * 0.22,
  }));
}

export function EntrySequence({ fighterName, onDismiss }: EntrySequenceProps) {
  const aphorism = useMemo(() => pickRotated(APHORISMS, "synochi:lastAphorismIdx"), []);
  const mood = useMemo(() => pickRotated(MOODS, "synochi:lastMoodIdx"), []);
  const motes = useMemo(() => buildMotes(7), []);
  const layout = useRef({
    lightX: 18 + Math.random() * 64,
    lightY: 58 + Math.random() * 36,
    accentX: 10 + Math.random() * 80,
    accentY: 8 + Math.random() * 32,
    rimY: 92 + Math.random() * 8,
    rotation: -0.8 + Math.random() * 1.6,
    breathPhase: Math.random() * 7,
  }).current;

  const [closing, setClosing] = useState(false);
  const mountedAtRef = useRef(performance.now());
  const dismissTimerRef = useRef<number | null>(null);
  const autoDismissTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (dismissTimerRef.current !== null) window.clearTimeout(dismissTimerRef.current);
      if (autoDismissTimerRef.current !== null) window.clearTimeout(autoDismissTimerRef.current);
    };
  }, []);

  const close = (userInitiated: boolean) => {
    if (closing) return;
    setClosing(true);
    const elapsed = performance.now() - mountedAtRef.current;
    const dwell = userInitiated ? 0 : Math.max(0, MIN_DISPLAY_MS - elapsed);
    if (dismissTimerRef.current !== null) window.clearTimeout(dismissTimerRef.current);
    dismissTimerRef.current = window.setTimeout(onDismiss, FADE_OUT_MS + dwell);
  };

  useEffect(() => {
    const elapsed = performance.now() - mountedAtRef.current;
    const wait = Math.max(MIN_DISPLAY_MS - elapsed, 400);
    autoDismissTimerRef.current = window.setTimeout(() => close(false), wait);
    return () => {
      if (autoDismissTimerRef.current !== null) {
        window.clearTimeout(autoDismissTimerRef.current);
        autoDismissTimerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const background = `
    radial-gradient(ellipse 70% 60% at ${layout.lightX}% ${layout.lightY}%, ${mood.light} 0%, transparent 60%),
    radial-gradient(ellipse 45% 38% at ${layout.accentX}% ${layout.accentY}%, ${mood.accent} 0%, transparent 55%),
    radial-gradient(ellipse 120% 32% at 50% ${layout.rimY}%, ${mood.rim} 0%, transparent 70%),
    radial-gradient(ellipse 130% 130% at 50% 50%, #14141a 0%, #08080c 55%, #030305 100%)
  `;

  return (
    <div
      className={`fixed inset-0 z-50 text-foreground transition-opacity duration-[520ms] ease-out ${
        closing ? "opacity-0 pointer-events-none" : "opacity-100"
      }`}
      style={{ background }}
    >
      {/* deep bloom — wide soft halo that breathes (ambient layer) */}
      <div
        className="absolute inset-0 pointer-events-none synochi-bloom"
        style={{
          background: `radial-gradient(ellipse 90% 75% at 50% 52%, ${mood.halo} 0%, transparent 65%)`,
          filter: "blur(40px)",
          animationDelay: `-${layout.breathPhase}s`,
        }}
      />

      {/* breathing colour wash — the room itself is alive */}
      <div
        className="absolute inset-0 pointer-events-none synochi-breath"
        style={{
          background: `radial-gradient(ellipse 70% 60% at 50% 55%, ${mood.light} 0%, transparent 70%)`,
          animationDelay: `-${layout.breathPhase * 0.6}s`,
        }}
      />

      {/* drifting dust motes */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {motes.map((m, i) => (
          <span
            key={i}
            className="absolute rounded-full bg-foreground synochi-mote"
            style={{
              left: `${m.left}%`,
              bottom: "-2%",
              width: `${m.size}px`,
              height: `${m.size}px`,
              opacity: m.opacity,
              animationDuration: `${m.duration}s`,
              animationDelay: `-${m.delay}s`,
              ["--mote-drift" as string]: `${m.drift}px`,
            }}
          />
        ))}
      </div>

      {/* photographic grain */}
      <div
        className="absolute inset-0 pointer-events-none mix-blend-overlay"
        style={{ backgroundImage: `url("${NOISE_SVG}")`, opacity: 0.18 }}
      />

      {/* vignette breath */}
      <div
        className="absolute inset-0 pointer-events-none synochi-vignette"
        style={{
          background:
            "radial-gradient(ellipse 100% 70% at 50% 50%, transparent 30%, rgba(0,0,0,0.45) 78%, rgba(0,0,0,0.88) 100%)",
        }}
      />

      <div
        className="relative h-full flex flex-col px-6"
        style={{
          paddingTop: "max(1.75rem, env(safe-area-inset-top))",
          paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))",
        }}
      >
        <header className="flex-none flex items-center justify-between animate-in fade-in slide-in-from-top-1 duration-700">
          <div className="flex items-center gap-2.5">
            <span className="w-1 h-1 rounded-full bg-primary synochi-pulse-dot" />
            <div className="font-mono text-[9px] tracking-[0.45em] text-muted-foreground uppercase">
              Tuning Frame
            </div>
          </div>
          {fighterName && (
            <div className="font-mono text-[10px] tracking-[0.4em] text-primary/85 uppercase">
              {fighterName}
            </div>
          )}
        </header>

        <main className="flex-1 grid place-items-center min-h-0 py-8">
          <div
            className="text-center max-w-[22ch] mx-auto animate-in fade-in zoom-in-95 duration-[1100ms]"
            style={{ transform: `rotate(${layout.rotation.toFixed(2)}deg)` }}
          >
            <div
              className="font-sans uppercase font-extralight leading-[1.35] text-foreground synochi-text-breath"
              style={{
                fontSize: "clamp(1.4rem, 6.2vw, 2.15rem)",
                letterSpacing: "0.13em",
                textShadow: `0 1px 30px rgba(0,0,0,0.55), 0 0 38px ${mood.halo}`,
              }}
            >
              {aphorism}
            </div>
            <div className="mt-10 flex items-center justify-center gap-1.5 animate-in fade-in duration-700 delay-700 fill-mode-both">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="w-1 h-1 rounded-full bg-foreground/45 synochi-load-dot"
                  style={{ animationDelay: `${i * 240}ms` }}
                />
              ))}
            </div>
          </div>
        </main>

        <footer className="flex-none flex flex-col items-center gap-4 animate-in fade-in duration-1000 delay-300 fill-mode-both">
          <div className="text-center">
            <div className="font-mono font-bold text-[15px] tracking-[0.4em] text-foreground/85">
              SYNOCHI
            </div>
            <div className="font-mono text-[8px] tracking-[0.55em] text-muted-foreground/80 mt-1.5">
              V 0 · 1
            </div>
          </div>
          <button
            type="button"
            onClick={() => close(true)}
            disabled={closing}
            className="font-mono text-[10px] tracking-[0.45em] text-muted-foreground/75 hover:text-foreground transition-colors uppercase disabled:opacity-40"
          >
            Skip
          </button>
        </footer>
      </div>

      <style>{`
        @keyframes synochi-bloom {
          0%, 100% { opacity: 0.45; transform: scale(0.95); }
          50%      { opacity: 1;    transform: scale(1.08); }
        }
        .synochi-bloom { animation: synochi-bloom 7.5s ease-in-out infinite; }

        @keyframes synochi-breath {
          0%, 100% { opacity: 0.55; transform: scale(1); }
          50%      { opacity: 1;    transform: scale(1.05); }
        }
        .synochi-breath { animation: synochi-breath 9s ease-in-out infinite; }

        @keyframes synochi-vignette {
          0%, 100% { opacity: 0.92; }
          50%      { opacity: 1; }
        }
        .synochi-vignette { animation: synochi-vignette 11s ease-in-out infinite; }

        @keyframes synochi-text-breath {
          0%, 100% { opacity: 0.88; filter: brightness(0.92); }
          50%      { opacity: 1;    filter: brightness(1.08); }
        }
        .synochi-text-breath { animation: synochi-text-breath 5.5s ease-in-out infinite; }

        @keyframes synochi-pulse-dot {
          0%, 100% { opacity: 0.35; transform: scale(0.85); }
          50%      { opacity: 1;    transform: scale(1.15); }
        }
        .synochi-pulse-dot { animation: synochi-pulse-dot 2.6s ease-in-out infinite; }

        @keyframes synochi-load-dot {
          0%, 100% { opacity: 0.25; }
          50%      { opacity: 0.85; }
        }
        .synochi-load-dot { animation: synochi-load-dot 1.4s ease-in-out infinite; }

        @keyframes synochi-mote {
          0%   { transform: translate3d(0, 0, 0); opacity: 0; }
          15%  { opacity: var(--mote-opacity, 0.3); }
          85%  { opacity: var(--mote-opacity, 0.3); }
          100% { transform: translate3d(var(--mote-drift, 0px), -110vh, 0); opacity: 0; }
        }
        .synochi-mote {
          animation-name: synochi-mote;
          animation-timing-function: linear;
          animation-iteration-count: infinite;
          will-change: transform, opacity;
        }
      `}</style>
    </div>
  );
}
