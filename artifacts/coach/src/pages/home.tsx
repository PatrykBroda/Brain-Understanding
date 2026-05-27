import { Link } from "wouter";
import { MessageSquare, ChevronRight, Shield } from "lucide-react";
import { CosmicOrb } from "@/components/cosmic-orb";
import { BottomNav } from "@/components/bottom-nav";
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
      className="grid h-[100dvh] bg-background text-foreground"
      style={{ gridTemplateRows: "auto minmax(0,1fr) auto auto" }}
    >
      <header className="flex items-center justify-between px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-3">
        <div>
          <div className="font-mono font-bold text-base tracking-[0.35em] text-foreground/95 leading-none">
            FRAME
          </div>
          <div className="font-mono text-[9px] tracking-[0.45em] text-muted-foreground mt-1">
            CALIBRATION SYSTEM
          </div>
        </div>
        <Link
          href="/profile"
          className="w-10 h-10 rounded-full border border-border/40 flex items-center justify-center text-foreground/70 hover:border-primary/50 hover:text-primary transition-colors"
        >
          <Shield className="w-4 h-4" strokeWidth={1.4} />
        </Link>
      </header>

      <main className="min-h-0 grid place-items-center px-6 py-2 overflow-hidden">
        <CosmicOrb
          state={frameState.orb}
          className="h-full max-h-[340px] max-w-full"
        />
      </main>

      <section className="flex flex-col items-center text-center px-6 gap-6 pb-3">
        <div className="space-y-2">
          <div className="font-mono text-[9px] uppercase tracking-[0.5em] text-muted-foreground/80">
            State
          </div>
          <div
            className="font-mono text-[clamp(1.1rem,4.4vw,1.4rem)] tracking-[0.3em] text-foreground/90 font-light leading-none"
            title={frameState.source}
          >
            {frameState.label}
          </div>
        </div>

        <Link
          href="/chat"
          className="w-full max-w-sm group block"
          aria-label={fighter ? "Enter the frame" : "Enter"}
        >
          <div className="relative w-full h-14 border-y border-foreground/15 hover:border-primary/40 transition-colors duration-300 flex items-center justify-between px-5">
            <div className="w-9 h-9 flex items-center justify-center text-foreground/60 group-hover:text-primary transition-colors">
              <MessageSquare className="w-4 h-4" strokeWidth={1.3} />
            </div>
            <span className="font-mono text-[11px] uppercase tracking-[0.45em] text-foreground/80 group-hover:text-primary transition-colors">
              Enter
            </span>
            <ChevronRight
              className="w-5 h-5 text-foreground/40 group-hover:text-primary group-hover:translate-x-1 transition-all"
              strokeWidth={1.3}
            />
          </div>
        </Link>
      </section>

      <BottomNav />
    </div>
  );
}
