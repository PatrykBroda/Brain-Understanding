import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { QUESTIONS, normaliseFrequency } from "@workspace/onboarding";
import { api, type Fighter } from "@/lib/api";
import {
  FREQUENCIES,
  SPORTS,
  TRAINING_BACKGROUND_OPTIONS,
  levelLabelForSport,
  levelsForSport,
  sportLabel,
} from "@/lib/fighter-options";
import { describeSaveError } from "@/lib/onboarding-form";
import { createOnboardingTracker } from "@/lib/onboarding-tracking";
import {
  formFromFighter,
  formsEqual,
  newlyAnsweredSteps,
  savePatch,
  type FormErrors,
  type QuestionnaireForm,
} from "@/lib/profile-answers";

// The same look as the original onboarding screen, moved onto Profile.
const FIELD_LABEL = "block font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-2";
const INPUT_CLASS =
  "w-full bg-transparent border border-border/70 text-foreground text-sm px-3 py-2.5 focus:outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/40 placeholder:text-muted-foreground/60 hover:border-border/90 transition-colors duration-150";

// One tracker for the page session: each step is reported once however often the section re-renders.
const tracker = createOnboardingTracker();

function normalised(f: Fighter) {
  return { ...f, trainingFrequency: f.trainingFrequency ? normaliseFrequency(f.trainingFrequency) : "" };
}

/**
 * ONBOARDING QUESTIONS: the original onboarding questions, answered from Profile after sign-up
 * and editable any time. Nothing is pre-selected. Save sends one PATCH /api/fighter; the fighter
 * cache is refreshed so the coach, State and Today's Focus see the change.
 */
