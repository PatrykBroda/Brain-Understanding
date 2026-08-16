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
        <div className="font-mono text-[10px] uppercase tracking-[0.4em] text-foreground/70">
          Session schedule
        </div>
        {!adding && (
          <button
            type="button"
            onClick={() => {
              setEditingId(null);
              setAdding(true);
            }}
            className="flex items-center gap-1.5 border border-primary/40 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.3em] text-primary hover:bg-primary/5 transition-colors"
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
        <div className="border border-white/[0.08] px-5 py-8 text-center">
          <div className="font-mono text-[10px] uppercase tracking-[0.4em] text-foreground/55">
            No sessions scheduled
          </div>
          <p className="mt-3 text-[12px] leading-relaxed text-foreground/50">
            Build the camp timeline session by session through to fight day. Every entry is a
            real block you plan to train — nothing is invented.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {groups.map((group) => (
            <div key={group.date} className="space-y-2.5">
              <div className="font-mono text-[9px] uppercase tracking-[0.35em] text-foreground/45 border-b border-white/[0.05] pb-1.5">
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
      className="flex items-start gap-3 border px-4 py-3 transition-colors"
      style={{
        borderColor: s.completed ? "hsla(39,49%,36%,0.35)" : "hsla(0,0%,100%,0.08)",
        background: s.completed
          ? "linear-gradient(95deg, hsla(39,49%,36%,0.05), transparent 70%)"
          : "transparent",
      }}
    >
      <button
        type="button"
        onClick={onToggle}
        disabled={busy || imported}
        aria-pressed={s.completed}
        aria-label={s.completed ? "Mark not done" : "Mark done"}
        className="flex-none mt-0.5 w-[18px] h-[18px] border flex items-center justify-center transition-all duration-300 disabled:opacity-40"
        style={{
          borderColor: s.completed ? "hsl(39,49%,36%)" : "hsla(0,0%,100%,0.25)",
          background: s.completed ? "hsla(39,49%,36%,0.15)" : "transparent",
          color: s.completed ? "hsl(39,49%,36%)" : "transparent",
        }}
      >
        <Check className="w-3 h-3" strokeWidth={2.8} />
      </button>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span
            className="font-mono text-[11px] uppercase tracking-[0.2em]"
            style={{
              color: s.completed ? "hsla(0,0%,100%,0.4)" : "hsla(0,0%,100%,0.9)",
              textDecoration: s.completed ? "line-through" : "none",
            }}
          >
            {SESSION_TYPE_LABEL[s.sessionType]}
          </span>
          {imported && (
            <span className="font-mono text-[8px] uppercase tracking-[0.25em] text-foreground/45 border border-white/[0.12] px-1.5 py-0.5">
              Imported
            </span>
          )}
        </div>
        {meta && (
          <div className="font-mono text-[9px] uppercase tracking-[0.25em] text-foreground/45 mt-1">
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
            className="p-1.5 text-foreground/40 hover:text-foreground/85 transition-colors disabled:opacity-40"
          >
            <Pencil className="w-3.5 h-3.5" strokeWidth={1.5} />
          </button>
          <button
            type="button"
            onClick={onDelete}
            disabled={busy}
            aria-label="Delete session"
            className="p-1.5 text-foreground/40 hover:text-[hsl(var(--red-accent))] transition-colors disabled:opacity-40"
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
    <div className="border border-white/[0.1] px-4 py-4 space-y-4">
      <Field label="Type">
        <div className="grid grid-cols-3 gap-2">
          {SESSION_TYPES.map((t) => {
            const active = form.sessionType === t;
            return (
              <button
                key={t}
                type="button"
                onClick={() => setForm({ ...form, sessionType: t })}
                className="border py-2 font-mono text-[9px] uppercase tracking-[0.2em] transition-colors"
                style={{
                  borderColor: active ? "hsl(var(--primary))" : "hsla(0,0%,100%,0.1)",
                  color: active ? "hsl(var(--primary))" : "hsla(0,0%,100%,0.55)",
                  background: active ? "hsla(39,49%,36%,0.06)" : "transparent",
                }}
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
            className="w-full bg-[hsl(0,0%,8%)] border border-white/[0.1] px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary/50"
          />
        </Field>
        <Field label="Time">
          <input
            type="time"
            value={form.startTime}
            onChange={(e) => setForm({ ...form, startTime: e.target.value })}
            className="w-full bg-[hsl(0,0%,8%)] border border-white/[0.1] px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary/50"
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
            className="w-full bg-[hsl(0,0%,8%)] border border-white/[0.1] px-3 py-2.5 text-sm text-foreground placeholder:text-foreground/30 outline-none focus:border-primary/50"
          />
        </Field>
        <Field label="Coach">
          <input
            value={form.coach}
            onChange={(e) => setForm({ ...form, coach: e.target.value })}
            placeholder="Optional"
            className="w-full bg-[hsl(0,0%,8%)] border border-white/[0.1] px-3 py-2.5 text-sm text-foreground placeholder:text-foreground/30 outline-none focus:border-primary/50"
          />
        </Field>
      </div>

      <Field label="Objective">
        <input
          value={form.objective}
          onChange={(e) => setForm({ ...form, objective: e.target.value })}
          placeholder="What this session is for"
          className="w-full bg-[hsl(0,0%,8%)] border border-white/[0.1] px-3 py-2.5 text-sm text-foreground placeholder:text-foreground/30 outline-none focus:border-primary/50"
        />
      </Field>

      {error && (
        <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-[hsl(var(--red-accent))]">
          Could not save — check the date
        </div>
      )}

      <div className="flex gap-3 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 flex items-center justify-center gap-1.5 border border-white/[0.1] py-3 font-mono text-[10px] uppercase tracking-[0.3em] text-foreground/55 hover:text-foreground/85 transition-colors"
        >
          <X className="w-3 h-3" strokeWidth={1.5} />
          Cancel
        </button>
        <button
          type="button"
          onClick={() => canSubmit && onSubmit(form)}
          disabled={!canSubmit || pending}
          className="flex-1 border border-primary/40 py-3 font-mono text-[10px] uppercase tracking-[0.3em] text-primary hover:bg-primary/5 transition-colors disabled:opacity-40"
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
      <span className="font-mono text-[9px] uppercase tracking-[0.3em] text-foreground/55 block mb-1.5">
        {label}
      </span>
      {children}
    </label>
  );
}
