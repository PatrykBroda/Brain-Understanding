import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useFighter } from "@/hooks/use-fighter";
import { useFrameState } from "@/hooks/use-frame-state";

const HERO_LINES = ["MOST MISTAKES", "ARE NERVOUS SYSTEM", "MISTAKES"] as const;

/**
 * Cinematic splash / loading screen. Brutalist documentary aesthetic:
 * heavy vignette, film grain, condensed uppercase type, FRAME wordmark
 * with red MMA AI tag. Auto-advances to home after 4.5s; user can SKIP early.
 */
export default function SplashPage() {
  const [, setLocation] = useLocation();
  const { data: fighterData } = useFighter();
  const fighter = fighterData?.fighter ?? null;
  const frameState = useFrameState();
  const [leaving, setLeaving] = useState(false);

  const exit = () => {
    if (leaving) return;
    setLeaving(true);
    try {
      localStorage.setItem("frame:intro-seen", "1");
    } catch {
      // storage blocked — ignore
    }
    window.setTimeout(() => setLocation("/home"), 420);
  };

  useEffect(() => {
    const t = window.setTimeout(exit, 2500);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className={`relative grid h-[100dvh] text-foreground overflow-hidden transition-opacity duration-[400ms] ${
        leaving ? "opacity-0" : "opacity-100"
      }`}
      style={{
        gridTemplateRows: "auto minmax(0,1fr) auto",
        background: "#000",
      }}
    >
      {/* Overhead spotlight — anchored above hero, dies quickly */}
      <div
        className="absolute inset-0 pointer-events-none z-0"
        style={{
          background:
            "radial-gradient(ellipse 80% 45% at 50% 8%, rgba(255,250,240,0.05) 0%, transparent 60%)",
        }}
      />
      {/* Heavy edge vignette */}
      <div
        className="absolute inset-0 pointer-events-none z-0"
        style={{
          background:
            "radial-gradient(ellipse 110% 80% at 50% 50%, transparent 35%, rgba(0,0,0,0.7) 90%, #000 100%)",
        }}
      />
      {/* Film grain */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none opacity-[0.07] mix-blend-overlay z-0"
        aria-hidden
      >
        <filter id="frame-grain-splash">
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" stitchTiles="stitch" />
          <feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.6 0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#frame-grain-splash)" />
      </svg>

      {/* Top status bar — TUNING FRAME · CALLSIGN */}
      <header className="relative z-10 flex items-center justify-between px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-2">
        <div className="flex items-center gap-2">
          <span
            className="w-1 h-1 rounded-full"
            style={{ background: "hsla(35, 65%, 60%, 0.85)" }}
            aria-hidden
          />
          <span className="font-mono text-[10px] tracking-[0.32em] text-foreground/55 font-light uppercase">
            Tuning Frame
          </span>
        </div>
        <span
          className="font-mono text-[10px] tracking-[0.32em] text-primary/85 font-light uppercase"
          title={frameState.source}
        >
          {fighter?.name?.split(" ")[0]?.toUpperCase() ?? "KILO"}
        </span>
      </header>

      {/* Hero — stacked, condensed, oversized */}
      <main className="relative z-10 min-h-0 grid place-items-center px-6">
        <div className="frame-splash-hero text-center max-w-2xl">
          <h1
            className="font-light uppercase text-foreground/95 leading-[1.18] tracking-[0.06em]"
            style={{
              fontFamily: "'Oswald', 'Inter', sans-serif",
              fontSize: "clamp(2.2rem, 9vw, 3.8rem)",
            }}
          >
            {HERO_LINES.map((line, i) => (
              <span
                key={line}
                className="block frame-splash-line"
                style={{ animationDelay: `${0.05 + i * 0.12}s` }}
              >
                {line}
              </span>
            ))}
          </h1>

          <div
            className="flex items-end justify-center gap-2 mt-10 frame-splash-line"
            style={{ animationDelay: "0.5s" }}
            role="status"
            aria-label="Loading"
          >
            <span className="w-1 h-1 rounded-full bg-foreground/40 frame-splash-dot" />
            <span
              className="w-1 h-1 rounded-full bg-foreground/40 frame-splash-dot"
              style={{ animationDelay: "0.18s" }}
            />
            <span
              className="w-1 h-1 rounded-full bg-foreground/40 frame-splash-dot"
              style={{ animationDelay: "0.36s" }}
            />
          </div>
        </div>
      </main>

      {/* Wordmark + SKIP — minimal, cinematic */}
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
          onClick={exit}
          aria-label="Skip intro and enter"
          className="font-mono text-[10px] uppercase tracking-[0.55em] font-light text-foreground/55 hover:text-foreground/95 transition-colors outline-none focus-visible:ring-1 focus-visible:ring-primary/60 focus-visible:rounded-sm px-3 py-2 cursor-pointer"
        >
          Skip
        </button>
      </section>

      <style>{`
        @keyframes frame-splash-rise {
          from { opacity: 0; transform: translateY(8px); filter: blur(2px); }
          to   { opacity: 1; transform: translateY(0);  filter: blur(0); }
        }
        .frame-splash-line {
          opacity: 0;
          animation: frame-splash-rise 0.8s cubic-bezier(0.2, 0.6, 0.2, 1) forwards;
        }
        @keyframes frame-splash-drift {
          0%, 100% { transform: translate(0, 0); }
          50%      { transform: translate(0.6%, -0.4%); }
        }
        .frame-splash-hero {
          animation: frame-splash-drift 14s ease-in-out infinite;
        }
        @keyframes frame-splash-bounce {
          0%, 80%, 100% { transform: translateY(0); opacity: 0.4; }
          40%           { transform: translateY(-5px); opacity: 1; }
        }
        .frame-splash-dot {
          animation: frame-splash-bounce 1.2s ease-in-out infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .frame-splash-line { animation-duration: 0.01s; }
          .frame-splash-hero { animation: none; }
          .frame-splash-dot { animation: none; }
        }
      `}</style>
    </div>
  );
}