export function AnswersSection({ fighter, highlight = false }: { fighter: Fighter; highlight?: boolean }) {
  const qc = useQueryClient();
  const stored = useMemo(() => formFromFighter(normalised(fighter)), [fighter]);
  const [form, setForm] = useState<QuestionnaireForm>(stored);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FormErrors>({});
  const dirty = useRef(false);

  // Funnel: the section was seen.
  useEffect(() => {
    tracker.track("questions_view", "view");
  }, []);

  // Re-fill from the fighter whenever it changes (after a save or a refetch), unless there are unsaved edits.
  useEffect(() => {
    if (!dirty.current) setForm(stored);
  }, [stored]);

  useEffect(() => {
    if (!saved) return;
    const t = window.setTimeout(() => setSaved(false), 3000);
    return () => window.clearTimeout(t);
  }, [saved]);

  const edit = (fn: (f: QuestionnaireForm) => QuestionnaireForm) => {
    dirty.current = true;
    setSaved(false);
    setError(null);
    setFieldErrors({});
    setForm(fn);
  };
  const set = <K extends keyof QuestionnaireForm>(k: K, v: QuestionnaireForm[K]) => edit((f) => ({ ...f, [k]: v }));

  const changed = !formsEqual(form, stored);

  const toggleBackground = (label: string) =>
    set("background", form.background.includes(label) ? form.background.filter((x) => x !== label) : [...form.background, label]);

  async function save() {
    if (saving) return;
    const result = savePatch(form);
    if (!result.ok) {
      setFieldErrors(result.errors);
      setError("Check the highlighted answers, then save again.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.updateFighter(result.body);
      dirty.current = false;
      await qc.invalidateQueries({ queryKey: ["fighter"] });
      void qc.invalidateQueries({ queryKey: ["today"] });
      void qc.invalidateQueries({ queryKey: ["conversation"] });
      for (const step of newlyAnsweredSteps(normalised(fighter), form)) tracker.track(step, "complete");
      setSaved(true);
    } catch (e) {
      setError(describeSaveError(e));
    } finally {
      setSaving(false);
    }
  }

  // Legacy values (a sport or level the picker no longer offers) stay selectable so nothing is lost.
  const sportOptions = SPORTS.map((s) => ({ value: s.value, label: s.label }));
  if (form.primarySport && !sportOptions.some((o) => o.value === form.primarySport)) {
    sportOptions.push({ value: form.primarySport, label: sportLabel(form.primarySport) });
  }
  const levelOptions = [...levelsForSport(form.primarySport || "mma")];
  if (form.level && !levelOptions.includes(form.level)) levelOptions.unshift(form.level);
  const frequencyOptions: string[] = [...FREQUENCIES];
  if (form.trainingFrequency && !frequencyOptions.includes(form.trainingFrequency)) {
    frequencyOptions.unshift(form.trainingFrequency);
  }

  return (
    <section
      id="onboarding-questions"
      aria-label="Onboarding questions"
      className={`scroll-mt-4 transition-shadow duration-500 ${highlight ? "ring-1 ring-primary/60" : ""}`}
    >
      <div className="font-mono text-[9px] uppercase tracking-[0.45em] text-muted-foreground/65 mb-3">
        Onboarding Questions
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
        className="border border-white/[0.08] p-4 space-y-6"
      >
        <p className="text-sm text-muted-foreground leading-relaxed">
          Tell FRAME about your training. The coach, your State and Today&apos;s Focus use your latest answers. Change
          them any time.
        </p>

        {/* Behavioural questions */}
        {QUESTIONS.map((q, qi) => {
          const selected = form.answers[q.id];
          return (
            <div key={q.id} className="space-y-3">
              <div className="space-y-1.5">
                <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-primary/80">
                  Calibration {qi + 1} / {QUESTIONS.length}
                </div>
                <h3 className="text-base text-foreground font-light leading-snug">{q.prompt}</h3>
              </div>
              <div className="space-y-2" role="group" aria-label={q.prompt}>
                {q.choices.map((c, idx) => {
                  const isSel = selected === idx;
                  return (
                    <button
                      key={idx}
                      type="button"
                      aria-pressed={isSel}
                      onClick={() => set("answers", { ...form.answers, [q.id]: idx })}
                      className={`w-full text-left px-4 py-3 border text-sm transition-colors ${
                        isSel
                          ? "border-primary text-foreground"
                          : "border-border/70 text-foreground/85 hover:border-primary/50"
                      }`}
                    >
                      <span className="font-mono text-[10px] text-muted-foreground mr-3">
                        {String.fromCharCode(65 + idx)}
                      </span>
                      {c.label}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}

        {/* Practical details */}
        <div className="space-y-5 pt-1">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="oq-dob" className={FIELD_LABEL}>
                Date of birth
              </label>
              <input
                id="oq-dob"
                type="date"
                className={INPUT_CLASS}
                value={form.dateOfBirth}
                min="1900-01-01"
                max={new Date().toISOString().slice(0, 10)}
                onChange={(e) => set("dateOfBirth", e.target.value)}
                aria-invalid={fieldErrors.dateOfBirth ? true : undefined}
              />
              {fieldErrors.dateOfBirth && (
                <p role="alert" className="mt-1.5 font-mono text-[10px] text-destructive">
                  {fieldErrors.dateOfBirth}
                </p>
              )}
            </div>
            <div>
              <label htmlFor="oq-freq" className={FIELD_LABEL}>
                Training Frequency
              </label>
              <select
                id="oq-freq"
                className={INPUT_CLASS}
                value={form.trainingFrequency}
                onChange={(e) => set("trainingFrequency", e.target.value)}
              >
                <option value="">Select…</option>
                {frequencyOptions.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="oq-sport" className={FIELD_LABEL}>
                Primary Combat Sport
              </label>
              <select
                id="oq-sport"
                className={INPUT_CLASS}
                value={form.primarySport}
                onChange={(e) => {
                  const sport = e.target.value;
                  // Level ladders differ per sport: the old level is cleared and must be chosen again.
                  edit((f) => ({ ...f, primarySport: sport, level: sport === f.primarySport ? f.level : "" }));
                }}
              >
                <option value="">Select…</option>
                {sportOptions.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="oq-level" className={FIELD_LABEL}>
                {levelLabelForSport(form.primarySport)}
              </label>
              <select
                id="oq-level"
                className={INPUT_CLASS}
                value={form.level}
                disabled={!form.primarySport}
                onChange={(e) => set("level", e.target.value)}
                aria-invalid={fieldErrors.level ? true : undefined}
              >
                <option value="">{form.primarySport ? "Select…" : "Choose a sport first"}</option>
                {form.primarySport &&
                  levelOptions.map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
              </select>
              {fieldErrors.level && (
                <p role="alert" className="mt-1.5 font-mono text-[10px] text-destructive">
                  {fieldErrors.level}
                </p>
              )}
            </div>
          </div>

          <div>
            <div className={FIELD_LABEL}>Training background — other arts you&apos;ve trained (optional)</div>
            <div className="flex flex-wrap gap-2">
              {TRAINING_BACKGROUND_OPTIONS.map((label) => {
                const on = form.background.includes(label);
                return (
                  <button
                    key={label}
                    type="button"
                    onClick={() => toggleBackground(label)}
                    aria-pressed={on}
                    className={`px-3 py-2 border text-xs transition-colors ${
                      on ? "border-primary text-foreground" : "border-border/70 text-foreground/70 hover:border-primary/50"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label htmlFor="oq-goals" className={FIELD_LABEL}>
              Goals — what does winning look like in 6 months
            </label>
            <textarea
              id="oq-goals"
              className={`${INPUT_CLASS} min-h-[72px] resize-y`}
              value={form.goals}
              onChange={(e) => set("goals", e.target.value)}
              placeholder="e.g. compete this season, stop gassing in round 3, build a reliable A-game"
              maxLength={2000}
            />
          </div>

          <div>
            <label htmlFor="oq-weak" className={FIELD_LABEL}>
              Weaknesses — what&apos;s leaking right now
            </label>
            <textarea
              id="oq-weak"
              className={`${INPUT_CLASS} min-h-[72px] resize-y`}
              value={form.weaknesses}
              onChange={(e) => set("weaknesses", e.target.value)}
              placeholder="e.g. fragment under top pressure, no takedowns, hesitate to commit to submissions"
              maxLength={2000}
            />
          </div>

          <div>
            <label htmlFor="oq-bio" className={FIELD_LABEL}>
              Bio — saved to your profile, read by FRAME every session (optional)
            </label>
            <textarea
              id="oq-bio"
              className={`${INPUT_CLASS} min-h-[72px] resize-y`}
              value={form.bio}
              onChange={(e) => set("bio", e.target.value)}
              placeholder="Background, injuries, competition history, or anything that shapes how you train."
            />
          </div>

          <div>
            <label htmlFor="oq-note" className={FIELD_LABEL}>
              Anything else (optional)
            </label>
            <textarea
              id="oq-note"
              className={`${INPUT_CLASS} min-h-[60px] resize-y`}
              value={form.note}
              onChange={(e) => set("note", e.target.value)}
              placeholder="A line or two in your own words. Sharpens the read on your archetype."
            />
          </div>

          <label className="flex items-center gap-3 text-sm text-foreground cursor-pointer select-none">
            <input
              type="checkbox"
              className="w-4 h-4 accent-primary"
              checked={form.competes}
              onChange={(e) => set("competes", e.target.checked)}
            />
            <span>I compete (or plan to within 6 months)</span>
          </label>
        </div>

        {error && (
          <div role="alert" className="text-sm text-destructive font-mono">
            {error}
          </div>
        )}

        <div className="flex items-center gap-4">
          <button
            type="submit"
            disabled={saving || !changed}
            className="px-5 py-2.5 border border-primary/60 font-mono text-[10px] uppercase tracking-[0.3em] text-primary hover:bg-primary/10 transition-colors disabled:opacity-40"
          >
            {saving ? "Saving…" : error ? "Retry" : "Save"}
          </button>
          {saved && !changed && (
            <span role="status" className="font-mono text-[10px] uppercase tracking-widest text-primary">
              Saved
            </span>
          )}
        </div>
      </form>
    </section>
  );
}
