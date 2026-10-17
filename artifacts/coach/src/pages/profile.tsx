import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useFighter } from "@/hooks/use-fighter";
import { useSubscription } from "@/hooks/use-subscription";
import { useFramePlus } from "@/components/frame-plus-modal";
import { useMemory } from "@/hooks/use-memory";
import { useActiveCompetition } from "@/hooks/use-competition";
import { BottomNav } from "@/components/bottom-nav";
import { Belt } from "@/components/belt";
import { ProfileEdit } from "@/components/profile-edit";
import { AthleteModel } from "@/components/athlete-model";
import { getArchetype, computeCoachingMode } from "@workspace/archetypes";
import { primaryFocus, primaryStrength } from "@/lib/primary-focus";
import { Link } from "wouter";
import {
  Camera,
  ChevronLeft,
  Loader2,
  LogOut,
  Pencil,
  Settings,
  Trash2,
} from "lucide-react";
import { api, heroFileUrl } from "@/lib/api";
import { isBjjSport } from "@/lib/fighter-options";
import { AuthedImage } from "@/components/authed-image";
import { useAuth } from "@/context/auth-context";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

// ─── Profile = who I am, in one glance. ──────────────────────────────────────
// Identity (archetype · BJJ belt when applicable · mode), one Focus line, one Strength line,
// Continue Calibration. Everything deeper lives in Analyse — the laboratory.

function LineItem({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="px-5 py-4 flex items-baseline justify-between gap-4">
      <div className="eyebrow flex-none w-20">
        {label}
      </div>
      <div className="min-w-0 text-right">
        <div
          className="text-[0.95rem] font-medium text-foreground truncate"
          title={sub}
        >
          {value}
        </div>
      </div>
    </div>
  );
}

