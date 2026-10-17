import { VideoBackdrop } from "@/components/media-backdrop";
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
      className={`frame-ambient relative grid h-[100dvh] text-foreground overflow-hidden transition-opacity duration-[400ms] ${
        leaving ? "opacity-0" : "opacity-100"
      }`}
      style={{ gridTemplateRows: "auto minmax(0,1fr) auto" }}
    >
      <VideoBackdrop blur={2} dim={0.42} />
      {/* Bronze + crimson glow fields give the screen depth */}
      <div aria-hidden className="glow-orb z-0 left-1/2 top-[8%] h-[26rem] w-[26rem] -translate-x-1/2" />
      <div
        aria-hidden
        className="glow-orb z-0 bottom-[-9rem] right-[-6rem] h-[22rem] w-[22rem]"
        style={{ background: "radial-gradient(circle, rgba(191,29,29,0.22), transparent 70%)" }}
      />
      {/* Film grain */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none opacity-[0.05] mix-blend-overlay z-0"
        aria-hidden
      >
        <filter id="frame-grain-splash">
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" stitchTiles="stitch" />
          <feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.6 0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#frame-grain-splash)" />
      </svg>

      {/* Top status bar */}
      <header className="relative z-10 flex items-center justify-between px-6 pt-[max(1rem,env(safe-area-inset-top))] pb-2">
        <span className="chip !text-[10px] !text-muted-foreground">
          <span className="mr-2 h-1.5 w-1.5 rounded-full bg-[hsl(var(--primary-light))]" aria-hidden />
          Tuning Frame
        </span>
        <span
          className="chip !border-primary/30 !bg-primary/10 !text-[10px]" 
          title={frameState.source}
        >
          {fighter?.name?.split(" ")[0]?.toUpperCase() ?? "KILO"}
        </span>
      </header>

      {/* Hero — condensed punch lines over the edit */}
      <main className="relative z-10 min-h-0 grid place-items-center px-6">
        <div className="frame-splash-hero text-center max-w-2xl">
          <h1 className="punch text-[#f4f0e9]" style={{ fontSize: "clamp(3rem, 14vw, 5.6rem)" }}>
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
            className="mx-auto mt-10 h-px w-24 frame-splash-line"
            style={{ animationDelay: "0.5s", background: "linear-gradient(90deg, transparent, rgba(199,161,90,0.7), transparent)" }}
            role="status" aria-label="Loading"
          />
        </div>
      </main>

      {/* Wordmark + SKIP */}
      <section className="relative z-10 flex flex-col items-center text-center px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] gap-4">
        <div>
          <div className="wordmark text-[clamp(1.5rem,6.5vw,2rem)]">Frame</div>
          <div className="eyebrow mt-2 !text-[#E0564E]">MMA AI</div>
        </div>

        <button
          type="button"
          onClick={exit}
          aria-label="Skip intro and enter"
          className="btn-glass !min-h-[48px] !px-8 cursor-pointer disabled:opacity-40"
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
