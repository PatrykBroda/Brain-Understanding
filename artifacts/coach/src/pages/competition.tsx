import { useState } from "react";
import { Link } from "wouter";
import { ChevronLeft } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { BottomNav } from "@/components/bottom-nav";
import { useActiveCompetition } from "@/hooks/use-competition";
import { competitionApi, type CompetitionInput, type PressureTier } from "@/lib/api";

const TIER_FG: Record<PressureTier, string> = {
  base: "hsl(35 60% 60%)",
  build: "hsl(28 70% 58%)",
  sharpen: "hsl(14 78% 56%)",
  peak: "hsl(2 80% 58%)",
  fight_week: "hsl(0 85% 60%)",
};

function emptyForm(): CompetitionInput {
  return {
    eventName: "",
    discipline: "",
    eventDate: "",
    weighInDate: "",
    targetWeight: "",
    currentWeight: "",
    notes: "",
  };
}

export default function CompetitionPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useActiveCompetition();
  const pressure = data?.pressure ?? null;

  const [form, setForm] = useState<CompetitionInput>(emptyForm());
  const [showForm, setShowForm] = useState(false);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["competition"] });
  };

  const create = useMutation({
    mutationFn: (input: CompetitionInput) => competitionApi.create(input),
    onSuccess: () => {
      setForm(emptyForm());
      setShowForm(false);
      invalidate();
    },
  });

  const cancel = useMutation({
    mutationFn: (id: number) => competitionApi.cancel(id),
    onSuccess: invalidate,
  });

  const canSubmit = form.eventName.trim().length > 0 && form.eventDate.length > 0;

  const submit = () => {
    if (!canSubmit) return;
    const payload: CompetitionInput = {
      eventName: form.eventName.trim(),
      discipline: form.discipline?.trim() || "",
      eventDate: new Date(form.eventDate).toISOString(),
      weighInDate: form.weighInDate ? new Date(form.weighInDate).toISOString() : null,
      targetWeight: form.targetWeight?.trim() || "",
      currentWeight: form.currentWeight?.trim() || "",
      notes: form.notes?.trim() || "",
    };
    create.mutate(payload);
  };

  return (
    <div className="flex flex-col h-[100dvh]" style={{ background: "#000" }}>
      <header className="flex-none flex items-center gap-3 px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-3 border-b border-white/[0.06]">
        <Link
          href="/"
          aria-label="Back to home"
          className="text-foreground/50 hover:text-foreground/90 transition-colors"
        >
          <ChevronLeft className="w-5 h-5" strokeWidth={1.5} />
        </Link>
        <div>
          <div className="font-sans font-extralight text-[13px] tracking-[0.45em] text-foreground/95 leading-none">
            COMPETITION
          </div>
          <div className="font-mono text-[9px] tracking-[0.45em] text-foreground/50 mt-1.5">
            THE TUNNEL
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto">
        <div className="max-w-md mx-auto px-5 py-6 space-y-7 pb-10">
          {isLoading ? (
            <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
              Loading
            </div>
          ) : pressure ? (
            <section>
              <div
                className="border px-5 py-6 text-center"
                style={{ borderColor: `${TIER_FG[pressure.tier]}55` }}
              >
                <div
                  className="font-mono text-[9px] uppercase tracking-[0.45em]"
                  style={{ color: TIER_FG[pressure.tier] }}
                >
                  {pressure.tierLabel}
                </div>
                <div
                  className="font-sans font-extralight tabular-nums leading-none mt-4"
                  style={{ fontSize: "clamp(3rem,18vw,5rem)", color: TIER_FG[pressure.tier] }}
                >
                  {pressure.daysToEvent}
                </div>
                <div className="font-mono text-[10px] uppercase tracking-[0.4em] text-foreground/55 mt-2">
                  {pressure.daysToEvent === 1 ? "day until" : "days until"} {pressure.competition.eventName}
                </div>
                {pressure.daysToWeighIn !== null && (
                  <div className="font-mono text-[10px] uppercase tracking-[0.35em] text-foreground/45 mt-3">
                    Weigh-in: {pressure.daysToWeighIn}{" "}
                    {pressure.daysToWeighIn === 1 ? "day" : "days"}
                    {pressure.competition.targetWeight
                      ? ` · ${pressure.competition.targetWeight}`
                      : ""}
                  </div>
                )}
              </div>

              <dl className="mt-5 space-y-2.5">
                {pressure.competition.discipline && (
                  <Row label="Discipline" value={pressure.competition.discipline} />
                )}
                {(pressure.competition.currentWeight || pressure.competition.targetWeight) && (
                  <Row
                    label="Weight"
                    value={`${pressure.competition.currentWeight || "?"} → ${
                      pressure.competition.targetWeight || "?"
                    }`}
                  />
                )}
                <Row
                  label="Event date"
                  value={new Date(pressure.competition.eventDate).toLocaleString(undefined, {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                />
                {pressure.competition.notes && (
                  <Row label="Notes" value={pressure.competition.notes} />
                )}
              </dl>

              <p className="mt-5 text-[12px] leading-relaxed text-foreground/55">
                The coach is in camp register — stricter, more demanding, urgency-forward — and
                tightens as the date nears. The countdown stays visible across the app.
              </p>

              <button
                type="button"
                onClick={() => {
                  if (confirm("End competition mode for this event?")) {
                    cancel.mutate(pressure.competition.id);
                  }
                }}
                disabled={cancel.isPending}
                className="mt-6 w-full border border-white/[0.1] py-3 font-mono text-[10px] uppercase tracking-[0.35em] text-foreground/60 hover:text-[hsl(var(--red-accent))] hover:border-[hsl(var(--red-accent))]/50 transition-colors disabled:opacity-50"
              >
                {cancel.isPending ? "Ending" : "End competition mode"}
              </button>
            </section>
          ) : (
            <section>
              <div className="border border-white/[0.08] px-5 py-8 text-center">
                <div className="font-mono text-[10px] uppercase tracking-[0.4em] text-foreground/55">
                  No camp scheduled
                </div>
                <p className="mt-3 text-[12px] leading-relaxed text-foreground/50">
                  Schedule a competition to enter the tunnel. A persistent countdown appears, the
                  interface tightens toward the date, and the coach shifts into camp register.
                </p>
              </div>
              {!showForm && (
                <button
                  type="button"
                  onClick={() => setShowForm(true)}
                  className="mt-5 w-full border border-primary/40 py-3 font-mono text-[11px] uppercase tracking-[0.35em] text-primary hover:bg-primary/5 transition-colors"
                >
                  Schedule competition
                </button>
              )}
            </section>
          )}

          {showForm && !pressure && (
            <section className="space-y-4">
              <Field label="Event name *">
                <input
                  value={form.eventName}
                  onChange={(e) => setForm({ ...form, eventName: e.target.value })}
                  placeholder="ADCC Trials"
                  className="w-full bg-[hsl(0,0%,8%)] border border-white/[0.1] px-3 py-2.5 text-sm text-foreground placeholder:text-foreground/30 outline-none focus:border-primary/50"
                />
              </Field>
              <Field label="Discipline">
                <input
                  value={form.discipline}
                  onChange={(e) => setForm({ ...form, discipline: e.target.value })}
                  placeholder="No-gi / MMA / BJJ"
                  className="w-full bg-[hsl(0,0%,8%)] border border-white/[0.1] px-3 py-2.5 text-sm text-foreground placeholder:text-foreground/30 outline-none focus:border-primary/50"
                />
              </Field>
              <Field label="Event date *">
                <input
                  type="datetime-local"
                  value={form.eventDate}
                  onChange={(e) => setForm({ ...form, eventDate: e.target.value })}
                  className="w-full bg-[hsl(0,0%,8%)] border border-white/[0.1] px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary/50"
                />
              </Field>
              <Field label="Weigh-in (optional)">
                <input
                  type="datetime-local"
                  value={form.weighInDate ?? ""}
                  onChange={(e) => setForm({ ...form, weighInDate: e.target.value })}
                  className="w-full bg-[hsl(0,0%,8%)] border border-white/[0.1] px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary/50"
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Current weight">
                  <input
                    value={form.currentWeight}
                    onChange={(e) => setForm({ ...form, currentWeight: e.target.value })}
                    placeholder="78kg"
                    className="w-full bg-[hsl(0,0%,8%)] border border-white/[0.1] px-3 py-2.5 text-sm text-foreground placeholder:text-foreground/30 outline-none focus:border-primary/50"
                  />
                </Field>
                <Field label="Target weight">
                  <input
                    value={form.targetWeight}
                    onChange={(e) => setForm({ ...form, targetWeight: e.target.value })}
                    placeholder="74kg"
                    className="w-full bg-[hsl(0,0%,8%)] border border-white/[0.1] px-3 py-2.5 text-sm text-foreground placeholder:text-foreground/30 outline-none focus:border-primary/50"
                  />
                </Field>
              </div>
              <Field label="Notes">
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  rows={3}
                  placeholder="Bracket, weaknesses to close, anything the coach should hold you to."
                  className="w-full bg-[hsl(0,0%,8%)] border border-white/[0.1] px-3 py-2.5 text-sm text-foreground placeholder:text-foreground/30 outline-none focus:border-primary/50 resize-none"
                />
              </Field>

              {create.isError && (
                <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-[hsl(var(--red-accent))]">
                  Could not schedule — check the dates
                </div>
              )}

              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false);
                    setForm(emptyForm());
                  }}
                  className="flex-1 border border-white/[0.1] py-3 font-mono text-[10px] uppercase tracking-[0.3em] text-foreground/55 hover:text-foreground/85 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={submit}
                  disabled={!canSubmit || create.isPending}
                  className="flex-1 border border-primary/40 py-3 font-mono text-[10px] uppercase tracking-[0.3em] text-primary hover:bg-primary/5 transition-colors disabled:opacity-40"
                >
                  {create.isPending ? "Entering" : "Enter the tunnel"}
                </button>
              </div>
            </section>
          )}
        </div>
      </main>

      <BottomNav />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-white/[0.05] pb-2.5">
      <dt className="font-mono text-[9px] uppercase tracking-[0.3em] text-foreground/45 pt-0.5">
        {label}
      </dt>
      <dd className="text-[13px] text-foreground/85 text-right max-w-[60%]">{value}</dd>
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
