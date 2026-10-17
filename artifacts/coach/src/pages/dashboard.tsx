import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
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
import { heroFileUrl, api, type DailyCheckin } from "@/lib/api";
import { AuthedImage } from "@/components/authed-image";
import { ArcGauge, Sparkline } from "@/components/frame-ui";
import { MEDIA } from "@/components/media-backdrop";
import { readinessModifier, applyReadinessModifier } from "@/lib/readiness-modifier";

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

// Categorical read of a REAL composite — interpretation, not fabrication.
const READINESS_BANDS = ["Depleted", "Guarded", "Trainable", "Primed"] as const;

function bandFor(score: number): string {
  if (score >= 80) return "Primed";
  if (score >= 65) return "Trainable";
  if (score >= 45) return "Guarded";
  return "Depleted";
}

const METRIC_LABELS: { key: "sleep" | "energy" | "soreness" | "stress"; label: string; hint: string }[] = [
  { key: "sleep", label: "Sleep", hint: "How rested you woke up" },
  { key: "energy", label: "Energy", hint: "Fuel in the tank right now" },
  { key: "soreness", label: "Soreness", hint: "100 = most sore" },
  { key: "stress", label: "Stress", hint: "100 = most stressed" },
];

// Soreness and stress are persisted as recovery quality (100 = fully recovered:
// no soreness / clear-headed) so the readiness composite can sum all four
// metrics as "higher is better". The athlete, though, reads them the natural
// way — 100 = most sore / most stressed — so we invert just these two at the
// display and input boundary (v = 100 - v). Storage, the composite, and every
// historical check-in are untouched. Mirrors frame-mobile's CheckinForm.
const INVERTED_METRICS: Partial<Record<(typeof METRIC_LABELS)[number]["key"], true>> = {
  soreness: true,
  stress: true,
};

