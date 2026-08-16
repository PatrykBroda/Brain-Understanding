import { useEffect, useMemo, useRef, useState } from "react";

interface EntrySequenceProps {
  fighterName: string | null;
  onDismiss: () => void;
}

const APHORISMS: ReadonlyArray<readonly string[]> = [
  ["MOST MISTAKES", "ARE NERVOUS SYSTEM", "MISTAKES"],
  ["PRESSURE IS NOT", "THE PROBLEM.", "FRAGMENTATION IS."],
  ["THE SYSTEM YOU BUILD", "IS THE SYSTEM", "THAT TESTS YOU."],
  ["COHERENCE", "BEATS", "INTENSITY."],
  ["POSITION BEFORE SUBMISSION.", "REGULATION", "BEFORE POSITION."],
  ["THE ROLL REVEALS", "WHAT THE DRILL", "HIDES."],
  ["TILT", "IS", "DATA."],
  ["ANCHOR", "BEFORE", "YOU ACT."],
  ["NARROW", "THE DECISION", "TREE."],
  ["THE FRAME IS BUILT", "ONE REP", "AT A TIME."],
];

const MIN_DISPLAY_MS = 3600;
const FADE_OUT_MS = 420;

function pickRotated<T>(arr: ReadonlyArray<T>, storageKey: string): T {
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

export function EntrySequence({ fighterName, onDismiss }: EntrySequenceProps) {
  const hero = useMemo(() => pickRotated(APHORISMS, "frame:lastEntryIdx"), []);
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

  const callsign = fighterName?.split(" ")[0]?.toUpperCase() ?? "ATHLETE";

  return (
    <div
      className={`fixed inset-0 z-50 grid text-foreground overflow-hidden transition-opacity duration-[420ms] ease-out ${
        closing ? "opacity-0 pointer-events-none" : "opacity-100"
      }`}
      style={{
        gridTemplateRows: "auto minmax(0,1fr) auto",
        background: "#000",
      }}
    >
      {/* overhead spotlight */}
      <div
        className="absolute inset-0 pointer-events-none z-0"
        style={{
          background:
            "radial-gradient(ellipse 80% 45% at 50% 8%, rgba(255,250,240,0.05) 0%, transparent 60%)",
        }}
      />
      {/* heavy edge vignette */}
      <div
        className="absolute inset-0 pointer-events-none z-0"
        style={{
          background:
            "radial-gradient(ellipse 110% 80% at 50% 50%, transparent 35%, rgba(0,0,0,0.7) 90%, #000 100%)",
        }}
      />
      {/* film grain */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none opacity-[0.07] mix-blend-overlay z-0"
        aria-hidden
      >
        <filter id="frame-grain-entry">
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" stitchTiles="stitch" />
          <feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.6 0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#frame-grain-entry)" />
      </svg>

      {/* TUNING FRAME · CALLSIGN */}
      <header className="relative z-10 flex items-center justify-between px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-2">
        <div className="flex items-center gap-2">
          <span
            className="w-1 h-1 rounded-full"
            style={{ background: "hsla(39,49%,36%, 0.85)" }}
            aria-hidden
          />
          <span className="font-mono text-[10px] tracking-[0.32em] text-foreground/55 font-light uppercase">
            Tuning Frame
          </span>
        </div>
        <span className="font-mono text-[10px] tracking-[0.32em] text-primary/85 font-light uppercase">
          {callsign}
        </span>
      </header>

      {/* hero — stacked, condensed, oversized */}
      <main className="relative z-10 min-h-0 grid place-items-center px-6">
        <div className="frame-entry-hero text-center max-w-2xl">
          <h1
            className="font-light uppercase text-foreground/95 leading-[1.18] tracking-[0.06em]"
            style={{
              fontFamily: "'Oswald', 'Inter', sans-serif",
              fontSize: "clamp(2.2rem, 9vw, 3.8rem)",
            }}
          >
            {hero.map((line, i) => (
              <span
                key={`${line}-${i}`}
                className="block frame-entry-line"
                style={{ animationDelay: `${0.05 + i * 0.12}s` }}
              >
                {line}
              </span>
            ))}
          </h1>

          <div
            className="flex items-center justify-center gap-2 mt-10 frame-entry-line"
            style={{ animationDelay: "0.5s" }}
            aria-hidden
          >
            <span className="w-1 h-1 rounded-full bg-foreground/30" />
            <span className="w-1 h-1 rounded-full bg-foreground/30" />
            <span className="w-1 h-1 rounded-full bg-foreground/30" />
          </div>
        </div>
      </main>

      {/* FRAME / MMA AI wordmark + SKIP */}
      <section className="relative z-10 flex flex-col items-center text-center px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] gap-5">
        <div>
          <div
            className="font-extralight uppercase text-foreground/95 leading-none"
            style={{
              fontFamily: "'Oswald', 'Inter', sans-serif",
              fontSize: "clamp(1.8rem, 8vw, 2.4rem)",
              letterSpacing: "0.42em",
              paddingLeft: "0.42em",
            }}
          >
            Frame
          </div>
          <div
            className="font-mono font-light uppercase mt-2"
            style={{
              fontSize: "10px",
              letterSpacing: "0.6em",
              paddingLeft: "0.6em",
              color: "hsla(0, 70%, 55%, 0.78)",
            }}
          >
            MMA AI
          </div>
        </div>

        <button
          type="button"
          onClick={() => close(true)}
          disabled={closing}
          aria-label="Skip intro and enter"
          className="font-mono text-[10px] uppercase tracking-[0.55em] font-light text-foreground/55 hover:text-foreground/95 transition-colors outline-none focus-visible:ring-1 focus-visible:ring-primary/60 focus-visible:rounded-sm px-3 py-2 cursor-pointer disabled:opacity-40"
        >
          Skip
        </button>
      </section>

      <style>{`
        @keyframes frame-entry-rise {
          from { opacity: 0; transform: translateY(8px); filter: blur(2px); }
          to   { opacity: 1; transform: translateY(0);  filter: blur(0); }
        }
        .frame-entry-line {
          opacity: 0;
          animation: frame-entry-rise 0.8s cubic-bezier(0.2, 0.6, 0.2, 1) forwards;
        }
        @keyframes frame-entry-drift {
          0%, 100% { transform: translate(0, 0); }
          50%      { transform: translate(0.6%, -0.4%); }
        }
        .frame-entry-hero {
          animation: frame-entry-drift 14s ease-in-out infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .frame-entry-line { animation-duration: 0.01s; }
          .frame-entry-hero { animation: none; }
        }
      `}</style>
    </div>
  );
}
