import { useRef, useState } from "react";
import { Link } from "wouter";
import { ChevronRight, Pencil, Move, Lock } from "lucide-react";
import { BottomNav } from "@/components/bottom-nav";
import { CompetitionBanner } from "@/components/competition-banner";
import { FramePlusPill, useFramePlus } from "@/components/frame-plus-modal";
import { FrameWordmark } from "@/components/frame-wordmark";
import { useSubscription } from "@/hooks/use-subscription";
import { useFighter, useUpdateFighter } from "@/hooks/use-fighter";
import { useAutoWelcome } from "@/hooks/use-auto-welcome";
import { useAnalyses } from "@/hooks/use-analysis";
import { useActiveCompetition } from "@/hooks/use-competition";
import { useTodayCheckin, useSaveCheckin, useCheckinHistory } from "@/hooks/use-checkin";
import { useMemory } from "@/hooks/use-memory";
import { primaryFocus } from "@/lib/primary-focus";
import { heroFileUrl, type DailyCheckin } from "@/lib/api";

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

// Categorical read of a REAL composite — interpretation, not fabrication.
function bandFor(score: number): string {
  if (score >= 80) return "Primed";
  if (score >= 65) return "Trainable";
  if (score >= 45) return "Guarded";
  return "Depleted";
}

function MetaDivider() {
  return <span aria-hidden className="text-foreground/25 px-2">·</span>;
}

const METRIC_LABELS: { key: "sleep" | "energy" | "soreness" | "stress"; label: string; hint: string }[] = [
  { key: "sleep", label: "Sleep", hint: "How rested you woke up" },
  { key: "energy", label: "Energy", hint: "Fuel in the tank right now" },
  { key: "soreness", label: "Soreness", hint: "100 = no soreness at all" },
  { key: "stress", label: "Stress", hint: "100 = completely clear-headed" },
];

