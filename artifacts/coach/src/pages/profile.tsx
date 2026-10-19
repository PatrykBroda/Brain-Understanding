import { useRef, useState } from "react";
import { MEDIA } from "@/components/media-backdrop";
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
import { AnswersSection } from "@/components/answers-section";
import { getArchetype, computeCoachingMode } from "@workspace/archetypes";
import { primaryFocus, primaryStrength } from "@/lib/primary-focus";
import { Link } from "wouter";
import {
  Camera,
  ChevronLeft,
  ChevronRight,
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
      <div className="label flex-none w-20">{label}</div>
      <div className="min-w-0 text-right">
        <div
          className="text-[1rem] font-medium text-foreground"
          title={sub}
        >
          {value}
        </div>
      </div>
    </div>
  );
}

export default function ProfilePage() {
  const { data: fighterData, isLoading: fighterLoading, isError: fighterError, refetch: refetchFighter } = useFighter();
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
        <h1 className="display-heading text-center">Athlete profile</h1>
        {fighter && !isEditing ? (
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => setIsEditing(true)}
              className="icon-round text-muted-foreground hover:text-foreground transition-colors"
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
        <div className="max-w-md md:max-w-xl mx-auto px-5 py-5">
          {fighter && isEditing ? (
            <ProfileEdit fighter={fighter} onClose={() => setIsEditing(false)} />
          ) : fighter ? (
            <>
              {/* ─── IDENTITY BAND ─────────────────────────────────── */}
              <div
                className="glass relative overflow-hidden passport-in !rounded-[20px]"
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
                    <>
                      <img
                        src={MEDIA.poster}
                        alt=""
                        aria-hidden
                        className="w-full h-full object-cover"
                        style={{ objectPosition: "30% 55%", opacity: 0.6, filter: "grayscale(1) contrast(1.05)" }}
                        draggable={false}
                      />
                    </>
                  )}
                  <div
                    className="absolute inset-0"
                    style={{
                      background:
                        "linear-gradient(180deg, rgba(8,9,11,0.2) 0%, rgba(8,9,11,0.55) 50%, rgba(8,9,11,0.94) 100%)",
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
                  <div className="display-title truncate">
                    {fighter.name}
                  </div>
                  {(arch || fighter.spiritAnimal) && (
                    <div className="label !text-[#D4C7A3] mt-1.5">
                      {arch ? arch.name : fighter.spiritAnimal}
                      {mode ? ` · ${mode.label}` : ""}
                    </div>
                  )}
                </div>
              </div>

              {uploadError && (
                <div role="alert" className="glass glass-red mt-3 px-4 py-3 text-[0.9375rem] text-[#E5645A]">
                  {uploadError}
                </div>
              )}

              {isBjjSport(fighter.primarySport) && (
                <div className="glass mt-3 px-5 py-4">
                  <Belt level={fighter.level} showMeaning />
                </div>
              )}

              {/* ─── FOCUS · STRENGTH ──────────────────────────────── */}
              <div className="glass mt-3 divide-y divide-white/[0.06] overflow-hidden">
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
                  <span className="text-[1rem] font-medium text-[#D4C7A3]">Continue calibration</span>
                  <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-[#B9A477] transition-colors" strokeWidth={1.5} />
                </Link>
              </div>

              {/* ─── YOUR ANSWERS — the onboarding questionnaire, editable any time ─── */}
              <div className="pt-6">
                <AnswersSection fighter={fighter} />
              </div>

              {/* ─── ATHLETE MODEL — what FRAME knows ──────────────── */}
              <div className="pt-6">
                <AthleteModel variant="mobile" />
              </div>

              {/* ─── MEMBERSHIP ────────────────────────────────────── */}
              <div className="pt-6">
                {sub.isFramePlus ? (
                  <div className="glass px-5 py-4">
                    <span className="chip chip-gold">FRAME+ active</span>
                    {sub.status?.currentPeriodEnd && (
                      <div className="text-[0.9375rem] tnum text-foreground/85 mt-2">
                        {sub.status.cancelAtPeriodEnd ? "Ends" : "Renews"}{" "}
                        {new Date(sub.status.currentPeriodEnd).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </div>
                    )}
                    <div className="text-[0.875rem] text-muted-foreground mt-1">
                      Manage or cancel in the iOS app
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => openUpgrade()}
                    className="glass w-full flex items-center justify-between hover:border-white/20 transition-colors px-5 py-4 text-left group"
                  >
                    <div>
                      <div className="text-[1rem] font-medium text-foreground">FRAME+</div>
                      <div className="text-[0.875rem] text-muted-foreground mt-1">
                        Unlimited coaching, full history and mission. Subscribe in the iOS app.
                      </div>
                    </div>
                    <ChevronRight className="w-5 h-5 flex-none text-muted-foreground group-hover:text-[#B9A477] transition-colors" strokeWidth={1.5} />
                  </button>
                )}
              </div>

              {/* ─── ACCOUNT ───────────────────────────────────────── */}
              <div className="space-y-2.5 pt-6 pb-2">
                <div className="flex justify-center gap-6 text-[0.875rem]">
                  <a href={`${basePath}/api/privacy`} target="_blank" rel="noreferrer" className="min-h-[44px] inline-flex items-center text-muted-foreground hover:text-foreground underline underline-offset-4 decoration-white/20">
                    Privacy and AI permissions
                  </a>
                  <a href={`${basePath}/api/terms`} target="_blank" rel="noreferrer" className="min-h-[44px] inline-flex items-center text-muted-foreground hover:text-foreground underline underline-offset-4 decoration-white/20">
                    Terms
                  </a>
                </div>
                {email && (
                  <div className="text-[0.875rem] text-muted-foreground text-center">
                    {email}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => { signOut(); setLocation(`${basePath}/sign-in`); }}
                  className="w-full btn-quiet"
                >
                  <LogOut className="w-4 h-4" strokeWidth={1.5} />
                  Sign out
                </button>
              </div>
            </>
          ) : fighterLoading ? (
            <div className="flex flex-col items-center gap-3 py-16 text-[0.9375rem] text-muted-foreground" role="status">
              <span className="h-5 w-5 rounded-full border-2 border-white/15 border-t-[#B9A477] animate-spin motion-reduce:animate-none" aria-hidden />
              Loading your profile
            </div>
          ) : fighterError ? (
            <div role="alert" className="glass glass-red px-5 py-5 space-y-3">
              <div className="text-[1rem] font-medium text-[#E5645A]">Could not load your profile</div>
              <p className="text-[0.9375rem] text-foreground/80">Check your connection and try again.</p>
              <button type="button" onClick={() => void refetchFighter()} className="btn-quiet btn-quiet-red">
                Try again
              </button>
            </div>
          ) : (
            <div className="glass px-5 py-8">
              <h2 className="section-title">No athlete profile yet</h2>
              <p className="mt-2 text-[1rem] leading-[1.6] text-muted-foreground">
                Tell FRAME who you are and your coaching starts from there.
              </p>
              <Link href="/home" className="btn-bronze mt-5 w-full">
                Back to home
              </Link>
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
          animation: passport-in 0.32s cubic-bezier(0.2, 0, 0, 1) both;
        }
        @media (prefers-reduced-motion: reduce) {
          .passport-in { animation: none; }
        }
      `}</style>
    </div>
  );
}
