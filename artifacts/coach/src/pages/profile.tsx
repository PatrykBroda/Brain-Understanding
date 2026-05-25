import { useFighter } from "@/hooks/use-fighter";
import { useMemory } from "@/hooks/use-memory";
import { BottomNav } from "@/components/bottom-nav";
import { Link } from "wouter";
import { ChevronLeft } from "lucide-react";
import type { FactCategory } from "@/lib/api";

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

export default function ProfilePage() {
  const { data: fighterData } = useFighter();
  const fighter = fighterData?.fighter ?? null;
  const memoryQuery = useMemory(true);
  const facts = memoryQuery.data?.facts ?? [];

  const grouped: Partial<Record<FactCategory, typeof facts>> = {};
  for (const f of facts) {
    (grouped[f.category] ??= []).push(f);
  }

  return (
    <div className="flex flex-col h-[100dvh] bg-background text-foreground">
      <header className="flex-none flex items-center justify-between px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-3 border-b border-border/40">
        <Link
          href="/"
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft className="w-5 h-5" strokeWidth={1.5} />
        </Link>
        <div className="text-center">
          <div className="font-mono text-[9px] uppercase tracking-[0.35em] text-muted-foreground">
            Athlete
          </div>
          <div className="font-mono text-sm uppercase tracking-[0.3em] text-foreground/95 mt-0.5">
            Profile
          </div>
        </div>
        <div className="w-5" />
      </header>

      <main className="flex-1 overflow-y-auto">
        <div className="max-w-md mx-auto px-5 py-6 space-y-8 pb-10">
          {fighter ? (
            <>
              <section>
                <div className="flex items-center gap-4 mb-5">
                  <div className="w-14 h-14 border border-primary/50 bg-secondary/30 flex items-center justify-center font-mono text-lg uppercase tracking-widest text-primary">
                    {fighter.name.charAt(0)}
                  </div>
                  <div>
                    <div className="font-mono text-base uppercase tracking-widest text-foreground/95">
                      {fighter.name}
                    </div>
                    <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mt-1">
                      {fighter.art} · {fighter.level} · {fighter.trainingFrequency}
                    </div>
                  </div>
                </div>

                <dl className="grid grid-cols-2 gap-4 text-sm">
                  <Stat label="Age" value={String(fighter.age)} />
                  <Stat label="Competes" value={fighter.competes ? "Yes" : "No"} />
                </dl>

                {fighter.goals && (
                  <Section label="Stated goals">
                    <p className="text-sm text-foreground/90 leading-relaxed">{fighter.goals}</p>
                  </Section>
                )}
                {fighter.weaknesses && (
                  <Section label="Stated weaknesses">
                    <p className="text-sm text-foreground/90 leading-relaxed">{fighter.weaknesses}</p>
                  </Section>
                )}
              </section>

              <div className="h-px bg-border/60" />

              <section>
                <div className="flex items-baseline justify-between mb-5">
                  <div>
                    <div className="font-mono text-[10px] uppercase tracking-[0.35em] text-muted-foreground mb-1">
                      Athlete model
                    </div>
                    <div className="font-mono text-sm uppercase tracking-widest text-foreground/95">
                      {facts.length} observation{facts.length === 1 ? "" : "s"}
                    </div>
                  </div>
                  {memoryQuery.isFetching && (
                    <div className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
                      Syncing
                    </div>
                  )}
                </div>

                {facts.length === 0 ? (
                  <div className="text-sm text-muted-foreground leading-relaxed border border-border/40 p-4">
                    The model sharpens with use. As you talk to the coach, the system records
                    durable observations — what's leaking, what's solid, what you actually know vs.
                    need scaffolding on — and feeds them back into how you're coached next.
                  </div>
                ) : (
                  <div className="space-y-7">
                    {CATEGORY_ORDER.filter((c) => (grouped[c]?.length ?? 0) > 0).map((c) => (
                      <div key={c}>
                        <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-primary/85 mb-3">
                          {CATEGORY_LABELS[c]}
                        </div>
                        <div className="space-y-2.5">
                          {grouped[c]!.map((f) => (
                            <div key={f.id} className="border-l-2 border-border/60 pl-3 py-1">
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
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </>
          ) : (
            <div className="text-sm text-muted-foreground py-10 text-center">
              No athlete model yet.
            </div>
          )}
        </div>
      </main>

      <BottomNav />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-border/50 px-3 py-2.5">
      <div className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground mb-1">
        {label}
      </div>
      <div className="text-sm text-foreground/95">{value}</div>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mt-5">
      <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground mb-2">
        {label}
      </div>
      {children}
    </div>
  );
}
