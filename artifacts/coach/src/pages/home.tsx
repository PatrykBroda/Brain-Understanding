import { useMemo } from "react";
import { Link } from "wouter";
import { MessageSquare, ChevronRight, Shield } from "lucide-react";
import { CosmicOrb } from "@/components/cosmic-orb";
import { BottomNav } from "@/components/bottom-nav";
import { useFighter } from "@/hooks/use-fighter";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export default function HomePage() {
  const { data: fighterData } = useFighter();
  const fighter = fighterData?.fighter ?? null;

  const convQuery = useQuery({
    queryKey: ["conversation", "active"],
    queryFn: api.getActiveConversation,
  });

  const messageCount = convQuery.data?.messages.length ?? 0;

  const state = useMemo(() => {
    if (!fighter) return { label: "INITIALISING", sub: "seed the model" };
    if (messageCount === 0)
      return { label: "DENSE CALM POTENTIAL", sub: "Narrow the decision tree." };
    if (messageCount < 6) return { label: "WARMING", sub: "Narrow the decision tree." };
    return { label: "LOCKED IN", sub: "Narrow the decision tree." };
  }, [fighter, messageCount]);

  return (
    <div className="flex flex-col h-[100dvh] bg-background text-foreground">
      <header className="flex-none flex items-center justify-between px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-3">
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

      <main className="flex-1 flex flex-col items-center justify-between px-5 pb-2 overflow-hidden">
        <div className="flex-1 w-full flex items-center justify-center min-h-0">
          <CosmicOrb size={Math.min(340, typeof window !== "undefined" ? window.innerWidth * 0.85 : 340)} state={messageCount > 0 ? "active" : "idle"} />
        </div>

        <div className="flex-none w-full flex flex-col items-center text-center space-y-7 pb-4">
          <div className="space-y-2">
            <div className="font-mono text-[10px] uppercase tracking-[0.45em] text-muted-foreground">
              State
            </div>
            <div className="font-mono text-2xl tracking-[0.35em] text-foreground/95 font-light">
              {state.label}
            </div>
            <div className="w-6 h-px bg-foreground/30 mx-auto mt-3" />
          </div>

          <div className="font-mono text-[11px] uppercase tracking-[0.35em] text-muted-foreground">
            {state.sub}
            <div className="text-primary text-xl leading-none mt-2">·</div>
          </div>

          <Link href="/chat" className="w-full max-w-sm group block">
            <div className="relative w-full h-14 border border-primary/40 bg-secondary/30 hover:bg-secondary/60 hover:border-primary/70 transition-all duration-200 flex items-center justify-between px-5 backdrop-blur-sm">
              <div className="w-9 h-9 border border-border/60 flex items-center justify-center text-foreground/80 group-hover:text-primary transition-colors">
                <MessageSquare className="w-4 h-4" strokeWidth={1.5} />
              </div>
              <span className="font-mono text-sm uppercase tracking-[0.4em] text-primary">
                Enter Frame
              </span>
              <ChevronRight className="w-5 h-5 text-foreground/60 group-hover:text-primary group-hover:translate-x-1 transition-all" strokeWidth={1.5} />
            </div>
          </Link>
        </div>
      </main>

      <BottomNav />
    </div>
  );
}
