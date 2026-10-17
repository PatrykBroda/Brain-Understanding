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

// One accent for pressure: gold while there is time, red text only in the final stretch.
const TIER_FG: Record<PressureTier, string> = {
  base: "#B9A477",
  build: "#B9A477",
  sharpen: "#D4C7A3",
  peak: "#E5645A",
  fight_week: "#E5645A",
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
          <h1 className="display-title !text-[1.75rem] leading-none">Camp</h1>
        </div>
        <div className="ml-auto">
          <FramePlusPill />
        </div>
      </header>

      <main className="flex-1 overflow-y-auto">
        <div className="max-w-md md:max-w-2xl mx-auto px-5 py-5 space-y-6 pb-10">
          {isLoading ? (
            <div className="flex flex-col items-center gap-3 pt-16 text-[0.9375rem] text-muted-foreground" role="status">
              <span className="h-5 w-5 rounded-full border-2 border-white/15 border-t-[#B9A477] animate-spin motion-reduce:animate-none" aria-hidden />
              Loading your camp
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
      <div className="glass px-5 pt-5 pb-6" style={pressure && (tier === "peak" || tier === "fight_week") ? { borderColor: "rgba(229,100,90,0.3)" } : undefined}>
        <div className="flex items-center justify-between gap-3">
          <span className="chip" style={{ color: fg, borderColor: "rgba(255,255,255,0.12)" }}>
            {pressure ? pressure.phase : "Camp"}
          </span>
          <button
            type="button"
            onClick={onEdit}
            aria-label="Edit camp"
            className="btn-quiet"
          >
            <Pencil className="w-4 h-4" strokeWidth={1.5} />
            Edit
          </button>
        </div>

        {pressure ? (
          <div className="mt-5">
            <div className="flex items-baseline gap-3">
              <span className="numeral numeral-hero" style={{ color: fg }}>
                {pressure.daysToEvent}
              </span>
              <span className="text-[1.0625rem] font-medium text-foreground/90">
                {pressure.daysToEvent === 1 ? "day" : "days"} to go
              </span>
            </div>
            <h2 className="display-heading mt-2 !text-[1.375rem]">{c.eventName}</h2>
            <p className="label mt-1">
              {pressure.tierLabel}
              {pressure.daysToWeighIn !== null && (
                <span className="tnum">
                  {" "}· Weigh-in in {pressure.daysToWeighIn} {pressure.daysToWeighIn === 1 ? "day" : "days"}
                </span>
              )}
            </p>
          </div>
        ) : (
          <h2 className="display-heading mt-5">{c.eventName}</h2>
        )}
      </div>

      <dl className="mt-4 glass px-5 py-1">
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
        className="btn-quiet mt-4 w-full hover:!text-[#E5645A] hover:!border-[#E5645A]/50"
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
      <div className="px-5 py-4 flex items-center justify-between border-b border-white/[0.06]">
        <h2 className="section-title">Camp review</h2>
        <span className="chip tnum">
          {totalAnalyses === 1 ? "1 analysis" : `${totalAnalyses} analyses`}
        </span>
      </div>

      {totalAnalyses === 0 ? (
        <div className="px-5 py-6">
          <p className="text-[0.9375rem] leading-[1.6] text-foreground/80">
            No footage analysed in this camp yet. Upload a round on{" "}
            <Link href="/analyse" className="text-[#B9A477] hover:underline">
              Analyse
            </Link>{" "}
            and this camp starts reading your trend, session over session.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-white/[0.06]">
          {/* Session mix — a real count per kind */}
          <div className="px-5 py-4 flex flex-wrap gap-x-5 gap-y-2">
            {countsByKind.map((c) => (
              <div key={c.kind} className="flex items-baseline gap-1.5">
                <span className="numeral numeral-m !text-[1.5rem]">
                  {c.count}
                </span>
                <span className="label">
                  {c.label}
                </span>
              </div>
            ))}
          </div>

          {/* Biggest real improvement — two recorded endpoint values + dates */}
          <div className="px-5 py-5">
            <div className="label">Biggest improvement</div>
            {biggestImprovement ? (
              <div className="mt-2.5">
                <div className="flex items-baseline gap-2">
                  <span className="text-[1rem] font-medium text-foreground">
                    {biggestImprovement.label}
                  </span>
                  <span
                    className="numeral numeral-m !text-[1.25rem]"
                    style={{ color: "#D4C7A3" }}
                  >
                    +{biggestImprovement.delta}
                  </span>
                </div>
                <div className="mt-1 text-[0.8125rem] tabular-nums text-muted-foreground">
                  {biggestImprovement.from} → {biggestImprovement.to}
                </div>
                <div className="mt-0.5 text-[0.8125rem] tabular-nums text-muted-foreground">
                  {formatDay(biggestImprovement.fromAt)} → {formatDay(biggestImprovement.toAt)}
                </div>
              </div>
            ) : (
              <p className="mt-2 text-[0.9375rem] leading-[1.6] text-foreground/80">
                {totalAnalyses < 2
                  ? "One session in — log a second analysis and the trend appears here."
                  : "No attribute rose between your first and latest session this camp. Held or dipped — no gain to claim yet."}
              </p>
            )}
          </div>

          {/* Most persistent real leak — a real recurrence count */}
          <div className="px-5 py-5">
            <div className="label">Most persistent leak</div>
            {mostPersistentLeak ? (
              <div className="mt-2.5">
                <div className="text-[1rem] font-medium leading-snug text-foreground">
                  {mostPersistentLeak.label}
                </div>
                <div className="mt-1 text-[0.8125rem] tabular-nums text-muted-foreground">
                  Flagged in {mostPersistentLeak.sessions} of {mostPersistentLeak.total} sessions
                </div>
              </div>
            ) : (
              <p className="mt-2 text-[0.9375rem] leading-[1.6] text-foreground/80">
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
      <div className="px-5 py-4 flex items-center justify-between border-b border-white/[0.06]">
        <h2 className="section-title">Camp review</h2>
        <FramePlusPill />
      </div>
      <div className="px-5 py-5">
        <p className="text-[0.9375rem] leading-[1.6] text-foreground/80">
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
      <div className="glass px-5 py-8">
        <h2 className="display-heading !text-[1.375rem]">No camp scheduled</h2>
        <p className="mt-3 text-[1rem] leading-[1.6] text-muted-foreground">
          Add your next fight and FRAME builds the countdown, a session-by-session schedule through
          to fight day, and shifts your coaching into camp mode.
        </p>
        <button
          type="button"
          onClick={onOpen}
          className="btn-bronze mt-6 w-full"
        >
          Create your camp
        </button>
      </div>
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
      <h2 className="section-title !text-[1.25rem]">{isEdit ? "Edit camp" : "Create camp"}</h2>

      <Field label="Event name *">
        <input
          value={form.eventName}
          onChange={(e) => set({ eventName: e.target.value })}
          placeholder="ADCC Trials"
          className="field-glass !py-0"
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Event date *">
          <input
            type="date"
            value={form.eventDate}
            onChange={(e) => set({ eventDate: e.target.value })}
            className="field-glass !py-0"
          />
        </Field>
        <Field label="Weigh-in date">
          <input
            type="date"
            value={form.weighInDate}
            onChange={(e) => set({ weighInDate: e.target.value })}
            className="field-glass !py-0"
          />
        </Field>
      </div>

      <Field label="Discipline">
        <input
          value={form.discipline}
          onChange={(e) => set({ discipline: e.target.value })}
          placeholder="No-gi / MMA / BJJ"
          className="field-glass !py-0"
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Opponent">
          <input
            value={form.opponent}
            onChange={(e) => set({ opponent: e.target.value })}
            placeholder="Optional"
            className="field-glass !py-0"
          />
        </Field>
        <Field label="Promotion">
          <input
            value={form.promotion}
            onChange={(e) => set({ promotion: e.target.value })}
            placeholder="Optional"
            className="field-glass !py-0"
          />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Weight class">
          <input
            value={form.weightClass}
            onChange={(e) => set({ weightClass: e.target.value })}
            placeholder="Optional"
            className="field-glass !py-0"
          />
        </Field>
        <Field label="Rounds">
          <input
            inputMode="numeric"
            value={form.rounds}
            onChange={(e) => set({ rounds: e.target.value.replace(/[^0-9]/g, "") })}
            placeholder="Optional"
            className="field-glass !py-0"
          />
        </Field>
      </div>

      <Field label="Location">
        <input
          value={form.location}
          onChange={(e) => set({ location: e.target.value })}
          placeholder="Optional"
          className="field-glass !py-0"
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Current weight">
          <input
            value={form.currentWeight}
            onChange={(e) => set({ currentWeight: e.target.value })}
            placeholder="78kg"
            className="field-glass !py-0"
          />
        </Field>
        <Field label="Target weight">
          <input
            value={form.targetWeight}
            onChange={(e) => set({ targetWeight: e.target.value })}
            placeholder="74kg"
            className="field-glass !py-0"
          />
        </Field>
      </div>

      <Field label="Notes">
        <textarea
          value={form.notes}
          onChange={(e) => set({ notes: e.target.value })}
          rows={3}
          placeholder="Bracket, weaknesses to close, anything the coach should hold you to."
          className="field-glass resize-none !min-h-0 !py-3"
        />
      </Field>

      {isError && (
        <div className="text-[0.875rem] text-[#E5645A]" role="alert">
          Could not save — check the dates
        </div>
      )}

      <div className="flex gap-3 pt-1">
        <button
          type="button"
          onClick={onClose}
          className="btn-glass flex-1 !min-h-[48px]"
        >
          <X className="w-4 h-4" strokeWidth={1.5} />
          Cancel
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={!canSubmit || pending}
          className="btn-bronze flex-1 !min-h-[48px]"
        >
          {pending ? "Saving" : isEdit ? "Save camp" : "Create camp"}
        </button>
      </div>
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 py-3 border-b border-white/[0.06] last:border-b-0">
      <dt className="label pt-0.5">{label}</dt>
      <dd className="text-[0.9375rem] tnum text-foreground text-right max-w-[62%]">{value}</dd>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="label block mb-1.5">{label}</span>
      {children}
    </label>
  );
}
