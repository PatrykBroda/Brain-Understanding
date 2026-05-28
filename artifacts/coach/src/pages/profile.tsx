import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useClerk, useUser } from "@clerk/react";
import { useFighter } from "@/hooks/use-fighter";
import { useMemory } from "@/hooks/use-memory";
import { BottomNav } from "@/components/bottom-nav";
import { FrameOctagon } from "@/components/frame-octagon";
import { Link } from "wouter";
import { ChevronLeft, LogOut } from "lucide-react";
import { api, type FactCategory } from "@/lib/api";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

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

function daysBetween(a: Date, b: Date) {
  return Math.max(0, Math.floor((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24)));
}

export default function ProfilePage() {
  const { data: fighterData } = useFighter();
  const fighter = fighterData?.fighter ?? null;
  const memoryQuery = useMemory(true);
  const facts = memoryQuery.data?.facts ?? [];
  const { signOut } = useClerk();
  const { user } = useUser();

  const convQuery = useQuery({
    queryKey: ["conversation", "active"],
    queryFn: api.getActiveConversation,
  });
  const messages = convQuery.data?.messages ?? [];

  const grouped: Partial<Record<FactCategory, typeof facts>> = {};
  for (const f of facts) {
    (grouped[f.category] ??= []).push(f);
  }

  const stats = useMemo(() => {
    const userTurns = messages.filter((m) => m.role === "user").length;
    const coachTurns = messages.filter((m) => m.role === "assistant").length;
    const sinceDays = fighter ? daysBetween(new Date(fighter.createdAt), new Date()) : 0;
    const avgConf =
      facts.length === 0
        ? 0
        : facts.reduce((s, f) => s + f.confidence, 0) / facts.length;

    const integrityRaw = Math.min(
      1,
      facts.length / 24 + Math.min(userTurns / 30, 0.4),
    );
    const integrityPct = Math.round(integrityRaw * 100);

    return { userTurns, coachTurns, sinceDays, avgConf, integrityPct };
  }, [messages, facts, fighter]);

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
                <div className="flex items-center gap-4 mb-6">
                  <div className="relative">
                    <FrameOctagon size={72} spinSeconds={120} glow />
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none font-mono text-base uppercase tracking-widest text-primary">
                      {fighter.name.charAt(0)}
                    </div>
                  </div>
                  <div>
                    <div className="font-mono text-base uppercase tracking-widest text-foreground/95">
                      {fighter.name}
                    </div>
                    <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mt-1">
                      {fighter.art} · {fighter.level}
                    </div>
                    <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mt-0.5">
                      {fighter.trainingFrequency}
                    </div>
                  </div>
                </div>

                {/* Frame integrity gauge */}
                <div className="border border-border/50 px-3 py-3 mb-4">
                  <div className="flex items-baseline justify-between mb-2">
                    <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
                      Frame integrity
                    </div>
                    <div className="font-mono text-[11px] uppercase tracking-widest text-primary">
                      {stats.integrityPct}%
                    </div>
                  </div>
                  <div className="relative h-1 bg-border/60 overflow-hidden">
                    <div
                      className="absolute top-0 left-0 h-full bg-primary transition-all duration-700"
                      style={{ width: `${stats.integrityPct}%` }}
                    />
                  </div>
                  <div className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground/85 mt-2">
                    Sharpens with use. Resolves observations, calibrations, recorded patterns.
                  </div>
                </div>

                <dl className="grid grid-cols-2 gap-2.5 text-sm">
                  <Stat label="Age" value={String(fighter.age)} />
                  <Stat label="Competes" value={fighter.competes ? "Yes" : "No"} />
                  <Stat label="Days in frame" value={String(stats.sinceDays)} />
                  <Stat label="Transmissions" value={String(stats.userTurns)} />
                  <Stat label="Observations" value={String(facts.length)} />
                  <Stat label="Avg confidence" value={stats.avgConf > 0 ? `${stats.avgConf.toFixed(1)}/5` : "—"} />
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

                {/* category-density bars */}
                {facts.length > 0 && (
                  <div className="space-y-1.5 mb-6">
                    {CATEGORY_ORDER.filter((c) => (grouped[c]?.length ?? 0) > 0).map((c) => {
                      const count = grouped[c]?.length ?? 0;
                      const pct = Math.min(100, Math.round((count / Math.max(facts.length, 1)) * 100 * 2));
                      return (
                        <div key={c} className="flex items-center gap-3">
                          <div className="flex-none w-32 font-mono text-[9px] uppercase tracking-widest text-muted-foreground truncate">
                            {CATEGORY_LABELS[c]}
                          </div>
                          <div className="flex-1 relative h-[3px] bg-border/40 overflow-hidden">
                            <div
                              className="absolute top-0 left-0 h-full bg-primary/70"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <div className="flex-none font-mono text-[9px] uppercase tracking-widest text-foreground/80 w-5 text-right">
                            {count}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

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

          <div className="h-px bg-border/60 mt-2" />

          <section className="space-y-3">
            <div className="font-mono text-[10px] uppercase tracking-[0.35em] text-muted-foreground">
              Account
            </div>
            {user?.primaryEmailAddress?.emailAddress && (
              <div className="font-mono text-[11px] text-foreground/70 tracking-wide">
                {user.primaryEmailAddress.emailAddress}
              </div>
            )}
            <button
              type="button"
              onClick={() => signOut({ redirectUrl: basePath || "/" })}
              className="w-full flex items-center justify-center gap-2 border border-border/60 hover:border-primary/40 hover:text-primary text-foreground/75 transition-colors py-3 font-mono text-[10px] uppercase tracking-[0.3em]"
            >
              <LogOut className="w-3.5 h-3.5" strokeWidth={1.5} />
              Sign out
            </button>
          </section>
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
      <div className="text-sm text-foreground/95 font-mono">{value}</div>
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