function CheckinForm({
  existing,
  onDone,
}: {
  existing: DailyCheckin | null;
  onDone: () => void;
}) {
  const save = useSaveCheckin();
  const [values, setValues] = useState({
    sleep: existing?.sleep ?? 70,
    energy: existing?.energy ?? 70,
    soreness: existing?.soreness ?? 70,
    stress: existing?.stress ?? 70,
  });
  const [hr, setHr] = useState(existing?.restingHr != null ? String(existing.restingHr) : "");
  const [err, setErr] = useState<string | null>(null);

  const submit = () => {
    const restingHr = hr.trim() === "" ? null : Number(hr);
    if (restingHr != null && (!Number.isInteger(restingHr) || restingHr < 25 || restingHr > 220)) {
      setErr("Resting HR must be a whole number between 25 and 220.");
      return;
    }
    setErr(null);
    save.mutate(
      { ...values, restingHr },
      {
        onSuccess: onDone,
        onError: (e) => setErr(e instanceof Error ? e.message : "Couldn't save check-in"),
      },
    );
  };

  return (
    <div className="mt-5 rounded-2xl border border-white/[0.07] bg-white/[0.015] p-5 space-y-5">
      <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-foreground/50 leading-relaxed">
        Rate how you actually feel. 100 = fully recovered.
      </p>
      {METRIC_LABELS.map(({ key, label, hint }) => (
        <div key={key}>
          <div className="flex items-baseline justify-between mb-1.5">
            <label
              htmlFor={`checkin-${key}`}
              className="font-mono text-[10px] uppercase tracking-[0.35em] text-foreground/70"
            >
              {label}
            </label>
            <span className="font-sans font-light text-[15px] tabular-nums text-primary/90">
              {values[key]}
            </span>
          </div>
          <input
            id={`checkin-${key}`}
            type="range"
            min={0}
            max={100}
            step={1}
            value={values[key]}
            onChange={(e) => setValues((v) => ({ ...v, [key]: Number(e.target.value) }))}
            className="w-full accent-[hsl(35,65%,55%)]"
            aria-describedby={`checkin-${key}-hint`}
          />
          <div
            id={`checkin-${key}-hint`}
            className="font-mono text-[9px] uppercase tracking-[0.2em] text-foreground/30 mt-1"
          >
            {hint}
          </div>
        </div>
      ))}
      <div>
        <label
          htmlFor="checkin-hr"
          className="font-mono text-[10px] uppercase tracking-[0.35em] text-foreground/70 block mb-1.5"
        >
          Resting HR <span className="text-foreground/35 tracking-[0.2em]">(optional, bpm)</span>
        </label>
        <input
          id="checkin-hr"
          type="number"
          inputMode="numeric"
          min={25}
          max={220}
          value={hr}
          onChange={(e) => setHr(e.target.value)}
          placeholder="—"
          className="w-24 bg-[hsl(0,0%,7%)] border border-white/[0.08] rounded-lg px-3 py-2 text-[14px] text-foreground placeholder:text-foreground/25 focus:border-primary/40 focus:outline-none tabular-nums"
        />
      </div>
      {err && <p className="font-mono text-[10px] text-destructive">{err}</p>}
      <div className="flex items-center gap-4 pt-1">
        <button
          type="button"
          onClick={submit}
          disabled={save.isPending}
          className="px-5 py-2.5 rounded-xl border border-primary/40 font-mono text-[10px] uppercase tracking-[0.35em] text-primary hover:border-primary/70 transition-colors duration-300 disabled:opacity-40"
        >
          {save.isPending ? "Saving" : existing ? "Update" : "Log check-in"}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="font-mono text-[10px] uppercase tracking-[0.3em] text-foreground/40 hover:text-foreground/70 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// Readiness trend (FRAME+) — daily composites from REAL logged check-ins only.
// A trend needs at least two days; below that we say so instead of drawing one.
function ReadinessTrend({ checkins }: { checkins: DailyCheckin[] }) {
  const points = checkins.map((c) => ({
    date: c.checkinDate,
    score: Math.round((c.sleep + c.energy + c.soreness + c.stress) / 4),
  }));

  if (points.length < 2) {
    return (
      <div>
        <div className="font-mono text-[10px] uppercase tracking-[0.35em] text-foreground/55">
          Readiness trend
        </div>
        <p className="mt-2 font-mono text-[9px] uppercase tracking-[0.3em] text-foreground/35 leading-relaxed">
          {points.length === 0
            ? "No check-ins in the last 30 days — log one to start the trend."
            : "One check-in logged — the trend starts at two."}
        </p>
      </div>
    );
  }

  const shortDay = (iso: string) => {
    const d = new Date(`${iso}T00:00:00Z`);
    return `${d.getUTCDate()}/${d.getUTCMonth() + 1}`;
  };
  const first = points[0];
  const last = points[points.length - 1];
  const delta = last.score - first.score;

  return (
    <div>
      <div className="flex items-baseline justify-between gap-4">
        <div className="font-mono text-[10px] uppercase tracking-[0.35em] text-foreground/55">
          Readiness trend
        </div>
        <div className="font-mono text-[9px] uppercase tracking-[0.3em] text-foreground/35">
          {points.length} days · {delta === 0 ? "level" : delta > 0 ? `+${delta}` : `${delta}`}
        </div>
      </div>
      <div
        className="mt-4 flex items-end gap-[3px] h-14"
        role="img"
        aria-label={`Readiness composites over the last ${points.length} logged days, from ${first.score} to ${last.score}`}
      >
        {points.map((p) => (
          <div
            key={p.date}
            title={`${p.date}: ${p.score}`}
            className={`flex-1 rounded-t-[1px] ${p.date === last.date ? "bg-primary/80" : "bg-foreground/25"}`}
            style={{ height: `${Math.max(6, p.score)}%` }}
          />
        ))}
      </div>
      <div className="mt-2 flex justify-between font-mono text-[8px] uppercase tracking-[0.25em] text-foreground/30" aria-hidden>
        <span>{shortDay(first.date)}</span>
        <span>{shortDay(last.date)}</span>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { data: fighterData } = useFighter();
  // Login lands here now — fire the one-time deterministic welcome (server-guarded, idempotent)
  useAutoWelcome();
  const fighter = fighterData?.fighter ?? null;

  const analysesQuery = useAnalyses();
  const latest =
    analysesQuery.data?.analyses?.find((a) => !a.locked && a.sessionScore != null) ?? null;

  const checkinQuery = useTodayCheckin();
  const checkin = checkinQuery.data?.checkin ?? null;

  // Readiness trend is FRAME+ — only fetch when entitled; free shows a teaser.
  const { isFramePlus } = useSubscription();
  const { openUpgrade } = useFramePlus();
  const historyQuery = useCheckinHistory(isFramePlus);
  const historyCheckins = historyQuery.data?.checkins ?? [];

  const activeComp = useActiveCompetition();
  const competition = activeComp.data?.competition ?? null;
  const pressure = activeComp.data?.pressure ?? null;

  const memoryQuery = useMemory(!!fighter);
  const rawFacts = memoryQuery.data?.facts;
  const facts = Array.isArray(rawFacts) ? rawFacts : [];
  // The one highest-value insight — the coach's voice, not an analytics dump.
  const focus = fighter ? primaryFocus(fighter, facts) : null;
  const hasFocus = !!focus && focus.label !== "Not yet identified";

  const [editing, setEditing] = useState(false);

  // Readiness is only ever a real composite: today's self-reported check-in
  // first, else the most recent analysed session. No data — no number.
  const checkinScore = checkin
    ? Math.round((checkin.sleep + checkin.energy + checkin.soreness + checkin.stress) / 4)
    : null;
  const sessionScore = latest?.sessionScore != null ? Math.round(latest.sessionScore) : null;
  const readiness = checkinScore ?? sessionScore;
  const provenance =
    checkinScore != null
      ? "Today's check-in"
      : sessionScore != null
        ? "Last session"
        : null;

  const hasHero = !!fighter && fighter.heroImageUrl.trim() !== "";
  const heroSrc = hasHero ? heroFileUrl(fighter!.updatedAt) : null;

  // ── Hero framing (athlete-adjustable, persisted on the fighter row) ──────
  const updateFighter = useUpdateFighter();
  const [adjusting, setAdjusting] = useState(false);
  const [draft, setDraft] = useState({ posX: 50, posY: 50, zoom: 100 });
  const dragRef = useRef<{ pointerId: number; x: number; y: number; posX: number; posY: number } | null>(null);
  const heroBoxRef = useRef<HTMLDivElement>(null);

  const framing = adjusting
    ? draft
    : {
        posX: fighter?.heroPosX ?? 50,
        posY: fighter?.heroPosY ?? 50,
        zoom: fighter?.heroZoom ?? 100,
      };

  const startAdjust = () => {
    setDraft({
      posX: fighter?.heroPosX ?? 50,
      posY: fighter?.heroPosY ?? 50,
      zoom: fighter?.heroZoom ?? 100,
    });
    setAdjusting(true);
  };

  const saveFraming = () => {
    updateFighter.mutate(
      {
        heroPosX: Math.round(clamp(draft.posX, 0, 100)),
        heroPosY: Math.round(clamp(draft.posY, 0, 100)),
        heroZoom: Math.round(clamp(draft.zoom, 100, 250)),
      },
      { onSuccess: () => setAdjusting(false) },
    );
  };

  const onHeroPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!adjusting) return;
    dragRef.current = { pointerId: e.pointerId, x: e.clientX, y: e.clientY, posX: draft.posX, posY: draft.posY };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onHeroPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    const box = heroBoxRef.current;
    if (!adjusting || !drag || drag.pointerId !== e.pointerId || !box) return;
    const rect = box.getBoundingClientRect();
    // Dragging the image right reveals more of its left side → focal % decreases.
    const scale = 100 / (draft.zoom || 100);
    const dx = ((e.clientX - drag.x) / rect.width) * 100 * scale;
    const dy = ((e.clientY - drag.y) / rect.height) * 100 * scale;
    setDraft((d) => ({ ...d, posX: clamp(drag.posX - dx, 0, 100), posY: clamp(drag.posY - dy, 0, 100) }));
  };
  const onHeroPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId === e.pointerId) dragRef.current = null;
  };

  const metaParts = fighter
    ? [
        fighter.primarySport ? fighter.primarySport.replace(/_/g, " ").toUpperCase() : null,
        fighter.weightClass || null,
        fighter.stance ? fighter.stance.toUpperCase() : null,
      ].filter((p): p is string => !!p)
    : [];

  return (
    <div className="flex flex-col h-[100dvh] text-foreground" style={{ background: "#000" }}>
      <main className="flex-1 min-h-0 overflow-y-auto">
        {/* ─── Hero — the athlete's own uploaded image, cinematic crop ───── */}
        <section className="relative">
          <div
            ref={heroBoxRef}
            className="relative h-[46vh] min-h-[300px] max-h-[430px] overflow-hidden"
            style={adjusting ? { touchAction: "none", cursor: "grab", userSelect: "none" } : undefined}
            onPointerDown={onHeroPointerDown}
            onPointerMove={onHeroPointerMove}
            onPointerUp={onHeroPointerUp}
            onPointerCancel={onHeroPointerUp}
          >
            {heroSrc ? (
              <img
                src={heroSrc}
                alt=""
                aria-hidden
                className="absolute inset-0 w-full h-full object-cover"
                style={{
                  filter: "saturate(0.85) contrast(1.05)",
                  objectPosition: `${framing.posX}% ${framing.posY}%`,
                  transform: `scale(${framing.zoom / 100})`,
                  transformOrigin: `${framing.posX}% ${framing.posY}%`,
                  // Dimmed like the profile card — dark contrast is the default;
                  // lifted while adjusting so the athlete can see what they frame.
                  opacity: adjusting ? 0.85 : 0.45,
                }}
                draggable={false}
              />
            ) : (
              <div
                className="absolute inset-0"
                style={{
                  background:
                    "radial-gradient(ellipse 90% 70% at 50% 30%, hsl(0,0%,9%) 0%, #000 80%)",
                }}
              />
            )}
            {/* Legibility washes — profile-card dark contrast */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                background: adjusting
                  ? "linear-gradient(180deg, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0.05) 30%, rgba(0,0,0,0.05) 70%, rgba(0,0,0,0.6) 100%)"
                  : "linear-gradient(180deg, rgba(0,0,0,0.72) 0%, rgba(0,0,0,0.42) 34%, rgba(0,0,0,0.55) 62%, rgba(0,0,0,0.97) 100%)",
              }}
            />

            {/* Header over hero */}
            <header className="absolute top-0 inset-x-0 flex items-center justify-between px-6 pt-[max(1.1rem,env(safe-area-inset-top))]">
              <FrameWordmark size={30} />
              <div className="flex items-center gap-2.5">
                <FramePlusPill />
                {hasHero && !adjusting && (
                  <button
                    type="button"
                    onClick={startAdjust}
                    aria-label="Adjust hero image framing"
                    className="w-8 h-8 flex items-center justify-center border border-white/15 bg-black/40 text-foreground/60 hover:text-primary hover:border-primary/40 transition-colors"
                  >
                    <Move className="w-3.5 h-3.5" strokeWidth={1.5} />
                  </button>
                )}
              </div>
            </header>

            {/* Framing controls (adjust mode) */}
            {adjusting && (
              <div className="absolute bottom-0 inset-x-0 px-6 pb-5 space-y-4">
                <p className="font-mono text-[9px] uppercase tracking-[0.35em] text-foreground/70">
                  Drag to reposition
                </p>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-[9px] uppercase tracking-[0.35em] text-foreground/60 w-12">
                    Zoom
                  </span>
                  <input
                    type="range"
                    min={100}
                    max={250}
                    step={1}
                    value={framing.zoom}
                    onChange={(e) => setDraft((d) => ({ ...d, zoom: Number(e.target.value) }))}
                    onPointerDown={(e) => e.stopPropagation()}
                    onPointerMove={(e) => e.stopPropagation()}
                    className="flex-1 accent-[hsl(35,65%,55%)]"
                    aria-label="Hero image zoom"
                  />
                  <span className="font-sans font-light text-[13px] tabular-nums text-foreground/80 w-12 text-right">
                    {framing.zoom}%
                  </span>
                </div>
                <div className="flex items-center gap-4">
                  <button
                    type="button"
                    onClick={saveFraming}
                    disabled={updateFighter.isPending}
                    onPointerDown={(e) => e.stopPropagation()}
                    className="px-5 py-2 rounded-none border border-primary/40 font-mono text-[10px] uppercase tracking-[0.35em] text-primary hover:border-primary/70 transition-colors disabled:opacity-40 bg-black/50"
                  >
                    {updateFighter.isPending ? "Saving" : "Save framing"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setAdjusting(false)}
                    disabled={updateFighter.isPending}
                    onPointerDown={(e) => e.stopPropagation()}
                    className="font-mono text-[10px] uppercase tracking-[0.3em] text-foreground/50 hover:text-foreground/80 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Identity overlay */}
            {!adjusting && (
              <div className="absolute bottom-0 inset-x-0 px-6 pb-5">
                <div className="font-mono text-[9px] uppercase tracking-[0.55em] text-foreground/55 mb-2">
                  Athlete
                </div>
                <h1 className="font-sans font-extralight uppercase text-[clamp(2.6rem,11vw,4rem)] tracking-[0.12em] leading-none text-foreground/95">
                  {fighter?.name ?? "—"}
                </h1>
                {metaParts.length > 0 && (
                  <div className="font-mono text-[10px] uppercase tracking-[0.35em] text-foreground/60 mt-3">
                    {metaParts.map((p, i) => (
                      <span key={p}>
                        {i > 0 && <MetaDivider />}
                        {p}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </section>

        <div className="px-0">
          <CompetitionBanner />
        </div>

        {/* ─── Today's focus — the one insight, coach's voice ────────────── */}
        {hasFocus && focus && (
          <section className="px-6 pt-7">
            <div className="border-b border-white/[0.07] pb-2">
              <h2 className="font-mono text-[10px] uppercase tracking-[0.5em] text-foreground/60">
                Today's focus
              </h2>
            </div>
            <Link
              href="/chat"
              className="block pt-4 group outline-none focus-visible:ring-1 focus-visible:ring-primary/50 rounded-lg"
              title={focus.source}
            >
              <div className="flex items-baseline justify-between gap-4">
                <p className="font-sans font-light text-[1.15rem] text-foreground/95 leading-snug">
                  {focus.label}
                </p>
                <ChevronRight
                  className="flex-none w-4 h-4 text-foreground/30 group-hover:text-primary transition-colors translate-y-0.5"
                  strokeWidth={1.5}
                />
              </div>
              <div className="font-mono text-[9px] uppercase tracking-[0.3em] text-foreground/35 mt-2">
                {focus.source}
              </div>
            </Link>
          </section>
        )}

        {/* ─── Fight readiness — real composite or an honest prompt ──────── */}
        <section className="px-6 pt-7 pb-2">
          <div className="flex items-center justify-between border-b border-white/[0.07] pb-2">
            <h2 className="font-mono text-[10px] uppercase tracking-[0.5em] text-foreground/60">
              Fight readiness
            </h2>
            {provenance && (
              <span className="font-mono text-[9px] uppercase tracking-[0.3em] text-foreground/35">
                {provenance}
              </span>
            )}
          </div>

          <div className="grid grid-cols-[auto_1fr] gap-x-8 gap-y-0 items-start pt-5">
            <div>
              {readiness != null ? (
                <>
                  <div className="font-sans font-extralight text-[clamp(4.6rem,20vw,7rem)] leading-[0.9] tabular-nums text-foreground/95">
                    {readiness}
                  </div>
                  <div className="font-mono text-[10px] uppercase tracking-[0.5em] text-primary/90 mt-3">
                    {bandFor(readiness)}
                  </div>
                </>
              ) : (
                <>
                  <div className="font-sans font-extralight text-[clamp(4.6rem,20vw,7rem)] leading-[0.9] text-foreground/25" aria-hidden>
                    —
                  </div>
                  <div className="font-mono text-[10px] uppercase tracking-[0.35em] text-foreground/45 mt-3 max-w-[180px] leading-relaxed">
                    No real data yet. Log a check-in or analyse a session.
                  </div>
                </>
              )}
            </div>

            {/* Breakdown — athlete-entered values only */}
            <div className="pt-1">
              <div className="space-y-2.5">
                {METRIC_LABELS.map(({ key, label }) => (
                  <div key={key} className="flex items-baseline justify-between gap-4">
                    <span className="font-mono text-[10px] uppercase tracking-[0.35em] text-foreground/55">
                      {label}
                    </span>
                    <span className="font-sans font-light text-[15px] tabular-nums text-foreground/90">
                      {checkin ? checkin[key] : <span className="text-foreground/25">—</span>}
                    </span>
                  </div>
                ))}
                <div className="flex items-baseline justify-between gap-4">
                  <span className="font-mono text-[10px] uppercase tracking-[0.35em] text-foreground/55">
                    Cardio HR
                  </span>
                  <span className="font-sans font-light text-[15px] tabular-nums text-foreground/90">
                    {checkin?.restingHr != null ? (
                      <>
                        {checkin.restingHr}
                        <span className="font-mono text-[9px] text-foreground/40 ml-1">bpm</span>
                      </>
                    ) : (
                      <span className="text-foreground/25">—</span>
                    )}
                  </span>
                </div>
              </div>

              {!editing && (
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="mt-5 inline-flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.35em] text-primary/80 hover:text-primary transition-colors"
                >
                  {checkin ? (
                    <>
                      <Pencil className="w-3 h-3" strokeWidth={1.5} />
                      Edit today's check-in
                    </>
                  ) : (
                    <>
                      Log today's check-in
                      <ChevronRight className="w-3 h-3" strokeWidth={1.5} />
                    </>
                  )}
                </button>
              )}
            </div>
          </div>

          {editing && <CheckinForm existing={checkin} onDone={() => setEditing(false)} />}

          {/* Readiness trend — advanced readiness insight (FRAME+). Built ONLY
              from real logged check-ins; free tier sees a locked teaser. */}
          <div className="mt-7 border-t border-white/[0.05] pt-5">
            {isFramePlus ? (
              <ReadinessTrend checkins={historyCheckins} />
            ) : (
              <button
                type="button"
                onClick={() => openUpgrade("fight_readiness")}
                className="w-full flex items-center justify-between gap-4 py-1 text-left group"
              >
                <span className="flex items-center gap-3">
                  <Lock className="w-3.5 h-3.5 text-foreground/35" strokeWidth={1.5} />
                  <span className="font-mono text-[10px] uppercase tracking-[0.35em] text-foreground/55 group-hover:text-foreground/80 transition-colors">
                    Readiness trend
                  </span>
                </span>
                <span className="font-mono text-[9px] uppercase tracking-[0.3em] text-primary/70 group-hover:text-primary transition-colors">
                  FRAME+
                </span>
              </button>
            )}
          </div>
        </section>

        {/* ─── Competition context — real camp or a quiet empty state ────── */}
        <section className="px-6 pt-8 pb-10">
          <div className="border-b border-white/[0.07] pb-2">
            <h2 className="font-mono text-[10px] uppercase tracking-[0.5em] text-foreground/60">
              Competition context
            </h2>
          </div>
          {competition && pressure ? (
            <Link
              href="/camp"
              className="block pt-5 group outline-none focus-visible:ring-1 focus-visible:ring-primary/50 rounded-lg"
            >
              <div className="flex items-baseline justify-between gap-4">
                <div>
                  <div className="font-sans font-light text-[17px] text-foreground/95 tracking-wide">
                    {competition.eventName}
                  </div>
                  <div className="font-mono text-[9px] uppercase tracking-[0.35em] text-foreground/45 mt-1.5">
                    {pressure.phase}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-sans font-extralight text-[34px] tabular-nums leading-none text-primary/90">
                    {pressure.daysToEvent}
                  </div>
                  <div className="font-mono text-[8px] uppercase tracking-[0.3em] text-foreground/40 mt-1">
                    Days out
                  </div>
                </div>
              </div>
            </Link>
          ) : (
            <div className="pt-5 flex items-baseline justify-between gap-4">
              <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-foreground/35 leading-relaxed">
                No active camp.
              </p>
              <Link
                href="/camp"
                className="inline-flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.35em] text-primary/80 hover:text-primary transition-colors"
              >
                Set a camp
                <ChevronRight className="w-3 h-3" strokeWidth={1.5} />
              </Link>
            </div>
          )}
        </section>
      </main>

      <BottomNav />
    </div>
  );
}
