import { useRef, useState } from "react";
import { Link } from "wouter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Camera,
  Loader2,
  Trash2,
  ChevronRight,
  Target,
  ClipboardList,
  MessageSquare,
} from "lucide-react";
import { api, heroFileUrl, type Fighter } from "@/lib/api";
import { sportLabel } from "@/lib/fighter-options";
import { useAnalyses } from "@/hooks/use-analysis";
import { useActiveCompetition } from "@/hooks/use-competition";
import { usePlanner } from "@/hooks/use-planner";

// ─── Stat cell ───────────────────────────────────────────────────────────────
function Stat({ label, value }: { label: string; value: string }) {
  const set = value.trim() !== "";
  return (
    <div className="px-3 py-2.5">
      <div className="font-mono text-[8px] uppercase tracking-[0.4em] text-muted-foreground/45 mb-1">
        {label}
      </div>
      <div
        className={`font-mono text-[13px] tracking-wide ${
          set ? "text-foreground/90" : "text-muted-foreground/30"
        }`}
      >
        {set ? value : "—"}
      </div>
    </div>
  );
}

// ─── Attribute bar (readiness sub-scores) ────────────────────────────────────
function AttrBar({ label, value }: { label: string; value: number }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1">
        <span className="font-mono text-[8px] uppercase tracking-[0.3em] text-muted-foreground/55 truncate">
          {label}
        </span>
        <span className="font-mono text-[10px] tabular-nums text-foreground/75">{pct}</span>
      </div>
      <div className="h-[3px] bg-white/[0.07]">
        <div
          className="h-full transition-[width] duration-700"
          style={{ width: `${pct}%`, background: "hsl(32,54%,50%)" }}
        />
      </div>
    </div>
  );
}

// ─── Section header ──────────────────────────────────────────────────────────
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="font-mono text-[9px] uppercase tracking-[0.4em] text-primary/75">
      {children}
    </div>
  );
}

