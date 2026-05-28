import { Link } from "wouter";
import { CosmicOrb } from "@/components/cosmic-orb";

export default function PublicLandingPage() {
  return (
    <div
      className="relative grid h-[100dvh] text-foreground overflow-hidden"
      style={{
        gridTemplateRows: "auto minmax(0,1fr) auto",
        background: "#000",
      }}
    >
      <div
        className="absolute inset-0 pointer-events-none z-0"
        style={{
          background:
            "radial-gradient(ellipse 95% 55% at 50% 38%, transparent 40%, rgba(0,0,0,0.55) 95%)",
        }}
      />

      <header className="relative z-10 flex items-center justify-between px-6 pt-[max(1.1rem,env(safe-area-inset-top))] pb-3">
        <div>
          <div className="font-sans font-extralight text-[15px] tracking-[0.55em] text-foreground/95 leading-none">
            FRAME
          </div>
          <div className="font-mono text-[10px] tracking-[0.5em] text-foreground/55 mt-1.5 font-light">
            MMA · CALIBRATION SYSTEM
          </div>
        </div>
      </header>

      <main className="relative z-10 min-h-0 grid place-items-center overflow-hidden px-6">
        <div className="frame-fade-in h-full w-full grid place-items-center">
          <CosmicOrb state="dormant" className="h-full max-h-[360px] max-w-full w-auto" />
        </div>
      </main>

      <section className="relative z-10 flex flex-col items-center text-center px-6 gap-5 pb-[max(2rem,env(safe-area-inset-bottom))]">
        <div className="space-y-2 max-w-sm">
          <div className="font-sans font-extralight uppercase text-[clamp(1.4rem,5.5vw,1.9rem)] tracking-[0.3em] text-foreground/95 leading-tight">
            Coach. Calibrate. Compete.
          </div>
          <div className="font-mono text-[10px] uppercase tracking-[0.45em] text-foreground/55 font-light pt-1">
            A private model of your game. Gets sharper every session.
          </div>
        </div>

        <div className="w-full max-w-sm flex flex-col gap-3">
          <Link
            href="/sign-up"
            className="group block w-full rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
          >
            <div
              className="relative w-full h-[56px] rounded-2xl flex items-center justify-center transition-all duration-500"
              style={{
                background:
                  "linear-gradient(180deg, hsla(35, 60%, 55%, 0.05) 0%, hsla(35, 60%, 55%, 0.015) 100%)",
                border: "1px solid hsla(35, 65%, 58%, 0.38)",
                boxShadow:
                  "0 10px 50px -12px hsla(35, 65%, 55%, 0.32), inset 0 1px 0 hsla(35, 70%, 60%, 0.14)",
              }}
            >
              <span className="font-sans text-[13px] uppercase tracking-[0.5em] font-light text-primary group-hover:tracking-[0.55em] transition-all duration-500">
                Create account
              </span>
            </div>
          </Link>

          <Link
            href="/sign-in"
            className="group block w-full rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            <div className="relative w-full h-[52px] rounded-2xl flex items-center justify-center border border-white/[0.08] hover:border-white/[0.18] transition-all duration-500">
              <span className="font-sans text-[12px] uppercase tracking-[0.45em] font-light text-foreground/70 group-hover:text-foreground/95 transition-colors duration-500">
                Sign in
              </span>
            </div>
          </Link>
        </div>
      </section>

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
