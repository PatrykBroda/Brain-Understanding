import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useClerk, useUser } from "@clerk/react";
import { useFighter } from "@/hooks/use-fighter";
import { useMemory } from "@/hooks/use-memory";
import { BottomNav } from "@/components/bottom-nav";
import { Belt } from "@/components/belt";
import { ProfileEdit } from "@/components/profile-edit";
import { AthleteStatePanel } from "@/components/athlete-state-panel";
import { sportLabel } from "@/lib/fighter-options";
import { getArchetype } from "@workspace/archetypes";
import { Link } from "wouter";
import { ChevronLeft, LogOut, Pencil } from "lucide-react";
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
  const [isEditing, setIsEditing] = useState(false);

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

    // Interpretive model density — how much real signal the frame is built on.
    // Categorical, never a fake percentage. Derived from recorded facts + reps.
    const integrityRaw = Math.min(
      1,
      facts.length / 24 + Math.min(userTurns / 30, 0.4),
    );
    const integritySegments = Math.max(
      facts.length === 0 ? 0 : 1,
      Math.round(integrityRaw * 5),
    );
    let integrityLabel = "Dormant";
    if (integritySegments >= 5) integrityLabel = "Tempered";
    else if (integritySegments === 4) integrityLabel = "Solid";
    else if (integritySegments === 3) integrityLabel = "Holding";
    else if (integritySegments === 2) integrityLabel = "Taking shape";
    else if (integritySegments === 1) integrityLabel = "Forming";

    return {
      userTurns,
      coachTurns,
      sinceDays,
      avgConf,
      integritySegments,
      integrityLabel,
    };
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
        {fighter && !isEditing ? (
          <button
            type="button"
            onClick={() => setIsEditing(true)}
            className="text-muted-foreground hover:text-primary transition-colors"
            aria-label="Edit profile"
          >
            <Pencil className="w-4 h-4" strokeWidth={1.5} />
          </button>
        ) : (
          <div className="w-5" />
        )}
      </header>

      <main className="flex-1 overflow-y-auto">
        <div className="max-w-md mx-auto px-5 py-6 space-y-8 pb-10">
          {fighter && isEditing ? (
            <ProfileEdit fighter={fighter} onClose={() => setIsEditing(false)} />
          ) : fighter ? (
            <>
              <section>
                {/* ─── COMBAT IDENTITY HERO ─────────────────────────────── */}
                {(() => {
                  const arch = fighter.spiritAnimal ? getArchetype(fighter.spiritAnimal) : null;
                  return (
                    <div className="mb-5 profile-id-card" style={{ border: "1px solid hsla(32,54%,46%,0.35)" }}>
                      {/* Top section — animal + identity */}
                      <div className="flex gap-0">
                        {/* Animal square */}
                        <div
                          className="flex-none flex items-center justify-center"
                          style={{
                            width: 110,
                            minHeight: 110,
                            borderRight: "1px solid hsla(32,54%,46%,0.2)",
                            background: "hsla(0,0%,0%,0.35)",
                          }}
                        >
                          {fighter.spiritAnimal ? (
                            <img
                              src={`${basePath}/spirit/${fighter.spiritAnimal}.png`}
                              alt={fighter.spiritAnimal}
                              className="w-[72px] h-[72px] object-contain"
                              style={{ opacity: 0.88 }}
                              draggable={false}
                            />
                          ) : (
                            <span className="font-mono text-2xl uppercase tracking-widest text-primary/60">
                              {fighter.name.charAt(0)}
                            </span>
                          )}
                        </div>

                        {/* Identity text */}
                        <div className="flex-1 min-w-0 px-4 py-4 flex flex-col justify-center">
                          <div className="font-mono text-[8px] uppercase tracking-[0.55em] text-muted-foreground/50 mb-2">
                            Combat identity
                          </div>
                          <div className="font-mono text-2xl uppercase tracking-[0.12em] text-foreground/95 leading-none mb-2 truncate">
                            {fighter.name}
                          </div>
                          {fighter.spiritAnimal && (
                            <div className="font-mono text-[11px] uppercase tracking-[0.4em] mb-2.5" style={{ color: "hsl(32,54%,50%)" }}>
                              {fighter.spiritAnimal}
                            </div>
                          )}
                          <div className="space-y-0.5">
                            <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground/65">
                              {fighter.primarySport ? sportLabel(fighter.primarySport) : fighter.art}
                            </div>
                            <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground/45">
                              {fighter.trainingFrequency}
                              {fighter.gym ? ` · ${fighter.gym}` : ""}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Tagline */}
                      {fighter.spiritAnimalTagline && (
                        <div
                          className="px-4 py-3"
                          style={{ borderTop: "1px solid hsla(32,54%,46%,0.14)" }}
                        >
                          <p className="text-[12px] italic text-foreground/55 leading-relaxed">
                            {fighter.spiritAnimalTagline}
                          </p>
                        </div>
                      )}

                      {/* Archetype section — inline in the same card */}
                      {arch && (
                        <div style={{ borderTop: "1px solid hsla(32,54%,46%,0.2)" }}>
                          {/* Section label */}
                          <div
                            className="flex items-center gap-3 px-4 py-3"
                            style={{ borderBottom: "1px solid hsla(0,0%,100%,0.05)" }}
                          >
                            <div className="h-px flex-1" style={{ background: "hsla(32,54%,46%,0.25)" }} />
                            <div className="font-mono text-[8px] uppercase tracking-[0.55em]" style={{ color: "hsl(32,54%,50%)" }}>
                              {arch.name} Archetype
                            </div>
                            <div className="h-px flex-1" style={{ background: "hsla(32,54%,46%,0.25)" }} />
                          </div>

                          {/* Three archetype rows */}
                          <div className="divide-y" style={{ borderColor: "hsla(0,0%,100%,0.04)" }}>
                            <ArchRow label="Under pressure" text={arch.pressureSignature} />
                            <ArchRow label="Gift" text={arch.gift} />
                            <ArchRow label="Shadow" text={arch.shadow} />
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* ATHLETE STATE — honest, real-signal-only snapshot */}
                <div className="mb-5">
                  <AthleteStatePanel fighter={fighter} facts={facts} />
                </div>

                {/* FRAME RANK — prestige rank dashboard */}
                <div
                  className="relative mb-5 border border-white/[0.08] overflow-hidden"
                  style={{
                    background:
                      "linear-gradient(180deg, hsla(40,45%,55%,0.04), transparent 55%)",
                  }}
                >
                  <div className="flex items-center justify-between px-4 pt-3.5 pb-1">
                    <div className="font-mono text-[10px] uppercase tracking-[0.35em] text-primary/85">
                      Frame rank
                    </div>
                    <div className="font-mono text-[8px] uppercase tracking-[0.25em] text-muted-foreground/70">
                      Calibration ladder
                    </div>
                  </div>
                  <div className="px-4 pb-4 pt-3">
                    <Belt level={fighter.level} />
                  </div>
                  <div className="grid grid-cols-3 border-t border-white/[0.06] divide-x divide-white/[0.06]">
                    <RankMeta label="Integrity" value={stats.integrityLabel} />
                    <RankMeta label="Cadence" value={fighter.trainingFrequency} />
                    <RankMeta label="Days in frame" value={String(stats.sinceDays)} />
                  </div>
                  <div className="px-4 py-4">
                    <div className="flex gap-1">
                      {[0, 1, 2, 3, 4].map((i) => (
                        <div
                          key={i}
                          className={`h-1 flex-1 transition-colors duration-700 ${
                            i < stats.integritySegments ? "bg-primary" : "bg-border/60"
                          }`}
                        />
                      ))}
                    </div>
                    <div className="text-[10px] text-muted-foreground/80 leading-relaxed mt-2">
                      Frame integrity — how much of your structure survives when pressure spikes.
                      Composure under fragmentation, not a fitness score. Sharpens with use; built
                      from observations, calibrations, recorded patterns.
                    </div>
                  </div>
                </div>

                <Link
                  href="/competition"
                  className="flex items-center justify-between border border-white/[0.08] px-4 py-3 mb-5 hover:border-[hsl(var(--red-accent))]/50 transition-colors group"
                >
                  <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-foreground/70 group-hover:text-[hsl(var(--red-accent))] transition-colors">
                    Competition mode
                  </span>
                  <span className="font-mono text-[9px] uppercase tracking-[0.25em] text-foreground/40">
                    Schedule / countdown
                  </span>
                </Link>

                <dl className="grid grid-cols-2 gap-2.5 text-sm">
                  <Stat label="Age" value={String(fighter.age)} />
                  <Stat label="Competes" value={fighter.competes ? "Yes" : "No"} />
                  {fighter.heightCm != null && (
                    <Stat label="Height" value={`${fighter.heightCm} cm`} />
                  )}
                  {fighter.weightKg != null && (
                    <Stat label="Weight" value={`${fighter.weightKg} kg`} />
                  )}
                  <Stat label="Days in frame" value={String(stats.sinceDays)} />
                  <Stat label="Transmissions" value={String(stats.userTurns)} />
                  <Stat label="Observations" value={String(facts.length)} />
                  <Stat label="Avg confidence" value={stats.avgConf > 0 ? `${stats.avgConf.toFixed(1)}/5` : "—"} />
                  <Stat label="Vocabulary" value={`Tier ${fighter.vocabularyLevel}/5`} />
                  <Stat
                    label="Concepts held"
                    value={String(
                      facts.filter((f) => f.category === "technical_knowledge").length,
                    )}
                  />
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
      <ProfileAnimations />
    </div>
  );
}

function RankMeta({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-3 py-2.5 text-center">
      <div className="font-mono text-[8px] uppercase tracking-[0.25em] text-muted-foreground/80 mb-1">
        {label}
      </div>
      <div className="font-mono text-[10px] uppercase tracking-widest text-foreground/95 leading-tight">
        {value}
      </div>
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

function ArchRow({ label, text }: { label: string; text: string }) {
  return (
    <div className="px-4 py-3.5">
      <div
        className="font-mono text-[8px] uppercase tracking-[0.55em] mb-1.5"
        style={{ color: "hsl(32,54%,50%)" }}
      >
        {label}
      </div>
      <p className="text-[12px] text-foreground/75 leading-relaxed">{text}</p>
    </div>
  );
}

function ProfileAnimations() {
  return (
    <style>{`
      @keyframes profile-id-in {
        from { opacity: 0; transform: translateY(10px); }
        to   { opacity: 1; transform: translateY(0); }
      }
      .profile-id-card {
        animation: profile-id-in 0.55s cubic-bezier(0.22, 0.61, 0.36, 1) 0.05s both;
      }
      @media (prefers-reduced-motion: reduce) {
        .profile-id-card { animation: none; }
      }
    `}</style>
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
