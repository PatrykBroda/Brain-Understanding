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
        <div className="eyebrow">
          Session schedule
        </div>
        {!adding && (
          <button
            type="button"
            onClick={() => {
              setEditingId(null);
              setAdding(true);
            }}
            className="flex items-center gap-1.5 text-[#B9A477] hover:bg-primary/5 btn-quiet btn-quiet-gold btn-quiet-sm"
          >
            <Plus className="w-3 h-3" strokeWidth={1.5} />
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
        <div className="glass px-5 py-8 text-center">
          <div className="eyebrow">
            No sessions scheduled
          </div>
          <p className="mt-3 text-[12px] leading-relaxed text-foreground/70">
            Build the camp timeline session by session through to fight day. Every entry is a
            real block you plan to train — nothing is invented.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {groups.map((group) => (
            <div key={group.date} className="space-y-2.5">
              <div className="eyebrow border-b border-white/[0.10] pb-1.5">
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
  onToggle,
  onEdit,
  onDelete,
  busy,
}: {
  session: TrainingSession;
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
      className="flex items-start gap-3 border rounded-2xl px-4 py-3 transition-colors"
      style={{
        borderColor: s.completed ? "rgba(185,164,119,0.4)" : "rgba(255,255,255,0.10)",
        background: s.completed
          ? "linear-gradient(95deg, rgba(185,164,119,0.14), rgba(255,255,255,0.03) 70%)"
          : "rgba(255,255,255,0.04)",
      }}
    >
      <button
        type="button"
        onClick={onToggle}
        disabled={busy || imported}
        aria-pressed={s.completed}
        aria-label={s.completed ? "Mark not done" : "Mark done"}
        className="flex-none -ml-2.5 -mt-2 w-11 h-11 flex items-center justify-center disabled:opacity-40"
      >
        <span
          className="w-[22px] h-[22px] rounded-full border flex items-center justify-center transition-all duration-300"
          style={{
            borderColor: s.completed ? "#B9A477" : "rgba(255,255,255,0.35)",
            background: s.completed ? "rgba(185,164,119,0.2)" : "transparent",
            color: s.completed ? "#D4C7A3" : "transparent",
          }}
        >
          <Check className="w-3 h-3" strokeWidth={2.8} />
        </span>
      </button>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span
            className="text-xs "
            style={{
              color: s.completed ? "hsla(0,0%,100%,0.6)" : "hsla(0,0%,100%,0.9)",
              textDecoration: s.completed ? "line-through" : "none",
            }}
          >
            {SESSION_TYPE_LABEL[s.sessionType]}
          </span>
          {imported && (
            <span className="eyebrow border border-white/[0.10] px-1.5 py-0.5 rounded-2xl">
              Imported
            </span>
          )}
        </div>
        {meta && (
          <div className="eyebrow mt-1">
            {meta}
          </div>
        )}
        {s.objective.trim() && (
          <div className="text-[12px] leading-relaxed text-foreground/70 mt-1.5">
            {s.objective}
          </div>
        )}
      </div>

      {!imported && (
        <div className="flex-none flex items-center gap-1">
          <button
            type="button"
            onClick={onEdit}
            disabled={busy}
            aria-label="Edit session"
            className="p-1.5 text-foreground/70 hover:text-foreground/85 transition-colors disabled:opacity-40"
          >
            <Pencil className="w-3.5 h-3.5" strokeWidth={1.5} />
          </button>
          <button
            type="button"
            onClick={onDelete}
            disabled={busy}
            aria-label="Delete session"
            className="p-1.5 text-foreground/70 hover:text-[hsl(var(--red-accent))] transition-colors disabled:opacity-40"
          >
            <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
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
            className="field-glass !min-h-[48px] !py-0 !text-sm placeholder:text-muted-foreground"
          />
        </Field>
        <Field label="Time">
          <input
            type="time"
            value={form.startTime}
            onChange={(e) => setForm({ ...form, startTime: e.target.value })}
            className="field-glass !min-h-[48px] !py-0 !text-sm placeholder:text-muted-foreground"
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
            className="field-glass !min-h-[48px] !py-0 !text-sm placeholder:text-muted-foreground"
          />
        </Field>
        <Field label="Coach">
          <input
            value={form.coach}
            onChange={(e) => setForm({ ...form, coach: e.target.value })}
            placeholder="Optional"
            className="field-glass !min-h-[48px] !py-0 !text-sm placeholder:text-muted-foreground"
          />
        </Field>
      </div>

      <Field label="Objective">
        <input
          value={form.objective}
          onChange={(e) => setForm({ ...form, objective: e.target.value })}
          placeholder="What this session is for"
          className="field-glass !min-h-[48px] !py-0 !text-sm placeholder:text-muted-foreground"
        />
      </Field>

      {error && (
        <div className="text-xs text-[hsl(var(--red-accent))]">
          Could not save — check the date
        </div>
      )}

      <div className="flex gap-3 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 flex items-center justify-center gap-1.5 border border-white/[0.10] py-3 text-xs text-foreground/70 hover:text-foreground/85 transition-colors rounded-2xl"
        >
          <X className="w-3 h-3" strokeWidth={1.5} />
          Cancel
        </button>
        <button
          type="button"
          onClick={() => canSubmit && onSubmit(form)}
          disabled={!canSubmit || pending}
          className="flex-1 text-[#B9A477] hover:bg-primary/5 disabled:opacity-40 btn-quiet btn-quiet-gold"
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
      <span className="eyebrow block mb-1.5">
        {label}
      </span>
      {children}
    </label>
  );
}