function CheckinForm({
  existing,
  onDone,
}: {
  existing: DailyCheckin | null;
  onDone: () => void;
}) {
  const save = useSaveCheckin();
  // Sliders hold display units: soreness/stress are shown as amount (100 = most
  // sore / most stressed), the inverse of how they're stored.
  const [values, setValues] = useState({
    sleep: existing?.sleep ?? 70,
    energy: existing?.energy ?? 70,
    soreness: existing != null ? 100 - existing.soreness : 30,
    stress: existing != null ? 100 - existing.stress : 30,
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
    // Convert the two display-inverted metrics back to stored recovery quality.
    save.mutate(
      {
        sleep: values.sleep,
        energy: values.energy,
        soreness: 100 - values.soreness,
        stress: 100 - values.stress,
        restingHr,
      },
      {
        onSuccess: onDone,
        onError: (e) => setErr(e instanceof Error ? e.message : "Couldn't save check-in"),
      },
    );
  };

  return (
    <div className="glass glass-flat space-y-6 p-5 sm:p-6">
      <p className="text-sm leading-relaxed text-muted-foreground">
        Rate how you actually feel. 100 = fully recovered.
      </p>
      {METRIC_LABELS.map(({ key, label, hint }) => (
        <div key={key}>
          <div className="flex items-baseline justify-between">
            <label htmlFor={`checkin-${key}`} className="eyebrow !text-foreground/80">
              {label}
            </label>
            <span className="numeral numeral-m !text-[1.6rem]">{values[key]}</span>
          </div>
          <input
            id={`checkin-${key}`}
            type="range"
            min={0}
            max={100}
            step={1}
            value={values[key]}
            onChange={(e) => setValues((v) => ({ ...v, [key]: Number(e.target.value) }))}
            className="frame-range"
            aria-describedby={`checkin-${key}-hint`}
          />
          <div id={`checkin-${key}-hint`} className="text-xs text-muted-foreground">
            {hint}
          </div>
        </div>
      ))}
      <div>
        <label htmlFor="checkin-hr" className="eyebrow mb-2 block !text-foreground/80">
          Resting HR <span className="normal-case tracking-normal text-muted-foreground">(optional, bpm)</span>
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
          className="field-glass !w-32 tabular-nums"
        />
      </div>
      {err && (
        <p role="alert" className="text-sm text-[#E0564E]">
          {err}
        </p>
      )}
      <div className="flex items-center gap-3 pt-1">
        <button type="button" onClick={submit} disabled={save.isPending} className="btn-bronze">
          {save.isPending ? "Saving" : existing ? "Update" : "Log check-in"}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="min-h-[44px] px-3 text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground transition-colors hover:text-foreground"
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
        <div className="eyebrow eyebrow-gold">Readiness trend</div>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
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
        <div className="eyebrow eyebrow-gold">Readiness trend</div>
        <div className="text-xs tabular-nums text-muted-foreground">
          {points.length} days · {delta === 0 ? "level" : delta > 0 ? `+${delta}` : `${delta}`}
        </div>
      </div>
      <div
        className="mt-4"
        role="img"
        aria-label={`Readiness composites over the last ${points.length} logged days, from ${first.score} to ${last.score}`}
      >
        <Sparkline data={points.map((p) => p.score)} width={420} height={84} tone={delta < 0 ? "red" : "gold"} />
      </div>
      <div className="mt-2 flex justify-between text-[11px] tabular-nums text-muted-foreground" aria-hidden>
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

  // Same lightweight ±10 chat modifier the STATE tab applies, so the Fight
  // Readiness number stays consistent across screens. Reuses the shared
  // ["conversation"] cache — no new data flow.
  const conversationQuery = useQuery({
    queryKey: ["conversation"],
    queryFn: () => api.getActiveConversation(),
    enabled: !!fighter,
  });
  const chatModifier = readinessModifier(conversationQuery.data?.messages ?? []);
  const readiness = applyReadinessModifier(checkinScore ?? sessionScore, chatModifier);
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

  const delay = (ms: number) => ({ animationDelay: `${ms}ms` });

  return (
    <div className="flex flex-col h-[100dvh] text-foreground">
      <main className="flex-1 min-h-0 overflow-y-auto">
        <div className="mx-auto w-full max-w-5xl px-3 pb-10 sm:px-5">
          {/* ─── Hero — the athlete's own uploaded image, cinematic crop ───── */}
          <section className="frame-rise pt-[max(0.75rem,env(safe-area-inset-top))]">
            <div
              ref={heroBoxRef}
              className={`relative overflow-hidden rounded-[2rem] border border-white/10 shadow-[0_24px_60px_-28px_rgba(0,0,0,0.9)] ${
                hasHero ? "h-[42vh] min-h-[290px] max-h-[420px]" : "h-[270px]"
              }`}
              style={adjusting ? { touchAction: "none", cursor: "grab", userSelect: "none" } : undefined}
              onPointerDown={onHeroPointerDown}
              onPointerMove={onHeroPointerMove}
              onPointerUp={onHeroPointerUp}
              onPointerCancel={onHeroPointerUp}
            >
              {heroSrc ? (
                <AuthedImage
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
                    opacity: adjusting ? 0.85 : 0.5,
                  }}
                  draggable={false}
                />
              ) : (
                <>
                  <img
                    src={MEDIA.stillB}
                    alt=""
                    aria-hidden
                    className="absolute inset-0 h-full w-full object-cover"
                    style={{ objectPosition: "50% 30%", filter: "saturate(0.9) contrast(1.1)", opacity: 0.8 }}
                    draggable={false}
                  />
                  <div
                    className="absolute inset-0"
                    style={{ background: "radial-gradient(70% 90% at 90% 0%, rgba(214,120,40,0.34), transparent 70%)", mixBlendMode: "screen" }}
                  />
                </>
              )}
              {/* Legibility washes — graphite, not flat black */}
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  background: adjusting
                    ? "linear-gradient(180deg, rgba(5,5,5,0.45) 0%, rgba(5,5,5,0.05) 30%, rgba(5,5,5,0.05) 70%, rgba(5,5,5,0.6) 100%)"
                    : "linear-gradient(180deg, rgba(5,5,5,0.55) 0%, rgba(5,5,5,0.15) 38%, rgba(5,5,5,0.55) 70%, rgba(5,5,5,0.92) 100%)",
                }}
              />

              {/* Header over hero */}
              <header className="absolute top-0 inset-x-0 flex items-center justify-between px-5 pt-5">
                <FrameWordmark size={30} />
                <div className="flex items-center gap-2.5">
                  <FramePlusPill />
                  {hasHero && !adjusting && (
                    <button
                      type="button"
                      onClick={startAdjust}
                      aria-label="Adjust hero image framing"
                      className="icon-round bg-[#050505]/40 text-foreground/80 transition-colors hover:text-[hsl(var(--primary-light))]"
                    >
                      <Move className="w-4 h-4" strokeWidth={1.5} />
                    </button>
                  )}
                </div>
              </header>

              {/* Framing controls (adjust mode) */}
              {adjusting && (
                <div className="absolute bottom-0 inset-x-0 p-3">
                  <div className="glass space-y-3 p-4">
                    <p className="eyebrow !text-foreground/80">Drag to reposition</p>
                    <div className="flex items-center gap-3">
                      <span className="eyebrow w-12">Zoom</span>
                      <input
                        type="range"
                        min={100}
                        max={250}
                        step={1}
                        value={framing.zoom}
                        onChange={(e) => setDraft((d) => ({ ...d, zoom: Number(e.target.value) }))}
                        onPointerDown={(e) => e.stopPropagation()}
                        onPointerMove={(e) => e.stopPropagation()}
                        className="frame-range flex-1"
                        aria-label="Hero image zoom"
                      />
                      <span className="w-12 text-right text-[13px] tabular-nums text-foreground/90">
                        {framing.zoom}%
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={saveFraming}
                        disabled={updateFighter.isPending}
                        onPointerDown={(e) => e.stopPropagation()}
                        className="btn-bronze !min-h-[44px] !px-6"
                      >
                        {updateFighter.isPending ? "Saving" : "Save framing"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setAdjusting(false)}
                        disabled={updateFighter.isPending}
                        onPointerDown={(e) => e.stopPropagation()}
                        className="min-h-[44px] px-3 text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground transition-colors hover:text-foreground"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Identity overlay */}
              {!adjusting && (
                <div className="absolute bottom-0 inset-x-0 px-6 pb-6">
                  <div className="eyebrow eyebrow-gold mb-2">Athlete</div>
                  <h1 className="punch text-[clamp(3.2rem,15vw,5.6rem)] text-[#f4f0e9]">
                    {fighter?.name ?? "—"}
                  </h1>
                  {metaParts.length > 0 && (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {metaParts.map((p) => (
                        <span key={p} className="chip">
                          {p}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>

          <div className="frame-rise mt-3" style={delay(60)}>
            <CompetitionBanner />
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2 lg:items-stretch">
            <div className="contents lg:flex lg:flex-col lg:gap-4">
            {/* ─── Fight readiness — real composite or an honest prompt ──────── */}
            <section className="glass glass-gold frame-rise flex flex-col overflow-hidden p-6 lg:flex-1" style={delay(120)}>
              <div aria-hidden className="glow-orb -right-24 -top-24 h-64 w-64 opacity-60" />
              <div className="relative flex items-baseline justify-between gap-3">
                <h2 className="eyebrow eyebrow-gold">Fight readiness</h2>
                {provenance && <span className="text-xs text-muted-foreground">{provenance}</span>}
              </div>

              <div className="relative flex flex-1 flex-col items-center justify-center pt-4 pb-1">
                {readiness != null ? (
                  <>
                  <ArcGauge
                    value={readiness}
                    size={290}
                    label={bandFor(readiness)}
                    tone={readiness < 45 ? "red" : "gold"}
                  />
                  <div className="mt-4 flex flex-wrap justify-center gap-1.5" aria-hidden>
                    {READINESS_BANDS.map((band) => (
                      <span
                        key={band}
                        className={`chip !px-2.5 !py-1 !text-[10px] ${
                          band === bandFor(readiness)
                            ? "!border-primary/50 !bg-primary/20 !text-[hsl(var(--primary-pale))]"
                            : "!text-muted-foreground"
                        }`}
                      >
                        {band}
                      </span>
                    ))}
                  </div>
                  </>
                ) : (
                  <>
                    <ArcGauge value={0} size={290} display="—" label="No data" />
                    <p className="mt-2 max-w-[16rem] text-center text-sm leading-relaxed text-muted-foreground">
                      No real data yet. Log a check-in or analyse a session.
                    </p>
                  </>
                )}
              </div>
            </section>

            {/* Readiness trend — advanced readiness insight (FRAME+). Built ONLY
                from real logged check-ins; free tier sees a locked teaser. */}
            <section className="glass frame-rise order-4 p-6 lg:order-none" style={delay(300)}>
              {isFramePlus ? (
                <ReadinessTrend checkins={historyCheckins} />
              ) : (
                <button
                  type="button"
                  onClick={() => openUpgrade("fight_readiness")}
                  className="group flex min-h-[44px] w-full items-center justify-between gap-4 text-left"
                >
                  <span className="flex items-center gap-3">
                    <span className="icon-round">
                      <Lock className="h-4 w-4 text-foreground/80" strokeWidth={1.5} />
                    </span>
                    <span className="eyebrow !text-foreground/80 transition-colors group-hover:!text-foreground">
                      Readiness trend
                    </span>
                  </span>
                  <span className="chip !border-primary/40 !bg-primary/10">FRAME+</span>
                </button>
              )}
            </section>
            </div>

            <div className="contents lg:flex lg:flex-col lg:gap-4">
            {/* ─── Today's focus — the one insight, coach's voice ────────────── */}
            {hasFocus && focus && (
              <Link
                href="/chat"
                className="glass frame-rise group block p-6 outline-none transition-colors hover:border-primary/40 focus-visible:ring-2 focus-visible:ring-[hsl(var(--primary-light))]"
                style={delay(180)}
                title={focus.source}
              >
                <h2 className="eyebrow eyebrow-gold">Today's focus</h2>
                <div className="mt-3 flex items-center justify-between gap-4">
                  <p className="display-heading !text-[1.65rem]">{focus.label}</p>
                  <span className="icon-round flex-none transition-colors group-hover:text-[hsl(var(--primary-light))]">
                    <ChevronRight className="h-4 w-4" strokeWidth={1.5} />
                  </span>
                </div>
                <div className="mt-3 text-xs text-muted-foreground">{focus.source}</div>
              </Link>
            )}

            {/* Breakdown — athlete-entered values only */}
            <section className="glass frame-rise p-6" style={delay(240)}>
              <div className="grid grid-cols-2 gap-x-7 gap-y-6">
                {METRIC_LABELS.map(({ key, label }) => {
                  const v = checkin ? (INVERTED_METRICS[key] ? 100 - checkin[key] : checkin[key]) : null;
                  return (
                    <div key={key}>
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="eyebrow">{label}</span>
                        <span className="numeral numeral-m !text-[1.7rem]">
                          {v ?? <span className="text-muted-foreground">—</span>}
                        </span>
                      </div>
                      <div className={`bar-thin mt-3 ${INVERTED_METRICS[key] ? "bar-thin-red" : ""}`} aria-hidden>
                        <span style={{ width: `${v ?? 0}%` }} />
                      </div>
                    </div>
                  );
                })}
                <div className="col-span-2 flex items-baseline justify-between gap-2 border-t border-white/10 pt-5">
                  <span className="eyebrow">Cardio HR</span>
                  <span className="numeral numeral-m !text-[1.7rem]">
                    {checkin?.restingHr != null ? (
                      <>
                        {checkin.restingHr}
                        <span className="ml-1.5 text-xs font-normal tracking-normal text-muted-foreground">bpm</span>
                      </>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </span>
                </div>
              </div>

              {!editing && (
                <button type="button" onClick={() => setEditing(true)} className="btn-glass mt-6 w-full">
                  {checkin ? (
                    <>
                      <Pencil className="w-3.5 h-3.5" strokeWidth={1.5} />
                      Edit today's check-in
                    </>
                  ) : (
                    <>
                      Log today's check-in
                      <ChevronRight className="w-3.5 h-3.5" strokeWidth={1.5} />
                    </>
                  )}
                </button>
              )}
            </section>

            {editing && (
              <div className="order-3 lg:order-none">
                <CheckinForm existing={checkin} onDone={() => setEditing(false)} />
              </div>
            )}

            {/* ─── Competition context — real camp or a quiet empty state ────── */}
            <section className="glass frame-rise order-5 p-6 lg:order-none" style={delay(360)}>
              <h2 className="eyebrow eyebrow-gold">Competition context</h2>
              {competition && pressure ? (
                <Link
                  href="/camp"
                  className="group mt-4 flex items-center justify-between gap-4 rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--primary-light))]"
                >
                  <div className="min-w-0">
                    <div className="display-heading !text-[1.5rem] truncate">{competition.eventName}</div>
                    <div className="eyebrow mt-2">{pressure.phase}</div>
                  </div>
                  <div className="flex-none text-right">
                    <div className="numeral numeral-l !text-[3rem] !text-[hsl(var(--primary-pale))]">
                      {pressure.daysToEvent}
                    </div>
                    <div className="eyebrow mt-1">Days out</div>
                  </div>
                </Link>
              ) : (
                <div className="mt-4 flex items-center justify-between gap-4">
                  <p className="text-sm text-muted-foreground">No active camp.</p>
                  <Link href="/camp" className="btn-glass !min-h-[44px] !px-5">
                    Set a camp
                    <ChevronRight className="w-3.5 h-3.5" strokeWidth={1.5} />
                  </Link>
                </div>
              )}
            </section>
            </div>
          </div>
        </div>
      </main>

      <BottomNav />
    </div>
  );
}
