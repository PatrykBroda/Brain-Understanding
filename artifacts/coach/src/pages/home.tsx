import { useMemo } from "react";
import { Link } from "wouter";
import { MessageSquare, ChevronRight, Shield } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { CosmicOrb, type OrbState } from "@/components/cosmic-orb";
import { BottomNav } from "@/components/bottom-nav";
import { useFighter } from "@/hooks/use-fighter";
import { useAutoWelcome } from "@/hooks/use-auto-welcome";
import { api } from "@/lib/api";

export default function HomePage() {
  const { data: fighterData } = useFighter();
  const fighter = fighterData?.fighter ?? null;

  useAutoWelcome();

  const convQuery = useQuery({
    queryKey: ["conversation", "active"],
    queryFn: api.getActiveConversation,
  });

  const messageCount = convQuery.data?.messages.length ?? 0;

  const state = useMemo<{ label: string; orbState: OrbState }>(() => {
    if (!fighter || messageCount === 0) {
      return { label: "NOT DETECTED", orbState: "dormant" };
    }
    if (messageCount < 4) return { label: "DENSE CALM POTENTIAL", orbState: "calm" };
    if (messageCount < 10) return { label: "WARMING", orbState: "warming" };
    return { label: "LOCKED IN", orbState: "lockedIn" };
  }, [fighter, messageCount]);

  return (
    <div
      className="grid h-[100dvh] bg-background text-foreground"
      style={{ gridTemplateRows: "auto minmax(0,1fr) auto auto" }}
    >
      <header className="flex items-center justify-between px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-3">
        <div>
          <div className="font-mono font-bold text-base tracking-[0.35em] text-foreground/95 leading-none">
            SYNOCHI
          </div>
          <div className="font-mono text-[9px] tracking-[0.45em] text-muted-foreground mt-1">
            OPERATING SYSTEM
          </div>
        </div>
        <Link
          href="/profile"
          className="w-10 h-10 rounded-full border border-border/70 flex items-center justify-center text-foreground/80 hover:border-primary/60 hover:text-primary transition-colors"
        >
          <Shield className="w-4 h-4" strokeWidth={1.5} />
        </Link>
      </header>

      <main className="min-h-0 grid place-items-center px-6 py-2 overflow-hidden">
        <CosmicOrb
          state={state.orbState}
          className="h-full max-h-[340px] max-w-full"
        />
      </main>

      <section className="flex flex-col items-center text-center px-6 gap-5 pb-2">
        <div className="space-y-2.5">
          <div className="font-mono text-[10px] uppercase tracking-[0.45em] text-muted-foreground">
            State
          </div>
          <div className="font-mono text-[clamp(1.2rem,4.8vw,1.55rem)] tracking-[0.35em] text-foreground/95 font-light leading-none">
            {state.label}
          </div>
          <div className="w-6 h-px bg-foreground/30 mx-auto" />
        </div>

        <div className="font-mono text-[11px] uppercase tracking-[0.35em] text-muted-foreground">
          Narrow the decision tree.
          <div className="text-primary text-base leading-none mt-2">·</div>
        </div>

        <Link href="/chat" className="w-full max-w-sm group block">
          <div className="relative w-full h-14 border border-primary/40 bg-secondary/30 hover:bg-secondary/60 hover:border-primary/70 transition-all duration-200 flex items-center justify-between px-5 backdrop-blur-sm">
            <div className="w-9 h-9 border border-border/60 flex items-center justify-center text-foreground/85 group-hover:text-primary transition-colors">
              <MessageSquare className="w-4 h-4" strokeWidth={1.5} />
            </div>
            <span className="font-mono text-sm uppercase tracking-[0.4em] text-primary">
              Enter Frame
            </span>
            <ChevronRight
              className="w-5 h-5 text-foreground/60 group-hover:text-primary group-hover:translate-x-1 transition-all"
              strokeWidth={1.5}
            />
          </div>
        </Link>
      </section>

      <BottomNav />
    </div>
  );
}
