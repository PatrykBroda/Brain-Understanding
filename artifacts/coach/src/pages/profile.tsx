import { useState } from "react";
import { useClerk, useUser } from "@clerk/react";
import { useFighter } from "@/hooks/use-fighter";
import { BottomNav } from "@/components/bottom-nav";
import { Belt } from "@/components/belt";
import { ProfileEdit } from "@/components/profile-edit";
import { sportLabel } from "@/lib/fighter-options";
import { getArchetype } from "@workspace/archetypes";
import { Link } from "wouter";
import { ChevronLeft, LogOut, Pencil } from "lucide-react";
import { heroFileUrl } from "@/lib/api";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

// ─── Profile = passport. "Who am I" — nothing else. ─────────────────────────
// Name, archetype, discipline, rank, one sentence. The full athlete model
// (observations, hypotheses, graphs, coverage) lives on Analyse now.

export default function ProfilePage() {
  const { data: fighterData } = useFighter();
  const fighter = fighterData?.fighter ?? null;
  const { signOut } = useClerk();
  const { user } = useUser();
  const [isEditing, setIsEditing] = useState(false);

  const arch = fighter?.spiritAnimal ? getArchetype(fighter.spiritAnimal) : null;
  // The one sentence describing the athlete: their own tagline first,
  // else the archetype essence. Both are real, recorded identity — no synthesis.
  const sentence =
    (fighter?.spiritAnimalTagline ?? "").trim() || arch?.essence || null;

  const hasHero = !!fighter && fighter.heroImageUrl.trim() !== "";
  const heroSrc = hasHero ? heroFileUrl(fighter!.updatedAt) : null;

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
            Passport
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

      <main className="flex-1 min-h-0 overflow-y-auto">
        <div className="max-w-md mx-auto h-full flex flex-col px-5 py-5">
          {fighter && isEditing ? (
            <ProfileEdit fighter={fighter} onClose={() => setIsEditing(false)} />
          ) : fighter ? (
            <>
              {/* ─── IDENTITY BAND ─────────────────────────────────── */}
              <div
                className="relative flex-none overflow-hidden border border-white/[0.08] passport-in"
                style={{ minHeight: 190 }}
              >
                <div className="absolute inset-0 overflow-hidden">
                  {heroSrc ? (
                    <img
                      src={heroSrc}
                      alt=""
                      className="w-full h-full object-cover"
                      style={{
                        opacity: 0.42,
                        objectPosition: `${fighter.heroPosX ?? 50}% ${fighter.heroPosY ?? 50}%`,
                        transform: `scale(${(fighter.heroZoom ?? 100) / 100})`,
                        transformOrigin: `${fighter.heroPosX ?? 50}% ${fighter.heroPosY ?? 50}%`,
                      }}
                      draggable={false}
                    />
                  ) : (
                    <div
                      className="w-full h-full"
                      style={{
                        background:
                          "radial-gradient(120% 90% at 80% 0%, hsla(32,54%,40%,0.16), transparent 60%), hsla(0,0%,0%,0.4)",
                      }}
                    />
                  )}
                  <div
                    className="absolute inset-0"
                    style={{
                      background:
                        "linear-gradient(180deg, hsla(0,0%,4%,0.35) 0%, hsla(0,0%,4%,0.55) 55%, hsl(0,0%,4%) 100%)",
                    }}
                  />
                </div>

                <div className="relative z-[1] flex flex-col justify-end h-full min-h-[190px] px-4 pt-8 pb-4">
                  <div className="font-mono text-[8px] uppercase tracking-[0.55em] text-muted-foreground/60 mb-1.5">
                    Athlete
                  </div>
                  <div className="font-mono text-3xl uppercase tracking-[0.1em] text-foreground leading-none truncate">
                    {fighter.name}
                  </div>
                  {arch ? (
                    <div
                      className="font-mono text-[10px] uppercase tracking-[0.4em] mt-2"
                      style={{ color: "hsl(32,54%,52%)" }}
                    >
                      {arch.name} Archetype
                    </div>
                  ) : fighter.spiritAnimal ? (
                    <div
                      className="font-mono text-[10px] uppercase tracking-[0.4em] mt-2"
                      style={{ color: "hsl(32,54%,52%)" }}
                    >
                      {fighter.spiritAnimal}
                    </div>
                  ) : null}
                </div>
              </div>

              {/* ─── DISCIPLINE ────────────────────────────────────── */}
              <div className="flex-none grid grid-cols-2 border-x border-b border-white/[0.08] divide-x divide-white/[0.06]">
                <div className="px-4 py-3">
                  <div className="font-mono text-[8px] uppercase tracking-[0.4em] text-muted-foreground/45 mb-1">
                    Discipline
                  </div>
                  <div className="font-mono text-[13px] tracking-wide text-foreground/90 truncate">
                    {fighter.primarySport ? sportLabel(fighter.primarySport) : fighter.art || "—"}
                  </div>
                </div>
                <div className="px-4 py-3">
                  <div className="font-mono text-[8px] uppercase tracking-[0.4em] text-muted-foreground/45 mb-1">
                    Level
                  </div>
                  <div className="font-mono text-[13px] tracking-wide text-foreground/90 capitalize truncate">
                    {fighter.level}
                  </div>
                </div>
              </div>

              {/* ─── ONE SENTENCE ──────────────────────────────────── */}
              {sentence && (
                <p className="flex-none text-[13px] italic text-foreground/60 leading-relaxed px-1 pt-4">
                  {sentence}
                </p>
              )}

              {/* ─── RANK ──────────────────────────────────────────── */}
              <div className="flex-1 min-h-0 flex items-center py-3">
                <div className="w-full">
                  <Belt level={fighter.level} showMeaning />
                </div>
              </div>

              {/* ─── ACCOUNT ───────────────────────────────────────── */}
              <div className="flex-none space-y-2.5 pb-2">
                {user?.primaryEmailAddress?.emailAddress && (
                  <div className="font-mono text-[10px] text-muted-foreground/60 tracking-wide text-center">
                    {user.primaryEmailAddress.emailAddress}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => signOut({ redirectUrl: basePath || "/" })}
                  className="w-full flex items-center justify-center gap-2 border border-border/60 hover:border-primary/40 hover:text-primary text-foreground/75 transition-colors py-2.5 font-mono text-[10px] uppercase tracking-[0.3em]"
                >
                  <LogOut className="w-3.5 h-3.5" strokeWidth={1.5} />
                  Sign out
                </button>
              </div>
            </>
          ) : (
            <div className="text-sm text-muted-foreground py-10 text-center">
              No athlete profile yet.
            </div>
          )}
        </div>
      </main>

      <BottomNav />

      <style>{`
        @keyframes passport-in {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .passport-in {
          animation: passport-in 0.55s cubic-bezier(0.22, 0.61, 0.36, 1) 0.05s both;
        }
        @media (prefers-reduced-motion: reduce) {
          .passport-in { animation: none; }
        }
      `}</style>
    </div>
  );
}
