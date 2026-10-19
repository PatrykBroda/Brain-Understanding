import { useEffect, useState } from "react";
import { Check, ChevronDown, ChevronUp } from "lucide-react";
import { QUESTIONS, normaliseFrequency } from "@workspace/onboarding";
import { useQueryClient } from "@tanstack/react-query";
import { api, type Fighter } from "@/lib/api";
import { FREQUENCIES, SPORTS, levelLabelForSport, levelsForSport, sportLabel } from "@/lib/fighter-options";
import {
  answeredCount,
  answersOf,
  chosenLabel,
  dobPatch,
  frequencyPatch,
  questionPatch,
  sportPatch,
  textPatch,
  type PatchResult,
} from "@/lib/profile-answers";

type Open = "dob" | "sport" | "frequency" | "goals" | "weaknesses" | `q:${string}` | null;

function Chips({ options, value, onSelect }: { options: { key: string; label: string }[]; value: string; onSelect: (k: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const on = value === o.key;
        return (
          <button
            key={o.key}
            type="button"
            aria-pressed={on}
            onClick={() => onSelect(o.key)}
            className={`min-h-[44px] rounded-[8px] border px-4 text-sm font-medium transition-colors ${
              on ? "border-[#F4F4F1] bg-[#F4F4F1] text-[#08090B]" : "border-white/[0.12] bg-[var(--f-surface)] text-[var(--f-text-2)] hover:bg-[var(--f-raised)]"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function Row({
  label,
  value,
  open,
  onToggle,
  saved,
  children,
}: {
  label: string;
  value: string | null;
  open: boolean;
  onToggle: () => void;
  saved?: boolean;
  children?: React.ReactNode;
}) {
  const Icon = open ? ChevronUp : ChevronDown;
  return (
    <div className="border-t border-white/[0.06] first:border-t-0">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex min-h-[56px] w-full items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-white/[0.03]"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-[0.8125rem] leading-[1.3] text-[var(--f-text-2)]">{label}</span>
          <span className={`mt-0.5 block text-[0.9375rem] font-medium leading-snug ${value ? "text-foreground" : "text-[var(--f-text-3)]"}`}>
            {value ?? "Not answered yet"}
          </span>
        </span>
        {saved && <span className="text-xs font-medium text-[#8FB89A]" role="status">Saved</span>}
        <Icon className="h-[18px] w-[18px] flex-none text-[var(--f-text-3)]" strokeWidth={1.75} aria-hidden />
      </button>
      {open && <div className="space-y-3 px-5 pb-5">{children}</div>}
    </div>
  );
}

/**
 * The onboarding questionnaire, editable any time. Every change saves at once through the
 * same PATCH /api/fighter onboarding uses, so the coach, State and Today's Focus pick it up
 * and it is still there after closing and reopening the app.
 */
export function AnswersSection({ fighter }: { fighter: Fighter }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState<Open>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedKey, setSavedKey] = useState<string | null>(null);

  const [sport, setSport] = useState(fighter.primarySport ?? "");
  const [level, setLevel] = useState(fighter.level ?? "");
  const [dob, setDob] = useState(fighter.dateOfBirth ?? "");
  const [goals, setGoals] = useState(fighter.goals ?? "");
  const [weaknesses, setWeaknesses] = useState(fighter.weaknesses ?? "");

  useEffect(() => {
    setSport(fighter.primarySport ?? "");
    setLevel(fighter.level ?? "");
    setDob(fighter.dateOfBirth ?? "");
    setGoals(fighter.goals ?? "");
    setWeaknesses(fighter.weaknesses ?? "");
  }, [fighter.updatedAt]);

  useEffect(() => {
    if (!savedKey) return;
    const t = window.setTimeout(() => setSavedKey(null), 2200);
    return () => window.clearTimeout(t);
  }, [savedKey]);

  async function save(key: string, result: PatchResult, close = true) {
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.updateFighter(result.body);
      await qc.invalidateQueries({ queryKey: ["fighter"] });
      void qc.invalidateQueries({ queryKey: ["today"] });
      void qc.invalidateQueries({ queryKey: ["conversation"] });
      setSavedKey(key);
      if (close) setOpen(null);
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "Couldn't save that. Try again.");
    } finally {
      setSaving(false);
    }
  }

  const toggle = (k: Open) => {
    setError(null);
    setOpen((o) => (o === k ? null : k));
  };

  const answers = answersOf(fighter);
  const sportOptions = SPORTS.map((s) => ({ key: s.value, label: s.label }));
  if (fighter.primarySport && !sportOptions.some((o) => o.key === fighter.primarySport)) {
    sportOptions.push({ key: fighter.primarySport, label: sportLabel(fighter.primarySport) });
  }
  const levelOptions = levelsForSport(sport).map((l) => ({ key: l, label: l }));
  const sportText = fighter.primarySport ? `${sportLabel(fighter.primarySport)}${fighter.level ? ` · ${fighter.level}` : ""}` : null;
  const dobText = fighter.dateOfBirth
    ? new Date(`${fighter.dateOfBirth}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })
    : null;
  const freqText = fighter.trainingFrequency ? normaliseFrequency(fighter.trainingFrequency) : null;
  const field = "field-glass";

  return (
    <section aria-label="Your answers">
      <div className="mb-1.5 flex items-center justify-between">
        <h2 className="section-title">Your answers</h2>
        {saving && <span className="text-xs text-[var(--f-text-3)]" role="status">Saving…</span>}
      </div>
      <p className="mb-3 text-sm leading-5 text-[var(--f-text-2)]">
        What you told FRAME when you joined. Change any of it, any time: your coach, State and Today&apos;s Focus use the latest.{" "}
        <span className="tnum">{answeredCount(fighter)} of {QUESTIONS.length}</span> questions answered.
      </p>
      <div className="glass overflow-hidden">
        <Row label="Date of birth" value={dobText} open={open === "dob"} onToggle={() => toggle("dob")} saved={savedKey === "dob"}>
          <label htmlFor="ans-dob" className="label block">Date of birth</label>
          <input
            id="ans-dob"
            type="date"
            className={field}
            value={dob}
            min="1900-01-01"
            max={new Date().toISOString().slice(0, 10)}
            onChange={(e) => setDob(e.target.value)}
          />
          <button type="button" className="btn-quiet" disabled={saving} onClick={() => void save("dob", dobPatch(dob))}>
            Save date of birth
          </button>
        </Row>

        <Row label="What you train" value={sportText} open={open === "sport"} onToggle={() => toggle("sport")} saved={savedKey === "sport"}>
          <div className="label">Primary sport</div>
          <Chips
            options={sportOptions}
            value={sport}
            onSelect={(k) => {
              // Levels differ per sport: the old one is cleared and the new one must be chosen.
              if (k !== sport) setLevel("");
              setSport(k);
            }}
          />
          {sport && (
            <>
              <div className="label pt-2">{levelLabelForSport(sport)}</div>
              <Chips
                options={levelOptions}
                value={level}
                onSelect={(k) => {
                  setLevel(k);
                  void save("sport", sportPatch(sport, k));
                }}
              />
            </>
          )}
        </Row>

        <Row label="How often you train" value={freqText} open={open === "frequency"} onToggle={() => toggle("frequency")} saved={savedKey === "frequency"}>
          <Chips options={FREQUENCIES.map((f) => ({ key: f, label: f }))} value={freqText ?? ""} onSelect={(k) => void save("frequency", frequencyPatch(k))} />
        </Row>

        <Row label="Goals" value={fighter.goals?.trim() ? fighter.goals : null} open={open === "goals"} onToggle={() => toggle("goals")} saved={savedKey === "goals"}>
          <label htmlFor="ans-goals" className="label block">Goals</label>
          <textarea id="ans-goals" className={`${field} min-h-[96px] !py-3 leading-6`} value={goals} onChange={(e) => setGoals(e.target.value)} placeholder="What are you here to build?" maxLength={2000} />
          <button type="button" className="btn-quiet" disabled={saving} onClick={() => void save("goals", textPatch("goals", goals))}>
            Save goals
          </button>
        </Row>

        <Row label="Known weaknesses" value={fighter.weaknesses?.trim() ? fighter.weaknesses : null} open={open === "weaknesses"} onToggle={() => toggle("weaknesses")} saved={savedKey === "weaknesses"}>
          <label htmlFor="ans-weak" className="label block">Known weaknesses</label>
          <textarea id="ans-weak" className={`${field} min-h-[96px] !py-3 leading-6`} value={weaknesses} onChange={(e) => setWeaknesses(e.target.value)} placeholder="What breaks first when pressure spikes?" maxLength={2000} />
          <button type="button" className="btn-quiet" disabled={saving} onClick={() => void save("weaknesses", textPatch("weaknesses", weaknesses))}>
            Save weaknesses
          </button>
        </Row>

        {QUESTIONS.map((q) => (
          <Row
            key={q.id}
            label={q.prompt}
            value={chosenLabel(fighter, q.id)}
            open={open === `q:${q.id}`}
            onToggle={() => toggle(`q:${q.id}`)}
            saved={savedKey === `q:${q.id}`}
          >
            <div className="space-y-2">
              {q.choices.map((c, idx) => {
                const on = answers[q.id] === idx;
                return (
                  <button
                    key={c.label}
                    type="button"
                    aria-pressed={on}
                    onClick={() => void save(`q:${q.id}`, questionPatch(fighter, q.id, idx))}
                    className={`flex min-h-[52px] w-full items-center justify-between gap-3 rounded-[8px] border px-3.5 py-2.5 text-left text-[0.9375rem] font-medium transition-colors ${
                      on ? "border-[#F4F4F1] bg-[#F4F4F1] text-[#08090B]" : "border-white/[0.12] bg-[var(--f-surface)] text-[var(--f-text-2)] hover:bg-[var(--f-raised)]"
                    }`}
                  >
                    <span>{c.label}</span>
                    {on && <Check className="h-[18px] w-[18px] flex-none" strokeWidth={2} aria-hidden />}
                  </button>
                );
              })}
            </div>
          </Row>
        ))}
      </div>
      {error && (
        <p role="alert" className="mt-2.5 text-sm text-[var(--f-red-text)]">
          {error}
        </p>
      )}
    </section>
  );
}