export default function ProfilePage() {
  const { data: fighterData } = useFighter();
  const fighter = fighterData?.fighter ?? null;
  const { signOut, email } = useAuth();
  const [isEditing, setIsEditing] = useState(false);
  const [, setLocation] = useLocation();

  // ─── FRAME+ membership ────────────────────────────────────────────────
  const sub = useSubscription();
  const { openUpgrade } = useFramePlus();

  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const uploadHero = useMutation({
    mutationFn: (file: File) => api.uploadHero(file),
    onSuccess: () => {
      setUploadError(null);
      qc.invalidateQueries({ queryKey: ["fighter"] });
    },
    onError: (e) =>
      setUploadError(e instanceof Error ? e.message : "Upload failed"),
  });

  const removeHero = useMutation({
    mutationFn: () => api.removeHero(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["fighter"] }),
  });

  const onPickHero = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 12 * 1024 * 1024) {
      setUploadError("Image too large (max 12MB).");
      return;
    }
    uploadHero.mutate(file);
  };

  const heroBusy = uploadHero.isPending || removeHero.isPending;

  const memoryQuery = useMemory(!!fighter);
  const rawFacts = memoryQuery.data?.facts;
  const facts = Array.isArray(rawFacts) ? rawFacts : [];

  const compQuery = useActiveCompetition();

  const arch = fighter?.spiritAnimal ? getArchetype(fighter.spiritAnimal) : null;

  const mode = fighter
    ? computeCoachingMode({
        hasActiveCompetition: !!compQuery.data?.competition,
        level: fighter.level,
        modelSize: facts.length,
      })
    : null;

  const focus = fighter ? primaryFocus(fighter, facts) : null;
  const strength = primaryStrength(facts);

  const hasHero = !!fighter && fighter.heroImageUrl.trim() !== "";
  const heroSrc = hasHero ? heroFileUrl(fighter!.updatedAt) : null;

  return (
    <div className="flex flex-col h-[100dvh] text-foreground">
      <header className="flex-none flex items-center justify-between px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-3">
        <Link href="/home" aria-label="Back to home" className="icon-round text-muted-foreground hover:text-foreground transition-colors">
          <ChevronLeft className="w-5 h-5" strokeWidth={1.5} />
        </Link>
        <div className="text-center">
          <div className="eyebrow">
            Athlete
          </div>
          <h1 className="display-heading mt-0.5">Passport</h1>
        </div>
        {fighter && !isEditing ? (
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => setIsEditing(true)}
              className="icon-round text-muted-foreground hover:text-[#C7A15A] transition-colors"
              aria-label="Edit profile"
            >
              <Pencil className="w-4 h-4" strokeWidth={1.5} />
            </button>
          </div>
        ) : (
          <div className="w-11" />
        )}
      </header>

      <main className="flex-1 min-h-0 overflow-y-auto">
        <div className="max-w-md mx-auto px-5 py-5">
          {fighter && isEditing ? (
            <ProfileEdit fighter={fighter} onClose={() => setIsEditing(false)} />
          ) : fighter ? (
            <>
              {/* ─── IDENTITY BAND ─────────────────────────────────── */}
              <div
                className="glass glass-gold relative overflow-hidden passport-in !rounded-[1.75rem]"
                style={{ minHeight: 210 }}
              >
                <div className="absolute inset-0 overflow-hidden">
                  {heroSrc ? (
                    <AuthedImage
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
                          "radial-gradient(120% 90% at 80% 0%, hsla(39,49%,36%,0.34), transparent 60%), radial-gradient(90% 80% at 0% 100%, hsla(0,74%,43%,0.14), transparent 65%), hsla(30,14%,6%,0.6)",
                      }}
                    />
                  )}
                  <div
                    className="absolute inset-0"
                    style={{
                      background:
                        "linear-gradient(180deg, hsla(30,14%,6%,0.25) 0%, hsla(30,14%,6%,0.55) 55%, hsla(30,14%,6%,0.92) 100%)",
                    }}
                  />
                </div>

                {/* Cover-photo controls */}
                <div className="absolute top-3 right-3 z-10 flex items-center gap-2">
                  {hasHero && (
                    <button
                      type="button"
                      onClick={() => removeHero.mutate()}
                      disabled={heroBusy}
                      aria-label="Remove cover photo"
                      className="icon-round !w-11 !h-11 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
                    >
                      <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    disabled={heroBusy}
                    aria-label={hasHero ? "Change cover photo" : "Add cover photo"}
                    className="icon-round !w-11 !h-11 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
                  >
                    {heroBusy ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={1.5} />
                    ) : (
                      <Camera className="w-3.5 h-3.5" strokeWidth={1.5} />
                    )}
                  </button>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    className="hidden"
                    onChange={onPickHero}
                  />
                </div>

                <div className="relative z-[1] flex flex-col justify-end h-full min-h-[210px] px-4 pt-8 pb-4">
                  <div className="eyebrow eyebrow-gold mb-2">
                    Identity
                  </div>
                  <div className="display-title truncate">
                    {fighter.name}
                  </div>
                  {(arch || fighter.spiritAnimal) && (
                    <div
                      className="eyebrow eyebrow-gold mt-2"
                    >
                      {arch ? arch.name : fighter.spiritAnimal}
                      {mode ? ` · ${mode.label}` : ""}
                    </div>
                  )}
                </div>
              </div>

              {uploadError && (
                <div className="glass glass-red mt-3 px-4 py-2 font-mono text-[11px] text-[#E0564E] tracking-wide">
                  {uploadError}
                </div>
              )}

              {isBjjSport(fighter.primarySport) && (
                <div className="glass mt-3 px-5 py-4">
                  <Belt level={fighter.level} showMeaning />
                </div>
              )}

              {/* ─── FOCUS · STRENGTH ──────────────────────────────── */}
              <div className="glass mt-3 divide-y divide-white/[0.07] overflow-hidden">
                {focus && (
                  <LineItem label="Focus" value={focus.label} sub={focus.source} />
                )}
                {strength ? (
                  <LineItem
                    label="Strength"
                    value={strength.label}
                    sub={strength.source}
                  />
                ) : arch ? (
                  <LineItem
                    label="Gift"
                    value={arch.gift.split(/[.!]/)[0].trim()}
                    sub="your archetype's gift — FRAME hasn't observed a strength yet"
                  />
                ) : null}
                <Link
                  href="/chat"
                  className="flex items-center justify-between px-5 min-h-[56px] hover:bg-white/[0.04] transition-colors group"
                >
                  <span className="eyebrow eyebrow-gold">
                    Continue Calibration
                  </span>
                  <span className="font-mono text-[11px] text-foreground/70 group-hover:text-[#C7A15A] transition-colors">
                    →
                  </span>
                </Link>
              </div>

              {/* ─── ATHLETE MODEL — what FRAME knows ──────────────── */}
              <div className="pt-6">
                <div className="eyebrow eyebrow-gold mb-3">
                  Athlete Model
                </div>
                <AthleteModel variant="mobile" />
              </div>

              {/* ─── MEMBERSHIP ────────────────────────────────────── */}
              <div className="pt-6">
                {sub.isFramePlus ? (
                  <div className="glass glass-gold">
                    <div className="flex items-center justify-between px-5 py-4">
                      <div>
                        <div className="eyebrow eyebrow-gold">
                          FRAME+ active
                        </div>
                        {sub.status?.currentPeriodEnd && (
                          <div className="font-mono text-[10px] tracking-wide text-muted-foreground mt-1">
                            {sub.status.cancelAtPeriodEnd ? "Ends" : "Renews"}{" "}
                            {new Date(sub.status.currentPeriodEnd).toLocaleDateString(undefined, {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            })}
                          </div>
                        )}
                        <div className="font-mono text-[10px] tracking-wide text-muted-foreground mt-1">
                          Manage or cancel in the iOS app
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => openUpgrade()}
                    className="glass w-full flex items-center justify-between hover:border-primary/40 transition-colors px-5 py-4 text-left group"
                  >
                    <div>
                      <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-foreground/85 group-hover:text-[#C7A15A] transition-colors">
                        FRAME+
                      </div>
                      <div className="font-mono text-[10px] tracking-wide text-muted-foreground mt-1">
                        Unlimited coaching · full history · full mission ·
                        subscribe in the iOS app
                      </div>
                    </div>
                    <span className="font-mono text-[11px] text-foreground/70 group-hover:text-[#C7A15A] transition-colors">
                      →
                    </span>
                  </button>
                )}
              </div>

              {/* ─── ACCOUNT ───────────────────────────────────────── */}
              <div className="space-y-2.5 pt-6 pb-2">
                <div className="flex justify-center gap-4 font-mono text-[11px] uppercase tracking-[0.12em]">
                  <a href={`${basePath}/api/privacy`} target="_blank" rel="noreferrer" className="text-[#C7A15A] hover:underline">
                    Privacy & AI permissions
                  </a>
                  <a href={`${basePath}/api/terms`} target="_blank" rel="noreferrer" className="text-[#C7A15A] hover:underline">
                    Terms
                  </a>
                </div>
                {email && (
                  <div className="font-mono text-[10px] text-muted-foreground/90 tracking-wide text-center">
                    {email}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => { signOut(); setLocation(`${basePath}/sign-in`); }}
                  className="w-full flex items-center justify-center gap-2 hover:text-[#C7A15A] btn-quiet"
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
