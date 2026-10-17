import { useState } from "react";
import { Link } from "wouter";
import { ChevronLeft, Pencil, X } from "lucide-react";
import { BottomNav } from "@/components/bottom-nav";
import { FramePlusPill } from "@/components/frame-plus-modal";
import { CampMission } from "@/components/camp-mission";
import { CampSchedule } from "@/components/camp-schedule";
import { GoogleCalendarSync } from "@/components/google-calendar-sync";
import {
  useActiveCompetition,
  useCancelCompetition,
  useCreateCompetition,
  useUpdateCompetition,
} from "@/hooks/use-competition";
import type {
  CampReview,
  Competition,
  CompetitionInput,
  CompetitionPressure,
  PressureTier,
  WeightCut,
} from "@/lib/api";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

const TIER_FG: Record<PressureTier, string> = {
  base: "hsl(39 50% 62%)",
  build: "hsl(28 70% 58%)",
  sharpen: "hsl(14 78% 56%)",
  peak: "hsl(2 80% 58%)",
  fight_week: "hsl(0 85% 60%)",
};

type CampView = "schedule" | "mission";

// Take the calendar-day portion of an event/weigh-in value that may be a full
// ISO timestamp or a plain YYYY-MM-DD, without timezone drift.
function toDateInput(value: string | null): string {
  if (!value) return "";
  return value.slice(0, 10);
}

