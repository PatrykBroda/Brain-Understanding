import { Link } from "wouter";
import { BottomNav } from "@/components/bottom-nav";
import { useFighter } from "@/hooks/use-fighter";
import { useAutoWelcome } from "@/hooks/use-auto-welcome";
import { useFrameState } from "@/hooks/use-frame-state";

const HERO_LINES = ["MOST MISTAKES", "ARE NERVOUS SYSTEM", "MISTAKES"] as const;

export default function HomePage() {
  const { data: fighterData } = useFighter();
  const fighter = fighterData?.fighter ?? null;

  useAutoWelcome();
  const frameState = useFrameState();

  return (
    <div
      className="relative grid h-[100dvh] text-foreground overflow-hidden"
      style={{
        gridTemplateRows: "auto minmax(0,1fr) auto auto",
        background: "#000",
      }}
    >
      {/* Subtle top spotlight — documentary, not sci-fi. Anchored above hero, dies quickly. */}
      <div
        className="absolute inset-0 pointer-events-none z-0"
        style={{
          background:
            "radial-gradient(ellipse 80% 45% at 50% 8%, rgba(255,250,240,0.05) 0%, transparent 60%)",
        }}
      />

      {/* Heavy edge vignette — pulls focus to center, kills the corners */}
      <div
        className="absolute inset-0 pointer-events-none z-0"
        style={{
          background:
            "radial-gradient(ellipse 110% 80% at 50% 50%, transparent 35%, rgba(0,0,0,0.7) 90%, #000 100%)",
        }}
      />

      {/* Film grain — slightly heavier than before to read as documentary not pristine */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none opacity-[0.07] mix-blend-overlay z-0"
        aria-hidden
      >
        <filter id="frame-grain-home">
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" stitchTiles="stitch" />
          <feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.6 0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#frame-grain-home)" />
      </svg>

      {/* Status bar — TUNING FRAME · STATE LABEL, mono micro-type, almost invisible */}
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
        <Link
          href="/profile"
          aria-label="Open profile"
          className="font-mono text-[10px] tracking-[0.32em] text-primary/85 font-light uppercase outline-none focus-visible:ring-1 focus-visible:ring-primary/60 focus-visible:rounded-sm hover:text-primary transition-colors"
          title={frameState.source}
        >
          {fighter?.name?.split(" ")[0]?.toUpperCase() ?? "KILO"}
        </Link>
      </header>

      {/* Hero — stacked, condensed, oversized. Brutalist documentary type. */}
      <main className="relative z-10 min-h-0 grid place-items-center px-6">
        <div className="frame-hero text-center max-w-2xl">
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
                className="block frame-hero-line"
                style={{ animationDelay: `${0.05 + i * 0.12}s` }}
              >
                {line}
              </span>
            ))}
          </h1>

          {/* Three-dot punctuation like the reference. Pure visual breath. */}
          <div
            className="flex items-center justify-center gap-2 mt-10 frame-hero-line"
            style={{ animationDelay: "0.5s" }}
            aria-hidden
          >
            <span className="w-1 h-1 rounded-full bg-foreground/30" />
            <span className="w-1 h-1 rounded-full bg-foreground/30" />
            <span className="w-1 h-1 rounded-full bg-foreground/30" />
          </div>
        </div>
      </main>

      {/* Wordmark + CTA cluster — minimal, cinematic, no boxes */}
      <section className="relative z-10 flex flex-col items-center text-center px-6 pb-4 gap-5">
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

        <Link
          href="/chat"
          aria-label={fighter ? "Enter the frame" : "Enter"}
          className="group font-mono text-[10px] uppercase tracking-[0.55em] font-light text-foreground/55 hover:text-foreground/95 transition-colors outline-none focus-visible:ring-1 focus-visible:ring-primary/60 focus-visible:rounded-sm px-3 py-2"
        >
          <span className="opacity-60 mr-2">[</span>
          Enter
          <span className="opacity-60 ml-2">]</span>
        </Link>
      </section>

      <div className="relative z-10">
        <BottomNav />
      </div>

      <style>{`
        @keyframes frame-hero-rise {
          from { opacity: 0; transform: translateY(8px); filter: blur(2px); }
          to   { opacity: 1; transform: translateY(0);  filter: blur(0); }
        }
        .frame-hero-line {
          opacity: 0;
          animation: frame-hero-rise 0.8s cubic-bezier(0.2, 0.6, 0.2, 1) forwards;
        }
        @keyframes frame-grain-drift {
          0%, 100% { transform: translate(0, 0); }
          25%      { transform: translate(-1.5%, 0.8%); }
          50%      { transform: translate(1%, -1%); }
          75%      { transform: translate(-0.6%, -1.2%); }
        }
        .frame-hero {
          animation: frame-grain-drift 14s ease-in-out infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .frame-hero-line { animation-duration: 0.01s; }
          .frame-hero { animation: none; }
        }
      `}</style>
    </div>
  );
}
