import { Link } from "wouter";
import { CosmicOrb } from "@/components/cosmic-orb";

export function HeroSection() {
  return (
    <section className="relative min-h-[100dvh] flex flex-col items-center justify-center text-center px-6 overflow-hidden">
      <div
        className="absolute inset-0 pointer-events-none z-0"
        style={{
          background: "radial-gradient(ellipse 95% 55% at 50% 38%, transparent 40%, rgba(0,0,0,0.85) 95%)",
        }}
      />
      
      <div className="absolute inset-0 grid place-items-center opacity-60">
        <CosmicOrb state="stable" className="h-[60vh] max-h-[600px] w-auto pointer-events-none" />
      </div>

      <div className="relative z-10 flex flex-col items-center gap-8 mt-16 md:mt-24">
        <div className="space-y-6 max-w-3xl mx-auto">
          <div className="font-mono text-[10px] tracking-[0.4em] uppercase text-primary font-medium">
            Combat Performance Intelligence
          </div>
          <h1 className="font-sans font-extralight uppercase text-[clamp(2rem,7vw,5rem)] tracking-[0.15em] text-foreground/95 leading-[1.1]">
            Intelligence <br />
            Under <span className="text-primary italic">Pressure</span>
          </h1>
          <p className="font-mono text-[11px] md:text-[13px] uppercase tracking-[0.2em] text-foreground/55 font-light max-w-lg mx-auto leading-relaxed">
            MMA · Boxing · Muay Thai · Kickboxing · BJJ · Wrestling · Judo · Karate · Sambo
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-4 mt-6 w-full max-w-sm">
          <Link
            href="/sign-up"
            className="group w-full rounded-none outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
          >
            <div className="relative w-full h-[56px] flex items-center justify-center bg-primary text-black transition-all hover:bg-primary/90">
              <span className="font-mono text-[11px] uppercase tracking-[0.3em] font-bold">
                Initiate Calibration
              </span>
            </div>
          </Link>
        </div>
      </div>
      <div className="absolute bottom-12 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 opacity-40 animate-pulse">
        <div className="w-[1px] h-16 bg-gradient-to-b from-foreground to-transparent" />
      </div>
    </section>
  );
}
