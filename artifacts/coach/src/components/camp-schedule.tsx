import { useState } from "react";
import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
import {
  SESSION_TYPES,
  SESSION_TYPE_LABEL,
  type SessionType,
  type TrainingSession,
  type TrainingSessionInput,
} from "@/lib/api";
import {
  useCreateSession,
  useDeleteSession,
  useUpdateSession,
} from "@/hooks/use-competition";

// Format a "YYYY-MM-DD" calendar day without timezone drift (parse as UTC).
function formatDay(ymd: string): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return ymd;
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

type FormState = {
  sessionType: SessionType;
  sessionDate: string;
  startTime: string;
  durationMin: string;
  coach: string;
  objective: string;
};

function emptyForm(): FormState {
  return {
    sessionType: "bjj",
    sessionDate: "",
    startTime: "",
    durationMin: "",
    coach: "",
    objective: "",
  };
}

function toInput(f: FormState): TrainingSessionInput {
  return {
    sessionType: f.sessionType,
    sessionDate: f.sessionDate,
    startTime: f.startTime.trim() || null,
    durationMin: f.durationMin.trim() ? Number(f.durationMin) : null,
    coach: f.coach.trim(),
    objective: f.objective.trim(),
  };
}

export function CampSchedule({
  campId,
  sessions,
}: {
  campId: number;
  sessions: TrainingSession[];
}) {
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  const createSession = useCreateSession();
  const updateSession = useUpdateSession();
  const deleteSession = useDeleteSession();

  // The next open session is the focal point of the schedule.
  const todayYmd = new Date().toISOString().slice(0, 10);
  const nextId = sessions.find((x) => !x.completed && x.sessionDate >= todayYmd)?.id ?? null;

  // Sessions arrive ordered by date then time from the server.
  const groups: { date: string; items: TrainingSession[] }[] = [];
  for (const s of sessions) {
    const last = groups[groups.length - 1];
    if (last && last.date === s.sessionDate) last.items.push(s);
    else groups.push({ date: s.sessionDate, items: [s] });
  }

  return (
    <section className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="section-title">Session schedule</h2>
        {!adding && (
          <button
            type="button"
            onClick={() => {
              setEditingId(null);
              setAdding(true);
            }}
            className="btn-quiet btn-quiet-gold"
          >
            <Plus className="w-4 h-4" strokeWidth={1.5} />
            Add
          </button>
        )}
      </div>

      {adding && (
        <SessionForm
          submitLabel="Add session"
          pending={createSession.isPending}
          error={createSession.isError}
          onCancel={() => setAdding(false)}
          onSubmit={(form) =>
            createSession.mutate(
              { campId, input: toInput(form) },
              { onSuccess: () => setAdding(false) },
            )
          }
        />
      )}

      {sessions.length === 0 && !adding ? (
        <div className="glass px-5 py-6">
          <h3 className="section-title !text-[1.0625rem]">No sessions scheduled</h3>
          <p className="mt-2 text-[1rem] leading-[1.6] text-muted-foreground">
            Add the sessions you plan to train, one by one, through to fight day. The next one
            shows up here first.
          </p>
          <button
            type="button"
            onClick={() => {
              setEditingId(null);
              setAdding(true);
            }}
            className="btn-bronze mt-5 w-full"
          >
            <Plus className="w-5 h-5" strokeWidth={1.75} />
            Add your first session
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {groups.map((group) => (
            <div key={group.date} className="space-y-2.5">
              <div className="label tnum border-b border-white/[0.06] pb-2">
                {formatDay(group.date)}
              </div>
              {group.items.map((s) =>
                editingId === s.id ? (
                  <SessionForm
                    key={s.id}
                    submitLabel="Save"
                    pending={updateSession.isPending}
                    error={updateSession.isError}
                    initial={{
                      sessionType: s.sessionType,
                      sessionDate: s.sessionDate,
                      startTime: s.startTime ?? "",
                      durationMin: s.durationMin != null ? String(s.durationMin) : "",
                      coach: s.coach,
                      objective: s.objective,
                    }}
                    onCancel={() => setEditingId(null)}
                    onSubmit={(form) =>
                      updateSession.mutate(
                        { id: s.id, input: toInput(form) },
                        { onSuccess: () => setEditingId(null) },
                      )
                    }
                  />
                ) : (
                  <SessionRow
                    key={s.id}
                    session={s}
                    isNext={s.id === nextId}
                    onToggle={() =>
                      updateSession.mutate({
                        id: s.id,
                        input: { completed: !s.completed },
                      })
                    }
                    onEdit={() => {
                      setAdding(false);
                      setEditingId(s.id);
                    }}
                    onDelete={() => {
                      if (confirm("Remove this session?")) deleteSession.mutate(s.id);
                    }}
                    busy={updateSession.isPending || deleteSession.isPending}
                  />
                ),
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function SessionRow({
  session: s,
  isNext,
  onToggle,
  onEdit,
  onDelete,
  busy,
}: {
  session: TrainingSession;
  isNext: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  busy: boolean;
}) {
  const imported = s.source === "google_calendar";
  const meta = [
    s.startTime,
    s.durationMin != null ? `${s.durationMin} min` : null,
    s.coach.trim() || null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div
      className="glass flex items-start gap-3 px-4 py-3 transition-colors"
      style={isNext && !s.completed ? { borderColor: "rgba(185,164,119,0.32)" } : undefined}
    >
      <button
        type="button"
        onClick={onToggle}
        disabled={busy || imported}
        aria-pressed={s.completed}
        aria-label={s.completed ? "Mark not done" : "Mark done"}
        className="flex-none -ml-1 -mt-0.5 w-11 h-11 flex items-center justify-center disabled:opacity-40"
      >
        <span
          className="w-[24px] h-[24px] rounded-[8px] border flex items-center justify-center transition-colors"
          style={{
            borderColor: s.completed ? "#B9A477" : "rgba(255,255,255,0.28)",
            background: s.completed ? "#B9A477" : "transparent",
            color: s.completed ? "#0B0C0E" : "transparent",
          }}
        >
          <Check className="w-3.5 h-3.5" strokeWidth={2.8} />
        </span>
      </button>

      <div className="flex-1 min-w-0 pt-2">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className="text-[1rem] font-medium"
            style={{
              color: s.completed ? "#8A8F96" : "#F4F4F1",
              textDecoration: s.completed ? "line-through" : "none",
            }}
          >
            {SESSION_TYPE_LABEL[s.sessionType]}
          </span>
          {isNext && !s.completed && <span className="chip chip-gold">Next up</span>}
          {imported && <span className="chip">Imported</span>}
        </div>
        {meta && <div className="label tnum mt-1">{meta}</div>}
        {s.objective.trim() && (
          <div className="text-[0.9375rem] leading-[1.55] text-muted-foreground mt-1.5">
            {s.objective}
          </div>
        )}
      </div>

      {!imported && (
        <div className="flex-none flex items-center -mr-2">
          <button
            type="button"
            onClick={onEdit}
            disabled={busy}
            aria-label="Edit session"
            className="w-11 h-11 flex items-center justify-center rounded-[12px] text-muted-foreground hover:text-foreground hover:bg-white/[0.05] transition-colors disabled:opacity-40"
          >
            <Pencil className="w-4 h-4" strokeWidth={1.5} />
          </button>
          <button
            type="button"
            onClick={onDelete}
            disabled={busy}
            aria-label="Delete session"
            className="w-11 h-11 flex items-center justify-center rounded-[12px] text-muted-foreground hover:text-[#E5645A] hover:bg-white/[0.05] transition-colors disabled:opacity-40"
          >
            <Trash2 className="w-4 h-4" strokeWidth={1.5} />
          </button>
        </div>
      )}
    </div>
  );
}

function SessionForm({
  initial,
  submitLabel,
  pending,
  error,
  onSubmit,
  onCancel,
}: {
  initial?: FormState;
  submitLabel: string;
  pending: boolean;
  error: boolean;
  onSubmit: (form: FormState) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<FormState>(initial ?? emptyForm());
  const canSubmit = form.sessionDate.length > 0;

  return (
    <div className="glass px-4 py-4 space-y-4">
      <Field label="Type">
        <div className="grid grid-cols-3 gap-2">
          {SESSION_TYPES.map((t) => {
            const active = form.sessionType === t;
            return (
              <button
                key={t}
                type="button"
                onClick={() => setForm({ ...form, sessionType: t })}
                className="pill !min-h-[44px] !px-2"
                data-active={active}
              >
                {SESSION_TYPE_LABEL[t]}
              </button>
            );
          })}
        </div>
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Date *">
          <input
            type="date"
            value={form.sessionDate}
            onChange={(e) => setForm({ ...form, sessionDate: e.target.value })}
            className="field-glass !py-0"
          />
        </Field>
        <Field label="Time">
          <input
            type="time"
            value={form.startTime}
            onChange={(e) => setForm({ ...form, startTime: e.target.value })}
            className="field-glass !py-0"
          />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Duration (min)">
          <input
            inputMode="numeric"
            value={form.durationMin}
            onChange={(e) =>
              setForm({ ...form, durationMin: e.target.value.replace(/[^0-9]/g, "") })
            }
            placeholder="60"
            className="field-glass !py-0"
          />
        </Field>
        <Field label="Coach">
          <input
            value={form.coach}
            onChange={(e) => setForm({ ...form, coach: e.target.value })}
            placeholder="Optional"
            className="field-glass !py-0"
          />
        </Field>
      </div>

      <Field label="Objective">
        <input
          value={form.objective}
          onChange={(e) => setForm({ ...form, objective: e.target.value })}
          placeholder="What this session is for"
          className="field-glass !py-0"
        />
      </Field>

      {error && (
        <div className="text-[0.875rem] text-[#E5645A]" role="alert">
          Could not save — check the date
        </div>
      )}

      <div className="flex gap-3 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="btn-glass flex-1 !min-h-[48px]"
        >
          <X className="w-4 h-4" strokeWidth={1.5} />
          Cancel
        </button>
        <button
          type="button"
          onClick={() => canSubmit && onSubmit(form)}
          disabled={!canSubmit || pending}
          className="btn-bronze flex-1 !min-h-[48px]"
        >
          {pending ? "Saving" : submitLabel}
        </button>
      </div>
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
