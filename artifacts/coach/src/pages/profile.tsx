import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useClerk, useUser } from "@clerk/react";
import { useLocation } from "wouter";
import { useFighter } from "@/hooks/use-fighter";
import { useSubscription } from "@/hooks/use-subscription";
import { useFramePlus } from "@/components/frame-plus-modal";
import { useMemory } from "@/hooks/use-memory";
import { useActiveCompetition } from "@/hooks/use-competition";
import { BottomNav } from "@/components/bottom-nav";
import { Belt } from "@/components/belt";
import { ProfileEdit } from "@/components/profile-edit";
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

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

// ─── Profile = who I am, in one glance. ──────────────────────────────────────
// Identity (archetype · belt · mode), one Focus line, one Strength line,
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
    <div className="px-4 py-3.5 flex items-baseline justify-between gap-4">
      <div className="flex-none font-mono text-[9px] uppercase tracking-[0.35em] text-muted-foreground/65 w-20">
        {label}
      </div>
      <div className="min-w-0 text-right">
        <div
          className="font-mono text-[12px] uppercase tracking-[0.12em] text-foreground/95 truncate"
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
  const { signOut, openUserProfile } = useClerk();
  const { user } = useUser();
  const [isEditing, setIsEditing] = useState(false);
  const [, setLocation] = useLocation();

  // ─── FRAME+ membership ────────────────────────────────────────────────
  const sub = useSubscription();
  const { openUpgrade } = useFramePlus();
  const [upgradeNote, setUpgradeNote] = useState<
    "confirming" | "active" | "pending" | "cancelled" | null
  >(null);
  const confirmedRef = useRef(false);

  // Handle the Stripe Checkout return (?upgrade=success&session_id=... /
  // ?upgrade=cancelled): confirm server-side, then strip the query params.
  useEffect(() => {
    if (confirmedRef.current) return;
    const params = new URLSearchParams(window.location.search);
    const upgrade = params.get("upgrade");
    if (!upgrade) return;
    confirmedRef.current = true;

    if (upgrade === "cancelled") {
      setUpgradeNote("cancelled");
      setLocation("/profile", { replace: true });
      return;
    }
    if (upgrade === "success") {
      const sessionId = params.get("session_id");
      setLocation("/profile", { replace: true });
      if (!sessionId) return;
      setUpgradeNote("confirming");
      sub
        .confirm(sessionId)
        .then((ent) => {
          setUpgradeNote(ent.plan === "frame_plus" ? "active" : "pending");
        })
        .catch(() => {
          // Webhook remains the source of truth — refetch and stay honest.
          void sub.refetchStatus();
          setUpgradeNote("pending");
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => openUserProfile()}
              className="text-muted-foreground hover:text-primary transition-colors"
              aria-label="Account settings"
            >
              <Settings className="w-4 h-4" strokeWidth={1.5} />
            </button>
            <button
              type="button"
              onClick={() => setIsEditing(true)}
              className="text-muted-foreground hover:text-primary transition-colors"
              aria-label="Edit profile"
            >
              <Pencil className="w-4 h-4" strokeWidth={1.5} />
            </button>
          </div>
        ) : (
          <div className="w-5" />
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
                className="relative overflow-hidden border border-white/[0.08] passport-in"
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

                {/* Cover-photo controls */}
                <div className="absolute top-2.5 right-2.5 z-10 flex items-center gap-1.5">
                  {hasHero && (
                    <button
                      type="button"
                      onClick={() => removeHero.mutate()}
                      disabled={heroBusy}
                      aria-label="Remove cover photo"
                      className="w-7 h-7 flex items-center justify-center border border-white/15 bg-black/40 text-muted-foreground/80 hover:text-foreground hover:border-white/30 transition-colors disabled:opacity-40"
                    >
                      <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    disabled={heroBusy}
                    aria-label={hasHero ? "Change cover photo" : "Add cover photo"}
                    className="w-7 h-7 flex items-center justify-center border border-white/15 bg-black/40 text-muted-foreground/80 hover:text-primary hover:border-primary/40 transition-colors disabled:opacity-40"
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

                <div className="relative z-[1] flex flex-col justify-end h-full min-h-[190px] px-4 pt-8 pb-4">
                  <div className="font-mono text-[8px] uppercase tracking-[0.55em] text-muted-foreground/60 mb-1.5">
                    Identity
                  </div>
                  <div className="font-mono text-3xl uppercase tracking-[0.1em] text-foreground leading-none truncate">
                    {fighter.name}
                  </div>
                  {(arch || fighter.spiritAnimal) && (
                    <div
                      className="font-mono text-[10px] uppercase tracking-[0.4em] mt-2"
                      style={{ color: "hsl(32,54%,52%)" }}
                    >
                      {arch ? arch.name : fighter.spiritAnimal}
                      {mode ? ` · ${mode.label}` : ""}
                    </div>
                  )}
                </div>
              </div>

              {uploadError && (
                <div className="border-x border-b border-white/[0.08] px-4 py-2 font-mono text-[10px] text-destructive tracking-wide">
                  {uploadError}
                </div>
              )}

              {/* ─── RANK — the belt IS the identity ───────────────── */}
              <div className="border-x border-b border-white/[0.08] px-4 py-4">
                <Belt level={fighter.level} showMeaning />
              </div>

              {/* ─── FOCUS · STRENGTH ──────────────────────────────── */}
              <div className="border-x border-b border-white/[0.08] divide-y divide-white/[0.06]">
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
                  className="flex items-center justify-between px-4 py-3.5 hover:bg-white/[0.02] transition-colors group"
                >
                  <span className="font-mono text-[10px] uppercase tracking-[0.4em] text-primary/70 group-hover:text-primary transition-colors">
                    Continue Calibration
                  </span>
                  <span className="font-mono text-[11px] text-foreground/40 group-hover:text-primary transition-colors">
                    →
                  </span>
                </Link>
              </div>

              {/* ─── MEMBERSHIP ────────────────────────────────────── */}
              <div className="pt-6">
                {upgradeNote === "confirming" && (
                  <div className="mb-2.5 border-l-2 border-primary/50 bg-primary/[0.05] px-4 py-2.5 font-mono text-[10px] uppercase tracking-[0.25em] text-primary/85">
                    Confirming your upgrade
                  </div>
                )}
                {upgradeNote === "active" && (
                  <div className="mb-2.5 border-l-2 border-primary/60 bg-primary/[0.07] px-4 py-2.5 font-mono text-[10px] uppercase tracking-[0.25em] text-primary">
                    FRAME+ unlocked — everything is open
                  </div>
                )}
                {upgradeNote === "pending" && (
                  <div className="mb-2.5 border-l-2 border-border/60 bg-white/[0.02] px-4 py-2.5 font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
                    Payment processing — this can take a moment
                  </div>
                )}
                {upgradeNote === "cancelled" && (
                  <div className="mb-2.5 border-l-2 border-border/60 bg-white/[0.02] px-4 py-2.5 font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
                    Checkout cancelled — nothing was charged
                  </div>
                )}
                {sub.isFramePlus ? (
                  <div className="border border-primary/25 bg-primary/[0.04]">
                    <div className="flex items-center justify-between px-4 py-3.5">
                      <div>
                        <div className="font-mono text-[10px] uppercase tracking-[0.35em] text-primary">
                          FRAME+ active
                        </div>
                        {sub.status?.currentPeriodEnd && (
                          <div className="font-mono text-[9px] tracking-wide text-muted-foreground/70 mt-1">
                            {sub.status.cancelAtPeriodEnd ? "Ends" : "Renews"}{" "}
                            {new Date(sub.status.currentPeriodEnd).toLocaleDateString(undefined, {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            })}
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={sub.openPortal}
                        disabled={sub.portalPending}
                        className="border border-border/60 hover:border-primary/40 hover:text-primary text-foreground/75 transition-colors px-3 py-2 font-mono text-[9px] uppercase tracking-[0.25em] disabled:opacity-50"
                      >
                        {sub.portalPending ? "Opening" : "Manage"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => openUpgrade()}
                    className="w-full flex items-center justify-between border border-border/60 hover:border-primary/40 transition-colors px-4 py-3.5 text-left group"
                  >
                    <div>
                      <div className="font-mono text-[10px] uppercase tracking-[0.35em] text-foreground/85 group-hover:text-primary transition-colors">
                        FRAME+
                      </div>
                      <div className="font-mono text-[9px] tracking-wide text-muted-foreground/70 mt-1">
                        Unlimited coaching · full history · full mission
                        {sub.priceLabel ? ` · ${sub.priceLabel}` : ""}
                      </div>
                    </div>
                    <span className="font-mono text-[11px] text-foreground/40 group-hover:text-primary transition-colors">
                      →
                    </span>
                  </button>
                )}
              </div>

              {/* ─── ACCOUNT ───────────────────────────────────────── */}
              <div className="space-y-2.5 pt-6 pb-2">
                {user?.primaryEmailAddress?.emailAddress && (
                  <div className="font-mono text-[10px] text-muted-foreground/60 tracking-wide text-center">
                    {user.primaryEmailAddress.emailAddress}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => openUserProfile()}
                  className="w-full flex items-center justify-center gap-2 border border-border/60 hover:border-primary/40 hover:text-primary text-foreground/75 transition-colors py-2.5 font-mono text-[10px] uppercase tracking-[0.3em]"
                >
                  <Settings className="w-3.5 h-3.5" strokeWidth={1.5} />
                  Account &amp; security
                </button>
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
