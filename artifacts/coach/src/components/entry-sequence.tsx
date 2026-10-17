import { softCaseLines } from "@/lib/soft-case";
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
      className={`frame-ambient fixed inset-0 z-50 grid text-foreground overflow-hidden transition-opacity duration-[420ms] ease-out ${
        closing ? "opacity-0 pointer-events-none" : "opacity-100"
      }`}
      style={{ gridTemplateRows: "auto minmax(0,1fr) auto" }}
    >
      {/* Bronze + crimson glow fields give the screen depth */}
      <div aria-hidden className="glow-orb z-0 left-1/2 top-[8%] h-[26rem] w-[26rem] -translate-x-1/2" />
      <div
        aria-hidden
        className="glow-orb z-0 bottom-[-9rem] right-[-6rem] h-[22rem] w-[22rem]"
        style={{ background: "radial-gradient(circle, rgba(191,29,29,0.22), transparent 70%)" }}
      />
      {/* film grain */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none opacity-[0.05] mix-blend-overlay z-0"
        aria-hidden
      >
        <filter id="frame-grain-entry">
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" stitchTiles="stitch" />
          <feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.6 0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#frame-grain-entry)" />
      </svg>

      {/* Top status bar */}
      <header className="relative z-10 flex items-center justify-between px-6 pt-[max(1rem,env(safe-area-inset-top))] pb-2">
        <span className="chip !text-[10px] !text-muted-foreground">
          <span className="mr-2 h-1.5 w-1.5 rounded-full bg-[hsl(var(--primary-light))]" aria-hidden />
          Tuning Frame
        </span>
        <span
          className="chip !border-primary/30 !bg-primary/10 !text-[10px]"
        >
          {callsign}
        </span>
      </header>

      {/* Hero — elegant italic serif lines */}
      <main className="relative z-10 min-h-0 grid place-items-center px-6">
        <div className="frame-entry-hero text-center max-w-2xl">
          <h1 className="font-display leading-[1.08] text-[#f1ede6]" style={{ fontSize: "clamp(2.5rem, 10vw, 4.6rem)" }}>
            {softCaseLines(hero).map((line, i) => (
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
            className="mx-auto mt-10 h-px w-24 frame-entry-line"
            style={{ animationDelay: "0.5s", background: "linear-gradient(90deg, transparent, rgba(199,161,90,0.7), transparent)" }}
            aria-hidden
          />
        </div>
      </main>

      {/* Wordmark + SKIP */}
      <section className="relative z-10 flex flex-col items-center text-center px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] gap-4">
        <div>
          <div className="font-display text-[clamp(2.2rem,9vw,2.9rem)] leading-none text-[#f1ede6]">Frame</div>
          <div className="eyebrow mt-2 !text-[#E0564E]">MMA AI</div>
        </div>

        <button
          type="button"
          onClick={() => close(true)}
          disabled={closing}
          aria-label="Skip intro and enter"
          className="btn-glass !min-h-[48px] !px-8 cursor-pointer disabled:opacity-40"
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