export function FighterCard({ fighter }: { fighter: Fighter }) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const analysesQuery = useAnalyses();
  const latest =
    analysesQuery.data?.analyses?.find((a) => !a.locked && a.sessionScore != null) ?? null;

  const compQuery = useActiveCompetition();
  const pressure = compQuery.data?.pressure ?? null;

  const plannerQuery = usePlanner();
  const plan = plannerQuery.data?.plan ?? null;
  const completions = plannerQuery.data?.completions ?? [];

  const uploadHero = useMutation({
    mutationFn: (file: File) => api.uploadHero(file),
    onSuccess: () => {
      setUploadError(null);
      qc.invalidateQueries({ queryKey: ["fighter"] });
    },
    onError: (e) => setUploadError(e instanceof Error ? e.message : "Upload failed"),
  });

  const removeHero = useMutation({
    mutationFn: () => api.removeHero(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["fighter"] }),
  });

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 12 * 1024 * 1024) {
      setUploadError("Image too large (max 12MB).");
      return;
    }
    uploadHero.mutate(file);
  };

  const firstName = fighter.name.split(/\s+/)[0] || fighter.name;
  const hasHero = fighter.heroImageUrl.trim() !== "";
  const heroSrc = hasHero ? heroFileUrl(fighter.updatedAt) : null;
  const busy = uploadHero.isPending || removeHero.isPending;

  const attrScores = (latest?.scores ?? []).slice(0, 4);

  return (
    <div className="border border-white/[0.08] overflow-hidden">
      {/* ─── HERO BAND ─────────────────────────────────────────────── */}
      <div className="relative overflow-hidden" style={{ minHeight: 176 }}>
        {/* Background image (faded) or fallback gradient */}
        <div className="absolute inset-0 overflow-hidden">
          {heroSrc ? (
            <img
              src={heroSrc}
              alt=""
              className="w-full h-full object-cover"
              style={{
                opacity: 0.4,
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

        {/* Hero controls */}
        <div className="absolute top-2.5 right-2.5 z-10 flex items-center gap-1.5">
          {hasHero && (
            <button
              type="button"
              onClick={() => removeHero.mutate()}
              disabled={busy}
              aria-label="Remove hero image"
              className="w-7 h-7 flex items-center justify-center border border-white/15 bg-black/40 text-muted-foreground/80 hover:text-foreground hover:border-white/30 transition-colors disabled:opacity-40"
            >
              <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
            </button>
          )}
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            aria-label={hasHero ? "Change hero image" : "Add hero image"}
            className="w-7 h-7 flex items-center justify-center border border-white/15 bg-black/40 text-muted-foreground/80 hover:text-primary hover:border-primary/40 transition-colors disabled:opacity-40"
          >
            {busy ? (
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
            onChange={onPick}
          />
        </div>

        {/* Overlaid identity */}
        <div className="relative z-[1] flex flex-col justify-end h-full min-h-[176px] px-4 pt-8 pb-4">
          <div className="font-mono text-[8px] uppercase tracking-[0.55em] text-muted-foreground/60 mb-1.5">
            Athlete
          </div>
          <div className="font-mono text-3xl uppercase tracking-[0.1em] text-foreground leading-none truncate">
            {fighter.name}
          </div>
          {fighter.spiritAnimal && (
            <div
              className="font-mono text-[10px] uppercase tracking-[0.4em] mt-2"
              style={{ color: "hsl(32,54%,52%)" }}
            >
              {fighter.spiritAnimal}
            </div>
          )}
          <div className="font-mono text-[11px] text-muted-foreground/70 mt-2">
            hello, {firstName.toLowerCase()}
          </div>
        </div>
      </div>

      {uploadError && (
        <div className="px-4 py-2 font-mono text-[10px] text-destructive border-t border-white/[0.06]">
          {uploadError}
        </div>
      )}

      {/* ─── FIGHT READINESS ───────────────────────────────────────── */}
      <div className="px-4 py-4 border-t border-white/[0.06]">
        <div className="flex items-center justify-between mb-3">
          <SectionLabel>Fight readiness</SectionLabel>
          <span className="font-mono text-[8px] uppercase tracking-[0.3em] text-muted-foreground/45">
            {latest ? "Last session" : "Locked"}
          </span>
        </div>

        {latest ? (
          <>
            <div className="flex items-end gap-4 mb-4">
              <div className="font-mono text-5xl tabular-nums text-foreground leading-none">
                {Math.round(latest.sessionScore ?? 0)}
                <span className="text-lg text-muted-foreground/50">/100</span>
              </div>
              <div className="pb-1 min-w-0">
                <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-primary/80 truncate">
                  {latest.styleProfile}
                </div>
                <div className="font-mono text-[8px] uppercase tracking-widest text-muted-foreground/45 mt-1">
                  {new Date(latest.createdAt).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                  })}
                </div>
              </div>
            </div>
            {attrScores.length > 0 && (
              <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
                {attrScores.map((s) => (
                  <AttrBar key={s.key} label={s.label} value={Math.round(s.value)} />
                ))}
              </div>
            )}
            <p className="font-mono text-[9px] text-muted-foreground/45 leading-relaxed mt-3">
              Measured from your most recent analysed session. Analyse another to update it.
            </p>
          </>
        ) : (
          <Link
            href="/analyse"
            className="flex items-center justify-between border border-white/[0.1] hover:border-primary/40 px-4 py-4 group transition-colors"
          >
            <div>
              <div className="font-mono text-[11px] uppercase tracking-[0.2em] text-foreground/80 group-hover:text-primary transition-colors">
                Analyse a session to unlock
              </div>
              <p className="font-mono text-[9px] text-muted-foreground/50 leading-relaxed mt-1.5 max-w-[15rem]">
                FRAME reads readiness from real footage — no session, no number. Nothing is estimated.
              </p>
            </div>
            <ChevronRight
              className="w-4 h-4 text-muted-foreground/40 group-hover:text-primary transition-colors flex-none"
              strokeWidth={1.5}
            />
          </Link>
        )}
      </div>

      {/* ─── STATS GRID ────────────────────────────────────────────── */}
      <div
        className="grid grid-cols-3 border-t border-white/[0.06]"
        style={{ borderColor: "hsla(0,0%,100%,0.06)" }}
      >
        <div className="border-r border-b border-white/[0.05]">
          <Stat
            label="Discipline"
            value={fighter.primarySport ? sportLabel(fighter.primarySport) : fighter.art}
          />
        </div>
        <div className="border-r border-b border-white/[0.05]">
          <Stat label="Record" value={fighter.record} />
        </div>
        <div className="border-b border-white/[0.05]">
          <Stat label="Weight class" value={fighter.weightClass} />
        </div>
        <div className="border-r border-white/[0.05]">
          <Stat label="Stance" value={fighter.stance} />
        </div>
        <div className="border-r border-white/[0.05]">
          <Stat label="Height" value={fighter.heightCm != null ? `${fighter.heightCm} cm` : ""} />
        </div>
        <div>
          <Stat label="Reach" value={fighter.reachCm != null ? `${fighter.reachCm} cm` : ""} />
        </div>
      </div>

      {/* ─── CAMP ──────────────────────────────────────────────────── */}
      {(fighter.gym.trim() !== "" || fighter.headCoach.trim() !== "") && (
        <div className="px-4 py-3.5 border-t border-white/[0.06]">
          <SectionLabel>Camp</SectionLabel>
          <div className="grid grid-cols-2 gap-4 mt-2.5">
            <div>
              <div className="font-mono text-[8px] uppercase tracking-[0.4em] text-muted-foreground/45 mb-1">
                Team
              </div>
              <div className="font-mono text-[12px] text-foreground/90">
                {fighter.gym.trim() || "—"}
              </div>
            </div>
            <div>
              <div className="font-mono text-[8px] uppercase tracking-[0.4em] text-muted-foreground/45 mb-1">
                Head coach
              </div>
              <div className="font-mono text-[12px] text-foreground/90">
                {fighter.headCoach.trim() || "—"}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── COMPETITION CONTEXT ───────────────────────────────────── */}
      {pressure && (
        <Link
          href="/camp"
          className="block px-4 py-3.5 border-t group transition-colors"
          style={{
            borderColor: "hsla(0,72%,45%,0.25)",
            background: "linear-gradient(180deg, hsla(0,72%,42%,0.07), transparent 80%)",
          }}
        >
          <div className="flex items-center justify-between mb-2.5">
            <div className="font-mono text-[9px] uppercase tracking-[0.4em] text-red-400/85">
              Competition context
            </div>
            <span className="font-mono text-[8px] uppercase tracking-[0.25em] text-red-400/60">
              {pressure.tierLabel}
            </span>
          </div>
          <div className="flex items-end justify-between gap-3">
            <div className="min-w-0">
              <div className="font-mono text-[13px] text-foreground/90 truncate">
                {pressure.competition.eventName}
              </div>
              {pressure.competition.targetWeight.trim() !== "" && (
                <div className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground/50 mt-1">
                  Target {pressure.competition.targetWeight}
                  {pressure.competition.currentWeight.trim() !== ""
                    ? ` · now ${pressure.competition.currentWeight}`
                    : ""}
                </div>
              )}
            </div>
            <div className="text-right flex-none">
              <div className="font-mono text-2xl tabular-nums text-red-400/90 leading-none">
                {Math.max(0, pressure.daysToEvent)}
              </div>
              <div className="font-mono text-[8px] uppercase tracking-[0.3em] text-muted-foreground/50 mt-1">
                days out
              </div>
            </div>
          </div>
        </Link>
      )}

      {/* ─── WEEKLY MISSION ────────────────────────────────────────── */}
      <Link
        href="/camp"
        className="block px-4 py-3.5 border-t border-white/[0.06] hover:bg-white/[0.02] group transition-colors"
      >
        <div className="flex items-center justify-between mb-2">
          <SectionLabel>Weekly mission</SectionLabel>
          <ChevronRight
            className="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-primary transition-colors"
            strokeWidth={1.5}
          />
        </div>
        {plan && plan.items.length > 0 ? (
          <>
            <div className="font-mono text-[12px] text-foreground/85 leading-snug">
              {plan.items[0].title}
            </div>
            <div className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground/45 mt-1.5">
              {completions.length}/{plan.items.length} complete
            </div>
          </>
        ) : (
          <div className="font-mono text-[11px] text-muted-foreground/55 leading-relaxed">
            No active mission yet. Open the planner to generate this week's focus.
          </div>
        )}
      </Link>

      {/* ─── ACTIONS ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 border-t border-white/[0.06]">
        <Link
          href="/chat"
          className="flex flex-col items-center gap-1.5 py-3.5 border-r border-white/[0.05] text-muted-foreground/70 hover:text-primary hover:bg-white/[0.02] transition-colors"
        >
          <Target className="w-4 h-4" strokeWidth={1.5} />
          <span className="font-mono text-[8px] uppercase tracking-[0.25em]">Calibrate</span>
        </Link>
        <Link
          href="/analyse"
          className="flex flex-col items-center gap-1.5 py-3.5 border-r border-white/[0.05] text-muted-foreground/70 hover:text-primary hover:bg-white/[0.02] transition-colors"
        >
          <ClipboardList className="w-4 h-4" strokeWidth={1.5} />
          <span className="font-mono text-[8px] uppercase tracking-[0.25em]">Log session</span>
        </Link>
        <Link
          href="/chat"
          className="flex flex-col items-center gap-1.5 py-3.5 text-muted-foreground/70 hover:text-primary hover:bg-white/[0.02] transition-colors"
        >
          <MessageSquare className="w-4 h-4" strokeWidth={1.5} />
          <span className="font-mono text-[8px] uppercase tracking-[0.25em]">Talk to FRAME</span>
        </Link>
      </div>
    </div>
  );
}
