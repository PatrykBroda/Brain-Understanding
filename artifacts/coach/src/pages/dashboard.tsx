import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
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
import { useSaveCheckin, useCheckinHistory } from "@/hooks/use-checkin";
import { useToday } from "@/hooks/use-today";
import { DisclosureNotice, FocusCard } from "@/components/today-cards";
import { formatDay } from "@/lib/local-day";
import { heroFileUrl, api, type DailyCheckin } from "@/lib/api";
import { AuthedImage } from "@/components/authed-image";
import { ArcGauge, Sparkline, EmptyState } from "@/components/frame-ui";
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
    <div className="glass space-y-6 p-5">
      <p className="text-sm leading-5 text-[var(--f-text-2)]">
        Rate how you actually feel. 100 = fully recovered.
      </p>
      {METRIC_LABELS.map(({ key, label, hint }) => (
        <div key={key}>
          <div className="flex items-baseline justify-between">
            <label htmlFor={`checkin-${key}`} className="label !text-foreground/90">
              {label}
            </label>
            <span className="numeral numeral-m">{values[key]}</span>
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
        <label htmlFor="checkin-hr" className="label mb-1.5 block !text-foreground/90">
          Resting heart rate <span className="text-muted-foreground">(optional, bpm)</span>
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
        <p role="alert" className="text-sm text-[var(--f-red-text)]">
          {err}
        </p>
      )}
      <div className="flex items-center gap-3 pt-1">
        <button
          type="button"
          onClick={submit}
          disabled={save.isPending}
          data-loading={save.isPending ? "true" : undefined}
          className="btn-bronze data-[loading=true]:!opacity-100"
        >
          {existing ? "Update" : "Log check-in"}
        </button>
        <button type="button" onClick={onDone} className="btn-quiet">
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
        <h2 className="section-title">Readiness trend</h2>
        <p className="mt-2 text-sm leading-5 text-[var(--f-text-2)]">
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
        <h2 className="section-title">Readiness trend</h2>
        <div className="tnum text-sm text-muted-foreground">
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
      <div className="tnum mt-2 flex justify-between text-xs text-[var(--f-text-3)]" aria-hidden>
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

  // State, Today's Focus and readiness for the athlete's local day. The server is the one
  // authority on what "today" is: an older check-in is never returned as today's.
  const todayQuery = useToday();
  const today = todayQuery.data ?? null;
  const checkin = today?.readiness.today?.checkin ?? null;
  const lastCheckin = today?.readiness.latest ?? null;

  // Readiness trend is FRAME+ — only fetch when entitled; free shows a teaser.
  const { isFramePlus } = useSubscription();
  const { openUpgrade } = useFramePlus();
  const historyQuery = useCheckinHistory(isFramePlus);
  const historyCheckins = historyQuery.data?.checkins ?? [];

  const activeComp = useActiveCompetition();
  const competition = activeComp.data?.competition ?? null;
  const pressure = activeComp.data?.pressure ?? null;

  const [editing, setEditing] = useState(false);
  // "Check in now" on State lands here with the form open.
  const [location, setLocation] = useLocation();
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("checkin") === "1") {
      setEditing(true);
      setLocation(location, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Today's number comes from today's check-in only. An older check-in or an old session
  // score is never presented as today's readiness (it is shown dated, below).
  const checkinScore = today?.readiness.today?.score ?? null;
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
  const readiness = applyReadinessModifier(checkinScore, chatModifier);
  const provenance =
    checkinScore != null ? "Today's check-in" : lastCheckin ? `Last check-in ${formatDay(lastCheckin.date)}` : null;

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

  const sportText = fighter?.primarySport
    ? fighter.primarySport
        .replace(/_/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase())
    : null;
  const metaParts = fighter
    ? [
        sportText,
        fighter.level || null,
        fighter.weightClass || null,
        fighter.stance ? fighter.stance.charAt(0).toUpperCase() + fighter.stance.slice(1) : null,
      ].filter((p): p is string => !!p)
    : [];

  const delay = (ms: number) => ({ animationDelay: `${ms}ms` });
  const readinessLoading = todayQuery.isLoading;
  const readinessError = !readinessLoading && todayQuery.isError && readiness == null;

  return (
    <div className="flex h-[100dvh] flex-col text-foreground">
      <main className="relative min-h-0 flex-1 overflow-y-auto">
        {!hasHero && (
        <div
          className="atmo atmo-champagne-tr !bottom-auto h-[460px]"
          style={{ WebkitMaskImage: "linear-gradient(#000 55%, transparent)", maskImage: "linear-gradient(#000 55%, transparent)" }}
          aria-hidden
        />
        )}

        <div className="relative z-10 mx-auto w-full max-w-5xl px-5 pb-10">
          {/* ─── 1. Athlete context. ONE atmospheric light, on this key area only.
              The athlete's own hero image (monochrome, dark scrim) when they have one. ─── */}
          <section className="frame-rise relative z-10 pt-[max(0.75rem,env(safe-area-inset-top))]">
            <div
              ref={heroBoxRef}
              className={`relative overflow-hidden rounded-[20px] ${
                hasHero ? "h-[min(42vh,380px)] min-h-[280px] border border-[var(--f-border)]" : ""
              }`}
              style={adjusting ? { touchAction: "none", cursor: "grab", userSelect: "none" } : undefined}
              onPointerDown={onHeroPointerDown}
              onPointerMove={onHeroPointerMove}
              onPointerUp={onHeroPointerUp}
              onPointerCancel={onHeroPointerUp}
            >
              {heroSrc && (
                <>
                  <AuthedImage
                    src={heroSrc}
                    alt=""
                    aria-hidden
                    className="absolute inset-0 h-full w-full object-cover"
                    style={{
                      filter: "grayscale(1) contrast(1.05)",
                      objectPosition: `${framing.posX}% ${framing.posY}%`,
                      transform: `scale(${framing.zoom / 100})`,
                      transformOrigin: `${framing.posX}% ${framing.posY}%`,
                      // Lifted while adjusting so the athlete can see what they frame.
                      opacity: adjusting ? 0.85 : 0.6,
                    }}
                    draggable={false}
                  />
                  {/* dark scrim with a reserved text band at the bottom */}
                  <div
                    className="pointer-events-none absolute inset-0"
                    style={{
                      background: adjusting
                        ? "linear-gradient(180deg, rgba(8,9,11,0.45) 0%, rgba(8,9,11,0.05) 30%, rgba(8,9,11,0.05) 70%, rgba(8,9,11,0.6) 100%)"
                        : "linear-gradient(180deg, rgba(8,9,11,0.6) 0%, rgba(8,9,11,0.1) 34%, rgba(8,9,11,0.6) 68%, rgba(8,9,11,0.95) 100%)",
                    }}
                  />
                </>
              )}

              {/* Header */}
              <header
                className={`flex items-center justify-between ${
                  hasHero ? "absolute inset-x-0 top-0 px-4 pt-4" : "relative pb-4"
                }`}
              >
                <FrameWordmark size={28} />
                <div className="flex items-center gap-2">
                  <FramePlusPill />
                  {hasHero && !adjusting && (
                    <button
                      type="button"
                      onClick={startAdjust}
                      aria-label="Adjust hero image framing"
                      className="icon-round !bg-[#08090B]/60"
                    >
                      <Move className="h-[18px] w-[18px]" strokeWidth={1.75} />
                    </button>
                  )}
                </div>
              </header>

              {/* Framing controls (adjust mode) */}
              {adjusting && (
                <div className="absolute inset-x-0 bottom-0 p-3">
                  <div className="overlay-surface space-y-3 rounded-[18px] p-4">
                    <p className="label !text-foreground/85">Drag the image to reposition</p>
                    <div className="flex items-center gap-3">
                      <span className="label w-12">Zoom</span>
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
                      <span className="tnum w-12 text-right text-sm text-foreground/90">{framing.zoom}%</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={saveFraming}
                        disabled={updateFighter.isPending}
                        data-loading={updateFighter.isPending ? "true" : undefined}
                        onPointerDown={(e) => e.stopPropagation()}
                        className="btn-bronze !min-h-[44px] !px-6 data-[loading=true]:!opacity-100"
                      >
                        Save framing
                      </button>
                      <button
                        type="button"
                        onClick={() => setAdjusting(false)}
                        disabled={updateFighter.isPending}
                        onPointerDown={(e) => e.stopPropagation()}
                        className="btn-quiet"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Identity: name, sport, level */}
              {!adjusting && (
                <div className={hasHero ? "absolute inset-x-0 bottom-0 px-5 pb-5" : "relative pb-1"}>
                  <p className="label mb-1">{hasHero ? "Welcome back" : "Your corner"}</p>
                  <h1 className="punch punch-xl text-[#F4F4F1]">{fighter?.name ?? "—"}</h1>
                  {metaParts.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
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

          {/* ─── 2. Today's focus + 3. clear access to coaching ─── */}
          <div className="frame-rise mt-4 flex flex-col gap-3" style={delay(60)}>
            {today && today.disclosure.code !== "none" && (
              <DisclosureNotice disclosure={today.disclosure} onCheckIn={() => setEditing(true)} />
            )}
            <FocusCard
              focus={today?.focus ?? null}
              loading={todayQuery.isLoading}
              askHref={(prompt) => `/chat?prefill=${encodeURIComponent(prompt)}&n=${Date.now()}`}
            />
            <Link href="/chat" className="btn-bronze w-full">
              {today?.focus?.current ? "Work on it with your coach" : "Start coaching"}
              <ChevronRight className="h-4 w-4" strokeWidth={2} aria-hidden />
            </Link>
          </div>

          <div className="frame-rise relative mt-4" style={delay(100)}>
            <CompetitionBanner />
          </div>

          {/* ─── Supporting information ─── */}
          <div className="relative mt-4 grid gap-4 lg:grid-cols-2 lg:items-start">
            <div className="flex flex-col gap-4">
              {/* Fight readiness: real composite or an honest prompt */}
              {readinessLoading ? (
                <EmptyState kind="loading" title="Loading readiness" />
              ) : readinessError ? (
                <EmptyState
                  kind="error"
                  title="Couldn't load readiness"
                  body="Check your connection and try again."
                  actionLabel="Try again"
                  onAction={() => {
                    void todayQuery.refetch();
                    void analysesQuery.refetch();
                  }}
                />
              ) : (
                <section className="glass frame-rise flex flex-col p-5" style={delay(140)}>
                  <div className="flex items-baseline justify-between gap-3">
                    <h2 className="section-title">Fight readiness</h2>
                    {provenance && <span className="label">{provenance}</span>}
                  </div>

                  <div className="flex flex-col items-center justify-center pb-1 pt-4">
                    {readiness != null ? (
                      <>
                        <ArcGauge
                          value={readiness}
                          size={240}
                          label={bandFor(readiness)}
                          tone={readiness < 45 ? "red" : "gold"}
                        />
                        <div className="mt-3 flex flex-wrap justify-center gap-1.5" aria-hidden>
                          {READINESS_BANDS.map((band) => (
                            <span
                              key={band}
                              className={`chip ${band === bandFor(readiness) ? "chip-gold" : ""}`}
                            >
                              {band}
                            </span>
                          ))}
                        </div>
                      </>
                    ) : (
                      <>
                        <ArcGauge value={0} size={200} display={"—"} label="No data yet" />
                        <p className="mt-1 max-w-[26ch] text-center text-sm leading-5 text-[var(--f-text-2)]">
                          Log a check-in or analyse a session and your readiness shows up here.
                        </p>
                        <button type="button" onClick={() => setEditing(true)} className="btn-glass mt-4 w-full">
                          Log today&apos;s check-in
                        </button>
                      </>
                    )}
                  </div>
                </section>
              )}

              {/* Readiness trend: advanced readiness insight (FRAME+). Built ONLY
                  from real logged check-ins; free tier sees a locked teaser. */}
              <section className="glass frame-rise order-4 p-5 lg:order-none" style={delay(300)}>
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
                        <Lock className="h-[18px] w-[18px]" strokeWidth={1.75} />
                      </span>
                      <span className="text-base font-medium text-foreground">Readiness trend</span>
                    </span>
                    <span className="chip chip-gold">FRAME+</span>
                  </button>
                )}
              </section>
            </div>

            <div className="flex flex-col gap-4">
              {/* Check-in breakdown: athlete-entered values only */}
              <section className="glass frame-rise p-5" style={delay(200)}>
                <h2 className="section-title">Today&apos;s check-in</h2>
                <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-5">
                  {METRIC_LABELS.map(({ key, label }) => {
                    const v = checkin ? (INVERTED_METRICS[key] ? 100 - checkin[key] : checkin[key]) : null;
                    return (
                      <div key={key}>
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="label">{label}</span>
                          <span className="numeral numeral-m">
                            {v ?? <span className="text-[var(--f-text-3)]">{"—"}</span>}
                          </span>
                        </div>
                        <div className={`bar-thin mt-2.5 ${INVERTED_METRICS[key] ? "bar-thin-red" : ""}`} aria-hidden>
                          <span style={{ width: `${v ?? 0}%` }} />
                        </div>
                      </div>
                    );
                  })}
                  <div className="col-span-2 flex items-baseline justify-between gap-2 border-t border-[var(--f-hairline)] pt-4">
                    <span className="label">Resting heart rate</span>
                    <span className="numeral numeral-m">
                      {checkin?.restingHr != null ? (
                        <>
                          {checkin.restingHr}
                          <span className="ml-1.5 text-sm font-normal text-muted-foreground">bpm</span>
                        </>
                      ) : (
                        <span className="text-[var(--f-text-3)]">{"—"}</span>
                      )}
                    </span>
                  </div>
                </div>

                {!checkin && !editing && (
                  <p className="mt-4 text-sm leading-5 text-[var(--f-text-2)]">
                    {lastCheckin
                      ? `Nothing logged today. Your last check-in was ${formatDay(lastCheckin.date)} (${lastCheckin.score} / 100). That is not today's readiness.`
                      : "Nothing logged today. A 20-second check-in sharpens your readiness."}
                  </p>
                )}

                {!editing && (
                  <button type="button" onClick={() => setEditing(true)} className="btn-glass mt-4 w-full">
                    {checkin ? (
                      <>
                        <Pencil className="h-4 w-4" strokeWidth={1.75} />
                        Edit today&apos;s check-in
                      </>
                    ) : (
                      "Log today's check-in"
                    )}
                  </button>
                )}
              </section>

              {editing && (
                <div className="order-3 lg:order-none">
                  <CheckinForm existing={checkin} onDone={() => setEditing(false)} />
                </div>
              )}

              {/* Competition context: real camp or a quiet empty state */}
              <section className="glass frame-rise order-5 p-5 lg:order-none" style={delay(360)}>
                <h2 className="section-title">Camp</h2>
                {competition && pressure ? (
                  <Link
                    href="/camp"
                    className="group mt-3 flex items-center justify-between gap-4 rounded-[14px] outline-none focus-visible:ring-2 focus-visible:ring-[var(--f-gold)]"
                  >
                    <div className="min-w-0">
                      <div className="display-heading truncate !text-[1.25rem]">{competition.eventName}</div>
                      <div className="label mt-1">{pressure.phase}</div>
                    </div>
                    <div className="flex-none text-right">
                      <div className="numeral numeral-l">{pressure.daysToEvent}</div>
                      <div className="label mt-1">Days out</div>
                    </div>
                  </Link>
                ) : (
                  <div className="mt-2 flex items-center justify-between gap-4">
                    <p className="text-sm leading-5 text-[var(--f-text-2)]">No active camp.</p>
                    <Link href="/camp" className="btn-quiet shrink-0">
                      Set a camp
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
