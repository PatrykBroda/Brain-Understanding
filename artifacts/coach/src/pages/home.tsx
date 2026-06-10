import { Link } from "wouter";
import { Shield } from "lucide-react";
import { CosmicOrb } from "@/components/cosmic-orb";
import { BottomNav } from "@/components/bottom-nav";
import { CompetitionBanner } from "@/components/competition-banner";
import { useFighter } from "@/hooks/use-fighter";
import { useAutoWelcome } from "@/hooks/use-auto-welcome";
import { useFrameState } from "@/hooks/use-frame-state";

export default function HomePage() {
  const { data: fighterData } = useFighter();
  const fighter = fighterData?.fighter ?? null;

  useAutoWelcome();
  const frameState = useFrameState();

  return (
    <div
      className="relative grid h-[100dvh] text-foreground overflow-hidden"
      style={{
        gridTemplateRows: "auto auto minmax(0,1fr) auto auto",
        background: "#000",
      }}
    >
      {/* Page-wide vignette — anchored on the orb, eases off so it doesn't eat the CTA */}
      <div
        className="absolute inset-0 pointer-events-none z-0"
        style={{
          background:
            "radial-gradient(ellipse 95% 55% at 50% 38%, transparent 40%, rgba(0,0,0,0.55) 95%)",
        }}
      />

      {/* Ultra-fine grain — barely perceptible, kills banding on the OLED black */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none opacity-[0.04] mix-blend-overlay z-0"
        aria-hidden
      >
        <filter id="frame-grain">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch" />
          <feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.5 0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#frame-grain)" />
      </svg>

      <header className="relative z-10 flex items-center justify-between px-6 pt-[max(1.1rem,env(safe-area-inset-top))] pb-3">
        <div>
          <div className="font-sans font-extralight text-[15px] tracking-[0.55em] text-foreground/95 leading-none">
            FRAME
          </div>
          <div className="font-mono text-[10px] tracking-[0.5em] text-foreground/55 mt-1.5 font-light">
            {(fighter?.primarySport ?? "COMBAT").toUpperCase()} · CALIBRATION SYSTEM
          </div>
        </div>
        <Link
          href="/profile"
          aria-label="Open profile"
          className="w-10 h-10 rounded-full border border-white/[0.06] flex items-center justify-center text-foreground/40 hover:border-primary/40 hover:text-primary/90 outline-none focus-visible:ring-1 focus-visible:ring-primary/60 transition-all duration-500"
        >
          <Shield className="w-[15px] h-[15px]" strokeWidth={1.2} />
        </Link>
      </header>

      <div className="relative z-10">
        <CompetitionBanner />
      </div>

      <main className="relative z-10 min-h-0 grid place-items-center overflow-hidden px-6">
        <div className="frame-fade-in h-full w-full grid place-items-center">
          <CosmicOrb
            state={frameState.orb}
            className="h-full max-h-[400px] max-w-full w-auto"
          />
        </div>
      </main>

      <section className="relative z-10 flex flex-col items-center text-center px-6 gap-6 pb-3">
        <div className="space-y-3">
          <div className="font-mono text-[10px] uppercase tracking-[0.55em] text-foreground/65 font-light">
            State
          </div>
          <div
            className="font-sans font-extralight uppercase text-[clamp(1.7rem,7vw,2.4rem)] tracking-[0.4em] text-foreground leading-none"
            style={{ textShadow: "0 0 48px hsla(35, 65%, 60%, 0.28), 0 2px 12px rgba(0,0,0,0.6)" }}
            title={frameState.source}
          >
            {frameState.label}
          </div>
          <div className="font-mono text-[10px] uppercase tracking-[0.45em] text-foreground/65 font-light pt-2">
            Narrow the decision tree.
          </div>
        </div>

        <div className="w-full max-w-[10rem] flex items-center gap-3 px-1" aria-hidden>
          <div className="flex-1 h-px" style={{ background: "linear-gradient(to right, transparent, hsla(35,55%,55%,0.18))" }} />
          <div className="w-1 h-1 rounded-full" style={{ background: "hsla(35,55%,55%,0.22)" }} />
          <div className="flex-1 h-px" style={{ background: "linear-gradient(to left, transparent, hsla(35,55%,55%,0.18))" }} />
        </div>

        <div className="w-full max-w-sm">
          <Link
            href="/chat"
            aria-label={fighter ? "Enter the frame" : "Enter"}
            className="group block w-full rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
          >
            <div
              className="relative w-full h-[58px] rounded-2xl flex items-center justify-center transition-all duration-500"
              style={{
                background:
                  "linear-gradient(180deg, hsla(35, 60%, 55%, 0.05) 0%, hsla(35, 60%, 55%, 0.015) 100%)",
                border: "1px solid hsla(35, 65%, 58%, 0.38)",
                boxShadow:
                  "0 10px 50px -12px hsla(35, 65%, 55%, 0.32), inset 0 1px 0 hsla(35, 70%, 60%, 0.14)",
              }}
            >
              <span className="font-sans text-[13px] uppercase tracking-[0.5em] font-light text-primary group-hover:tracking-[0.55em] transition-all duration-500">
                Enter
              </span>
              <div
                className="absolute inset-0 rounded-2xl pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                style={{
                  boxShadow:
                    "0 0 0 1px hsla(35, 65%, 60%, 0.55), 0 14px 60px -8px hsla(35, 65%, 55%, 0.5)",
                }}
              />
            </div>
          </Link>
        </div>
      </section>

      <div className="relative z-10">
        <BottomNav />
      </div>

      <style>{`
        @keyframes frame-fade-in {
          from { opacity: 0; transform: scale(0.96); }
          to   { opacity: 1; transform: scale(1); }
        }
        .frame-fade-in {
          animation: frame-fade-in 1.4s cubic-bezier(0.22, 0.61, 0.36, 1) both;
        }
      `}</style>
    </div>
  );
}