function formatDay(value: string | null): string {
  if (!value) return "";
  const d = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export default function CampPage() {
  const { data, isLoading } = useActiveCompetition();
  const competition = data?.competition ?? null;
  const pressure = data?.pressure ?? null;
  const weightCut = data?.weightCut ?? null;
  const sessions = data?.sessions ?? [];

  const [view, setView] = useState<CampView>("schedule");
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState(false);

  return (
    <div className="flex flex-col h-[100dvh]">
      <header className="flex-none flex items-center gap-3 px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-3">
        <Link href="/home" aria-label="Back to home" className="icon-round flex-none text-foreground/80 hover:text-foreground transition-colors">
          <ChevronLeft className="w-5 h-5" strokeWidth={1.5} />
        </Link>
        <div className="min-w-0">
          <h1 className="display-heading leading-none">Camp</h1>
          <div className="eyebrow mt-1.5">Fight camp</div>
        </div>
        <div className="ml-auto">
          <FramePlusPill />
        </div>
      </header>

      <main className="flex-1 overflow-y-auto">
        <div className="max-w-md mx-auto px-5 py-6 space-y-6 pb-10">
          {isLoading ? (
            <div className="eyebrow">
              Loading
            </div>
          ) : !competition ? (
            <NoCampState
              showCreate={showCreate}
              onOpen={() => setShowCreate(true)}
              onClose={() => setShowCreate(false)}
            />
          ) : (
            <>
              {editing ? (
                <CampForm
                  competition={competition}
                  onClose={() => setEditing(false)}
                />
              ) : (
                <CampDashboard
                  competition={competition}
                  pressure={pressure}
                  weightCut={weightCut}
                  onEdit={() => setEditing(true)}
                />
              )}

              {!editing &&
                (data?.review ? (
                  <CampReviewSection review={data.review} />
                ) : (
                  <CampReviewLocked />
                ))}

              {/* Primary vs secondary view toggle */}
              <div className="grid grid-cols-2 gap-2">
                <ViewTab
                  label="Schedule"
                  active={view === "schedule"}
                  onClick={() => setView("schedule")}
                />
                <ViewTab
                  label="Weekly mission"
                  active={view === "mission"}
                  onClick={() => setView("mission")}
                />
              </div>

              {view === "schedule" ? (
                <div className="space-y-6">
                  <GoogleCalendarSync campId={competition.id} />
                  <CampSchedule campId={competition.id} sessions={sessions} />
                </div>
              ) : (
                <CampMission />
              )}
            </>
          )}
        </div>
      </main>

      <BottomNav />
    </div>
  );
}

function ViewTab({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="pill" data-active={active}
    >
      {label}
    </button>
  );
}

function CampDashboard({
  competition: c,
  pressure,
  weightCut,
  onEdit,
}: {
  competition: Competition;
  pressure: CompetitionPressure | null;
  weightCut: WeightCut | null;
  onEdit: () => void;
}) {
  const cancel = useCancelCompetition();
  const tier = pressure?.tier ?? "base";
  const fg = TIER_FG[tier];

  const fightLine = [
    c.opponent,
    c.promotion,
    c.weightClass,
    c.rounds ? `${c.rounds} rounds` : "",
    c.location,
  ]
    .filter((v) => v && String(v).trim() !== "")
    .join(" · ");

  return (
    <section>
      <div className="glass px-5 py-7 text-center" style={{ borderColor: `color-mix(in srgb, ${fg} 45%, transparent)`, backgroundImage: `radial-gradient(80% 90% at 50% 0%, color-mix(in srgb, ${fg} 30%, transparent), transparent 72%), linear-gradient(135deg, rgba(255,246,232,0.07), rgba(255,246,232,0.015))` }}>
        <div className="flex items-center justify-between">
          <div className="font-mono text-[10px] uppercase tracking-[0.16em]" style={{ color: fg }}>
            {pressure ? pressure.phase : "Camp"}
          </div>
          <button
            type="button"
            onClick={onEdit}
            aria-label="Edit camp"
            className="btn-quiet btn-quiet-sm"
          >
            <Pencil className="w-3 h-3" strokeWidth={1.5} />
            Edit
          </button>
        </div>

        {pressure ? (
          <>
            <div
              className="font-sans font-extralight tabular-nums leading-none mt-4"
              style={{ fontSize: "clamp(3rem,18vw,5rem)", color: fg }}
            >
              {pressure.daysToEvent}
            </div>
            <div className="eyebrow mt-2">
              {pressure.daysToEvent === 1 ? "day until" : "days until"} {c.eventName}
            </div>
            <div className="eyebrow mt-2">
              {pressure.tierLabel}
            </div>
            {pressure.daysToWeighIn !== null && (
              <div className="eyebrow mt-3">
                Weigh-in: {pressure.daysToWeighIn}{" "}
                {pressure.daysToWeighIn === 1 ? "day" : "days"}
              </div>
            )}
          </>
        ) : (
          <div className="display-heading mt-4">
            {c.eventName}
          </div>
        )}
      </div>

      <dl className="mt-5 space-y-2.5">
        <Row label="Event date" value={formatDay(c.eventDate)} />
        {c.weighInDate && <Row label="Weigh-in date" value={formatDay(c.weighInDate)} />}
        {c.discipline.trim() && <Row label="Discipline" value={c.discipline} />}
        {fightLine && <Row label="Fight" value={fightLine} />}
        {weightCut && (
          <Row
            label="Weight cut"
            value={
              weightCut.current.trim() || weightCut.target.trim()
                ? `${weightCut.current.trim() || "?"} → ${weightCut.target.trim() || "?"} · ${weightCut.status}`
                : weightCut.status
            }
          />
        )}
        {c.notes.trim() && <Row label="Notes" value={c.notes} />}
      </dl>

      <button
        type="button"
        onClick={() => {
          if (confirm("End this camp? It moves to history and the countdown stops.")) {
            cancel.mutate(c.id);
          }
        }}
        disabled={cancel.isPending}
        className="btn-quiet mt-6 w-full hover:!text-[#E0564E] hover:!border-[#E0564E]/50"
      >
        {cancel.isPending ? "Ending" : "End camp"}
      </button>
    </section>
  );
}

// Camp review — cross-analysis intelligence over THIS camp's footage. Every
// number shown is a real recorded value or a real session count; honest empty
// states when there isn't enough footage to say anything true yet.
function CampReviewSection({ review }: { review: CampReview }) {
  const { totalAnalyses, countsByKind, biggestImprovement, mostPersistentLeak } = review;

  return (
    <section className="glass">
      <div className="px-5 py-4 row-hair flex items-center justify-between">
        <div className="eyebrow">
          Camp review
        </div>
        <div className="eyebrow">
          {totalAnalyses === 1 ? "1 analysis" : `${totalAnalyses} analyses`}
        </div>
      </div>

      {totalAnalyses === 0 ? (
        <div className="px-5 py-6">
          <p className="text-[13px] leading-relaxed text-foreground/80">
            No footage analysed in this camp yet. Upload a round on{" "}
            <Link href="/analyse" className="text-[#C7A15A] hover:underline">
              Analyse
            </Link>{" "}
            and this camp starts reading your trend, session over session.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-white/[0.07]">
          {/* Session mix — a real count per kind */}
          <div className="px-5 py-4 flex flex-wrap gap-x-5 gap-y-2">
            {countsByKind.map((c) => (
              <div key={c.kind} className="flex items-baseline gap-1.5">
                <span className="numeral numeral-m !text-[1.6rem]">
                  {c.count}
                </span>
                <span className="eyebrow">
                  {c.label}
                </span>
              </div>
            ))}
          </div>

          {/* Biggest real improvement — two recorded endpoint values + dates */}
          <div className="px-5 py-5">
            <div className="eyebrow">
              Biggest improvement
            </div>
            {biggestImprovement ? (
              <div className="mt-2.5">
                <div className="flex items-baseline gap-2">
                  <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-foreground/85">
                    {biggestImprovement.label}
                  </span>
                  <span
                    className="numeral numeral-m !text-[1.25rem]"
                    style={{ color: "#E6D2A3" }}
                  >
                    +{biggestImprovement.delta}
                  </span>
                </div>
                <div className="mt-1 font-mono text-[10px] tabular-nums text-foreground/70">
                  {biggestImprovement.from} → {biggestImprovement.to}
                </div>
                <div className="mt-1 text-[10px] text-foreground/70">
                  {formatDay(biggestImprovement.fromAt)} → {formatDay(biggestImprovement.toAt)}
                </div>
              </div>
            ) : (
              <p className="mt-2 text-[12px] leading-relaxed text-foreground/80">
                {totalAnalyses < 2
                  ? "One session in — log a second analysis and the trend appears here."
                  : "No attribute rose between your first and latest session this camp. Held or dipped — no gain to claim yet."}
              </p>
            )}
          </div>

          {/* Most persistent real leak — a real recurrence count */}
          <div className="px-5 py-5">
            <div className="eyebrow">
              Most persistent leak
            </div>
            {mostPersistentLeak ? (
              <div className="mt-2.5">
                <div className="font-sans text-[13px] leading-snug text-foreground/85">
                  {mostPersistentLeak.label}
                </div>
                <div className="mt-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-foreground/70">
                  Flagged in {mostPersistentLeak.sessions} of {mostPersistentLeak.total} sessions
                </div>
              </div>
            ) : (
              <p className="mt-2 text-[12px] leading-relaxed text-foreground/80">
                {totalAnalyses < 2
                  ? "A leak has to recur across sessions to count. One session in, nothing to call persistent."
                  : "No single leak has recurred across your sessions this camp."}
              </p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

// Free tier: the review reads across every analysis in the camp, which is a
// FRAME+ capability. Honest teaser — no fabricated preview numbers.
function CampReviewLocked() {
  return (
    <section className="glass">
      <div className="px-5 py-4 row-hair flex items-center justify-between">
        <div className="eyebrow">
          Camp review
        </div>
        <FramePlusPill />
      </div>
      <div className="px-5 py-6">
        <p className="text-[13px] leading-relaxed text-foreground/80">
          Camp review reads across every analysis in this camp to surface your biggest real gain
          and the leak that keeps recurring — grounded in your recorded sessions, never invented.
          Part of FRAME+.
        </p>
      </div>
    </section>
  );
}

function NoCampState({
  showCreate,
  onOpen,
  onClose,
}: {
  showCreate: boolean;
  onOpen: () => void;
  onClose: () => void;
}) {
  if (showCreate) return <CampForm onClose={onClose} />;
  return (
    <section>
      <div className="glass px-5 py-10 text-center">
        <div className="display-heading">No camp scheduled</div>
        <p className="mt-3 text-[13px] leading-relaxed text-foreground/80">
          Create a camp to enter the tunnel. A persistent countdown appears, the interface
          tightens toward the date, the coach shifts into camp register, and you can build a
          session-by-session schedule through to fight day.
        </p>
      </div>
      <button
        type="button"
        onClick={onOpen}
        className="btn-bronze mt-5 w-full"
      >
        Create your camp
      </button>
    </section>
  );
}

type CampFormState = {
  eventName: string;
  discipline: string;
  eventDate: string;
  weighInDate: string;
  opponent: string;
  promotion: string;
  weightClass: string;
  rounds: string;
  location: string;
  currentWeight: string;
  targetWeight: string;
  notes: string;
};

function toFormState(c?: Competition): CampFormState {
  return {
    eventName: c?.eventName ?? "",
    discipline: c?.discipline ?? "",
    eventDate: toDateInput(c?.eventDate ?? null),
    weighInDate: toDateInput(c?.weighInDate ?? null),
    opponent: c?.opponent ?? "",
    promotion: c?.promotion ?? "",
    weightClass: c?.weightClass ?? "",
    rounds: c?.rounds != null ? String(c.rounds) : "",
    location: c?.location ?? "",
    currentWeight: c?.currentWeight ?? "",
    targetWeight: c?.targetWeight ?? "",
    notes: c?.notes ?? "",
  };
}

function CampForm({
  competition,
  onClose,
}: {
  competition?: Competition;
  onClose: () => void;
}) {
  const isEdit = !!competition;
  const [form, setForm] = useState<CampFormState>(toFormState(competition));
  const create = useCreateCompetition();
  const update = useUpdateCompetition();
  const pending = create.isPending || update.isPending;
  const isError = create.isError || update.isError;

  const canSubmit = form.eventName.trim().length > 0 && form.eventDate.length > 0;

  const set = (patch: Partial<CampFormState>) => setForm((f) => ({ ...f, ...patch }));

  const submit = () => {
    if (!canSubmit) return;
    const payload: CompetitionInput = {
      eventName: form.eventName.trim(),
      discipline: form.discipline.trim(),
      eventDate: form.eventDate,
      weighInDate: form.weighInDate || null,
      opponent: form.opponent.trim(),
      promotion: form.promotion.trim(),
      weightClass: form.weightClass.trim(),
      rounds: form.rounds.trim() ? Number(form.rounds) : null,
      location: form.location.trim(),
      currentWeight: form.currentWeight.trim(),
      targetWeight: form.targetWeight.trim(),
      notes: form.notes.trim(),
    };
    if (isEdit && competition) {
      update.mutate({ id: competition.id, input: payload }, { onSuccess: onClose });
    } else {
      create.mutate(payload, { onSuccess: onClose });
    }
  };

  return (
    <section className="space-y-4">
      <div className="eyebrow">
        {isEdit ? "Edit camp" : "Create camp"}
      </div>

      <Field label="Event name *">
        <input
          value={form.eventName}
          onChange={(e) => set({ eventName: e.target.value })}
          placeholder="ADCC Trials"
          className="field-glass !min-h-[48px] !py-0 !text-sm placeholder:text-muted-foreground"
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Event date *">
          <input
            type="date"
            value={form.eventDate}
            onChange={(e) => set({ eventDate: e.target.value })}
            className="field-glass !min-h-[48px] !py-0 !text-sm placeholder:text-muted-foreground"
          />
        </Field>
        <Field label="Weigh-in date">
          <input
            type="date"
            value={form.weighInDate}
            onChange={(e) => set({ weighInDate: e.target.value })}
            className="field-glass !min-h-[48px] !py-0 !text-sm placeholder:text-muted-foreground"
          />
        </Field>
      </div>

      <Field label="Discipline">
        <input
          value={form.discipline}
          onChange={(e) => set({ discipline: e.target.value })}
          placeholder="No-gi / MMA / BJJ"
          className="field-glass !min-h-[48px] !py-0 !text-sm placeholder:text-muted-foreground"
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Opponent">
          <input
            value={form.opponent}
            onChange={(e) => set({ opponent: e.target.value })}
            placeholder="Optional"
            className="field-glass !min-h-[48px] !py-0 !text-sm placeholder:text-muted-foreground"
          />
        </Field>
        <Field label="Promotion">
          <input
            value={form.promotion}
            onChange={(e) => set({ promotion: e.target.value })}
            placeholder="Optional"
            className="field-glass !min-h-[48px] !py-0 !text-sm placeholder:text-muted-foreground"
          />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Weight class">
          <input
            value={form.weightClass}
            onChange={(e) => set({ weightClass: e.target.value })}
            placeholder="Optional"
            className="field-glass !min-h-[48px] !py-0 !text-sm placeholder:text-muted-foreground"
          />
        </Field>
        <Field label="Rounds">
          <input
            inputMode="numeric"
            value={form.rounds}
            onChange={(e) => set({ rounds: e.target.value.replace(/[^0-9]/g, "") })}
            placeholder="Optional"
            className="field-glass !min-h-[48px] !py-0 !text-sm placeholder:text-muted-foreground"
          />
        </Field>
      </div>

      <Field label="Location">
        <input
          value={form.location}
          onChange={(e) => set({ location: e.target.value })}
          placeholder="Optional"
          className="field-glass !min-h-[48px] !py-0 !text-sm placeholder:text-muted-foreground"
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Current weight">
          <input
            value={form.currentWeight}
            onChange={(e) => set({ currentWeight: e.target.value })}
            placeholder="78kg"
            className="field-glass !min-h-[48px] !py-0 !text-sm placeholder:text-muted-foreground"
          />
        </Field>
        <Field label="Target weight">
          <input
            value={form.targetWeight}
            onChange={(e) => set({ targetWeight: e.target.value })}
            placeholder="74kg"
            className="field-glass !min-h-[48px] !py-0 !text-sm placeholder:text-muted-foreground"
          />
        </Field>
      </div>

      <Field label="Notes">
        <textarea
          value={form.notes}
          onChange={(e) => set({ notes: e.target.value })}
          rows={3}
          placeholder="Bracket, weaknesses to close, anything the coach should hold you to."
          className="field-glass !text-sm placeholder:text-muted-foreground resize-none !min-h-0 !py-3"
        />
      </Field>

      {isError && (
        <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-[hsl(var(--red-accent))]">
          Could not save — check the dates
        </div>
      )}

      <div className="flex gap-3 pt-1">
        <button
          type="button"
          onClick={onClose}
          className="flex-1 flex items-center justify-center gap-1.5 border border-white/[0.10] py-3 font-mono text-[10px] uppercase tracking-[0.16em] text-foreground/70 hover:text-foreground/85 transition-colors rounded-2xl"
        >
          <X className="w-3 h-3" strokeWidth={1.5} />
          Cancel
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={!canSubmit || pending}
          className="flex-1 text-[#C7A15A] hover:bg-primary/5 disabled:opacity-40 btn-quiet btn-quiet-gold"
        >
          {pending ? "Saving" : isEdit ? "Save camp" : "Create camp"}
        </button>
      </div>
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 row-hair pb-2.5">
      <dt className="eyebrow pt-0.5">
        {label}
      </dt>
      <dd className="text-[13px] text-foreground/85 text-right max-w-[60%]">{value}</dd>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="eyebrow block mb-1.5">
        {label}
      </span>
      {children}
    </label>
  );
}
