import { useEffect } from "react";
import { X } from "lucide-react";
import type { AthleteFact, FactCategory } from "@/lib/api";

const CATEGORY_LABELS: Record<FactCategory, string> = {
  weakness: "Weaknesses",
  strength: "Strengths",
  technical_knowledge: "Technical knowledge",
  pattern: "Recurring patterns",
  preference: "Coaching preferences",
  goal: "Active goals",
  event: "Recent events",
  context: "Life context",
};

const CATEGORY_ORDER: FactCategory[] = [
  "weakness",
  "strength",
  "technical_knowledge",
  "pattern",
  "preference",
  "goal",
  "event",
  "context",
];

export function MemorySheet({
  open,
  onClose,
  facts,
  loading,
}: {
  open: boolean;
  onClose: () => void;
  facts: AthleteFact[];
  loading: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  const grouped: Partial<Record<FactCategory, AthleteFact[]>> = {};
  for (const f of facts) {
    (grouped[f.category] ??= []).push(f);
  }

  return (
    <div className="fixed inset-0 z-50 flex">
      <div
        className="absolute inset-0 bg-background/70 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={onClose}
      />
      <div className="relative ml-auto w-full max-w-md h-full bg-background border-l border-border/60 flex flex-col animate-in slide-in-from-right duration-300">
        <header className="flex-none flex items-center justify-between px-5 py-4 border-b border-border/60">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground mb-1">
              Athlete model
            </div>
            <div className="font-mono text-sm uppercase tracking-widest text-foreground/90">
              {facts.length} observation{facts.length === 1 ? "" : "s"}
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          {loading ? (
            <div className="text-muted-foreground font-mono text-xs uppercase tracking-widest text-center pt-10">
              Loading model…
            </div>
          ) : facts.length === 0 ? (
            <div className="text-muted-foreground text-sm leading-relaxed">
              <div className="font-mono text-[10px] uppercase tracking-widest mb-3 text-foreground/70">
                Empty
              </div>
              The model sharpens with use. As you talk, the system records
              durable observations — what's leaking, what's solid, what topics
              you actually know vs. need scaffolding on — and feeds them back
              into how the coach responds.
            </div>
          ) : (
            <div className="space-y-7">
              {CATEGORY_ORDER.filter((c) => (grouped[c]?.length ?? 0) > 0).map((c) => (
                <section key={c}>
                  <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-primary/80 mb-3">
                    {CATEGORY_LABELS[c]}
                  </div>
                  <div className="space-y-2.5">
                    {grouped[c]!.map((f) => (
                      <div
                        key={f.id}
                        className="border-l-2 border-border/60 pl-3 py-1"
                      >
                        <div className="flex items-baseline justify-between gap-3 mb-0.5">
                          <div className="font-mono text-[10px] uppercase tracking-widest text-foreground/80 truncate">
                            {f.topic}
                          </div>
                          <div className="flex-none font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
                            conf {f.confidence}/5 · {f.source}
                          </div>
                        </div>
                        <div className="text-sm text-foreground/90 leading-snug">
                          {f.content}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>

        <footer className="flex-none px-5 py-3 border-t border-border/60 text-[10px] font-mono uppercase tracking-widest text-muted-foreground leading-relaxed">
          The model updates after each exchange. Superseded observations are hidden.
        </footer>
      </div>
    </div>
  );
}
