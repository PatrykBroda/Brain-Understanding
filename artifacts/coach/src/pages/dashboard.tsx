import { useState } from "react";
import { Link } from "wouter";
import { ChevronRight, Pencil } from "lucide-react";
import { BottomNav } from "@/components/bottom-nav";
import { CompetitionBanner } from "@/components/competition-banner";
import { useFighter } from "@/hooks/use-fighter";
import { useAnalyses } from "@/hooks/use-analysis";
import { useActiveCompetition } from "@/hooks/use-competition";
import { useTodayCheckin, useSaveCheckin } from "@/hooks/use-checkin";
import { heroFileUrl, type DailyCheckin } from "@/lib/api";

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

export default function DashboardPage() {
  const { data: fighterData } = useFighter();
  const fighter = fighterData?.fighter ?? null;

  const analysesQuery = useAnalyses();
  const latest = analysesQuery.data?.analyses?.[0] ?? null;

  const checkinQuery = useTodayCheckin();
  const checkin = checkinQuery.data?.checkin ?? null;

  const activeComp = useActiveCompetition();
  const competition = activeComp.data?.competition ?? null;
  const pressure = activeComp.data?.pressure ?? null;

  const [editing, setEditing] = useState(false);

  // Readiness is only ever a real composite: today's self-reported check-in
  // first, else the most recent analysed session. No data — no number.
  const checkinScore = checkin
    ? Math.round((checkin.sleep + checkin.energy + checkin.soreness + checkin.stress) / 4)
    : null;
  const sessionScore = latest ? Math.round(latest.sessionScore) : null;
  const readiness = checkinScore ?? sessionScore;
  const provenance =
    checkinScore != null
      ? "Today's check-in"
      : sessionScore != null
        ? "Last session"
        : null;

  const hasHero = !!fighter && fighter.heroImageUrl.trim() !== "";
  const heroSrc = hasHero ? heroFileUrl(fighter!.updatedAt) : null;

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
          <div className="relative h-[46vh] min-h-[300px] max-h-[430px] overflow-hidden">
            {heroSrc ? (
              <img
                src={heroSrc}
                alt=""
                aria-hidden
                className="absolute inset-0 w-full h-full object-cover"
                style={{ filter: "saturate(0.85) contrast(1.05)" }}
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
            {/* Legibility washes */}
            <div
              className="absolute inset-0"
              style={{
                background:
                  "linear-gradient(180deg, rgba(0,0,0,0.72) 0%, rgba(0,0,0,0.12) 34%, rgba(0,0,0,0.28) 62%, rgba(0,0,0,0.96) 100%)",
              }}
            />

            {/* Header over hero */}
            <header className="absolute top-0 inset-x-0 flex items-center justify-between px-6 pt-[max(1.1rem,env(safe-area-inset-top))]">
              <div className="flex items-center gap-3">
                <img
                  src={`${basePath}/frame-logo.png`}
                  alt=""
                  aria-hidden
                  width={30}
                  height={30}
                  className="object-contain opacity-90"
                />
                <div className="font-sans font-extralight text-[14px] tracking-[0.5em] text-foreground/95 leading-none">
                  FRAME
                  <span className="font-mono text-[9px] tracking-[0.4em] text-foreground/50 ml-3">
                    · SYNOCHI
                  </span>
                </div>
              </div>
            </header>

            {/* Identity overlay */}
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
              {!hasHero && (
                <Link
                  href="/"
                  className="inline-block mt-3 font-mono text-[9px] uppercase tracking-[0.3em] text-foreground/30 hover:text-foreground/60 transition-colors"
                >
                  Set your frame on the hub
                </Link>
              )}
            </div>
          </div>
        </section>

        <div className="px-0">
          <CompetitionBanner />
        </div>

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
