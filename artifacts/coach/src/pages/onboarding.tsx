import { useEffect, useRef, useState } from "react";
import { CHOICES_PER_QUESTION, QUESTIONS, QUESTION_IDS, composePersonality, questionStep, type Question } from "@workspace/onboarding";
import { useLocation } from "wouter";
import { useAuth } from "@/context/auth-context";
import { useSaveFighter } from "@/hooks/use-fighter";
import { Button } from "@/components/ui/button";
import { Check, ChevronLeft } from "lucide-react";
import { VideoBackdrop } from "@/components/media-backdrop";
import { TAGLINE, SUBLINE } from "@/components/auth-layout";
import { Atmosphere } from "@/components/frame-ui";
import { api, type FighterInput } from "@/lib/api";
import { createOnboardingTracker } from "@/lib/onboarding-tracking";
import {
  FREQUENCIES,
  SPORTS,
  TRAINING_BACKGROUND_OPTIONS,
  levelsForSport,
  levelLabelForSport,
  sportLabel,
  ageFromDob,
} from "@/lib/fighter-options";
import {
  ADVANCE_DELAY_MS,
  NAME_MAX,
  describeSaveError,
  detailsChoiceProblems,
  dobProblem,
  draftHasProgress,
  draftKeyFor,
  nameProblem,
  nextStep,
  parseDraft,
  prevStep,
} from "@/lib/onboarding-form";

const FIELD_LABEL = "label block mb-1.5";
const INPUT_CLASS = "field-glass";
const AREA_CLASS = "field-glass !py-3 leading-6 resize-y";

export default function OnboardingPage() {
  const save = useSaveFighter();
  const { userId, signOut } = useAuth();
  const [, setLocation] = useLocation();
  const [started, setStarted] = useState(false); // false = opening screen
  const [step, setStep] = useState(0); // 0..N-1 = questions, N = details
  const [answers, setAnswers] = useState<Record<string, number>>({});
  // Optional multi-select "Training background" — other arts they've trained.
  const [background, setBackground] = useState<string[]>([]);
  const [form, setForm] = useState<FighterInput>({
    name: "",
    dateOfBirth: "",
    // Nothing is pre-selected: sport, level and frequency must be chosen.
    art: "",
    primarySport: "",
    level: "",
    trainingFrequency: "",
    goals: "",
    weaknesses: "",
    competes: false,
    personality: "",
    bio: "",
  });

  const update = <K extends keyof FighterInput>(k: K, v: FighterInput[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const totalSteps = QUESTIONS.length + 1; // questions + details
  const detailsStep = QUESTIONS.length;

  // Field-level problems, shown after the first "Enter FRAME" tap.
  const [attempted, setAttempted] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const advanceTimer = useRef<number | null>(null);
  const tracker = useRef(createOnboardingTracker());
  const draftReady = useRef(false);

  const clearAdvance = () => {
    if (advanceTimer.current != null) {
      window.clearTimeout(advanceTimer.current);
      advanceTimer.current = null;
    }
  };
  useEffect(() => clearAdvance, []);

  // Resume where they left off: restore a saved draft once, then keep it in sync.
  useEffect(() => {
    if (!userId) return;
    try {
      const d = parseDraft(localStorage.getItem(draftKeyFor(userId)), {
        questionIds: [...QUESTION_IDS],
        choicesPerQuestion: CHOICES_PER_QUESTION,
        sports: SPORTS.map((x) => x.value),
        frequencies: FREQUENCIES,
      });
      if (!d || !draftHasProgress(d)) {
        // A new account starts from the name typed on the sign-up form, so name is never asked twice.
        api.me().then((me) => {
          const n = me?.name?.trim();
          if (n) setForm((f) => (f.name.trim() ? f : { ...f, name: n }));
        }).catch(() => {});
      }
      if (d && draftHasProgress(d)) {
        setStarted(d.started || d.step > 0);
        setStep(d.step);
        setAnswers(d.answers);
        setBackground(d.background);
        setForm((f) => ({
          ...f,
          ...d.form,
          level: d.form.primarySport && levelsForSport(d.form.primarySport).includes(d.form.level) ? d.form.level : "",
        }));
      }
    } catch {
      // storage blocked: start fresh
    }
    draftReady.current = true;
  }, [userId]);

  useEffect(() => {
    if (!userId || !draftReady.current) return;
    try {
      localStorage.setItem(
        draftKeyFor(userId),
        JSON.stringify({ started, step, answers, background, form }),
      );
    } catch {
      // storage blocked: nothing to do
    }
  }, [userId, started, step, answers, background, form]);

  // Funnel: one 'view' per screen the person lands on (fire-and-forget; see lib/onboarding-tracking).
  const stepKey = !started ? "welcome" : step < QUESTIONS.length ? questionStep(QUESTIONS[step].id) : "details";
  useEffect(() => {
    if (!userId) return;
    tracker.current.track(stepKey, "view");
  }, [userId, stepKey]);

  const choiceProblems = attempted ? detailsChoiceProblems(form, levelsForSport) : {};
  const nameErr = attempted ? nameProblem(form.name) : null;
  const dobErr = attempted ? dobProblem(form.dateOfBirth) : null;

  const toggleBackground = (label: string) =>
    setBackground((b) =>
      b.includes(label) ? b.filter((x) => x !== label) : [...b, label],
    );

  const answerQuestion = (q: Question, idx: number) => {
    setAnswers((a) => ({ ...a, [q.id]: idx }));
    // Auto-advance after a beat so the selection registers visually. A second tap
    // during that beat used to queue a second advance (skipping a question, or on
    // the last one landing past the details step on a blank page): one advance only,
    // always computed from the step that was answered.
    if (advanceTimer.current != null) return;
    const answered = step;
    advanceTimer.current = window.setTimeout(() => {
      advanceTimer.current = null;
      tracker.current.track(questionStep(QUESTIONS[answered].id), "complete");
      setStep(nextStep(answered, detailsStep));
    }, ADVANCE_DELAY_MS);
  };

  const goBack = () => {
    clearAdvance();
    setStep((s) => prevStep(s));
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (save.isPending) return;
    setAttempted(true);
    setSaveError(null);
    // Name and DOB are required (DOB is the source of truth; the server derives age from it).
    const missingChoices = detailsChoiceProblems(form, levelsForSport);
    if (
      nameProblem(form.name) ||
      dobProblem(form.dateOfBirth) ||
      ageFromDob(form.dateOfBirth) == null ||
      Object.keys(missingChoices).length > 0
    ) {
      tracker.current.track("details", "error");
      requestAnimationFrame(() =>
        document.querySelector<HTMLElement>("[data-field-error]")?.scrollIntoView({ block: "center", behavior: "smooth" }),
      );
      return;
    }
    const sport = form.primarySport ?? "";
    tracker.current.track("details", "complete");
    save.mutate(
      {
        ...form,
        name: form.name.trim(),
        art: sportLabel(sport),
        trainingBackground: background.join(", "),
        // The answers themselves (editable later from Profile) plus any free-text line;
        // the server recomposes `personality` from them.
        onboardingAnswers: answers,
        personalityNote: form.personality.trim(),
        personality: composePersonality(answers, form.personality),
      },
      {
        onSuccess: () => {
          try {
            if (userId) localStorage.removeItem(draftKeyFor(userId));
          } catch {
            // ignore
          }
        },
        onError: (err) => {
          tracker.current.track("details", "error");
          setSaveError(describeSaveError(err));
        },
      },
    );
  };

  // Opening screen: monochrome athlete imagery, brand lines, one primary route in
  if (!started) {
    return (
      <div
        className="relative grid h-[100dvh] overflow-hidden bg-[var(--f-bg)] text-foreground"
        style={{ gridTemplateRows: "auto minmax(0,1fr) auto" }}
      >
        <VideoBackdrop dim={0.28} />
        <header className="relative z-10 flex items-center justify-center px-6 pt-[max(1.25rem,env(safe-area-inset-top))] pb-2">
          <div className="wordmark text-[1.15rem]">Frame</div>
        </header>
        <div />
        <section className="relative z-10 mx-auto flex w-full max-w-[460px] flex-col gap-5 px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          <div className="frame-rise">
            <h1 className="punch punch-xl text-balance">{TAGLINE}</h1>
            <p className="mt-3 text-base leading-6 text-[var(--f-text-2)]">{SUBLINE}</p>
          </div>
          <div className="frame-rise flex flex-col gap-1" style={{ animationDelay: "80ms" }}>
            <button type="button" className="btn-bronze w-full" onClick={() => {
                tracker.current.track("welcome", "complete");
                setStarted(true);
              }}>
              Get started
            </button>
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <span>Wrong account?</span>
              <button
                type="button"
                onClick={() => {
                  signOut();
                  setLocation("/sign-in");
                }}
                className="inline-flex min-h-[44px] items-center font-semibold text-[var(--f-gold)] transition-colors hover:text-[var(--f-gold-pale)]"
              >
                Sign out
              </button>
            </div>
          </div>
        </section>
      </div>
    );
  }

  // Shared shell
  return (
    <div className="onb-square relative min-h-[100dvh] overflow-hidden text-foreground">
      <div className="atmo atmo-silver-left" aria-hidden />
      <div className="relative z-10 mx-auto flex min-h-[100dvh] w-full max-w-xl flex-col px-5 pb-10 pt-[max(1.5rem,env(safe-area-inset-top))]">
        {/* Wordmark + progress */}
        <div className="mb-8 space-y-4">
          <div className="wordmark text-[1rem]">Frame</div>
          <div
            className="flex items-center gap-1.5"
            role="progressbar"
            aria-label="Progress"
            aria-valuemin={1}
            aria-valuemax={totalSteps}
            aria-valuenow={step + 1}
          >
            {Array.from({ length: totalSteps }).map((_, i) => (
              <span
                key={i}
                className="h-[3px] flex-1 rounded-full transition-colors duration-300"
                style={{ background: i <= step ? "var(--f-text)" : "rgba(255,255,255,0.1)" }}
              />
            ))}
          </div>
        </div>

        {/* Behavioral questions */}
        {step < QUESTIONS.length && (() => {
          const q = QUESTIONS[step];
          const selected = answers[q.id];
          return (
            <div className="space-y-6">
              <div className="space-y-2">
                <div className="label tnum">
                  Question {step + 1} of {QUESTIONS.length}
                </div>
                <h2 className="display-title !text-[1.625rem] !leading-tight">
                  {q.prompt}
                </h2>
              </div>
              <div className="space-y-2.5">
                {q.choices.map((c, idx) => {
                  const isSel = selected === idx;
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => answerQuestion(q, idx)}
                      aria-pressed={isSel}
                      className={`flex w-full items-center justify-between gap-3 rounded-[8px] border px-4 py-3.5 min-h-[56px] text-left text-base transition-colors duration-200 active:scale-[0.99] motion-reduce:transition-none ${
                        isSel
                          ? "border-[#F4F4F1] bg-[#F4F4F1] text-[#08090B]"
                          : "border-[var(--f-border-strong,rgba(255,255,255,0.12))] bg-[var(--f-surface)] text-foreground/90 hover:bg-[var(--f-raised)]"
                      }`}
                    >
                      <span>{c.label}</span>
                      {isSel && <Check className="h-5 w-5 shrink-0 text-[#08090B]" strokeWidth={2} aria-hidden />}
                    </button>
                  );
                })}
              </div>
              {step > 0 && (
                <button
                  type="button"
                  onClick={goBack}
                  className="inline-flex min-h-[44px] items-center gap-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                  <ChevronLeft className="h-4 w-4" strokeWidth={1.75} aria-hidden /> Back
                </button>
              )}
              {step === 0 && (
                <button
                  type="button"
                  onClick={() => setStarted(false)}
                  className="inline-flex min-h-[44px] items-center gap-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                  <ChevronLeft className="h-4 w-4" strokeWidth={1.75} aria-hidden /> Back
                </button>
              )}
            </div>
          );
        })()}

        {/* Practical details */}
        {step === detailsStep && (
          <form onSubmit={submit} noValidate className="space-y-6">
            <div className="space-y-2 mb-2">
              <h2 className="display-title !text-[1.625rem] !leading-tight">
                Tell FRAME about your training
              </h2>
              <p className="text-base text-muted-foreground leading-6">
                The basics — the model sharpens with every session.
              </p>
            </div>

            <div>
              <label htmlFor="onb-name" className={FIELD_LABEL}>Name or callsign (required)</label>
              <input
                id="onb-name"
                className={INPUT_CLASS}
                value={form.name}
                onChange={(e) => update("name", e.target.value)}
                placeholder="What you go by on the mat"
                maxLength={NAME_MAX}
                autoComplete="given-name"
                aria-invalid={nameErr ? true : undefined}
                aria-describedby={nameErr ? "onb-name-err" : undefined}
              />
              {nameErr && (
                <p id="onb-name-err" data-field-error role="alert" className="mt-1.5 text-sm text-[var(--f-red-text)]">
                  {nameErr}
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="onb-dob" className={FIELD_LABEL}>Date of birth (required)</label>
                <input
                  id="onb-dob"
                  type="date"
                  className={INPUT_CLASS}
                  value={form.dateOfBirth ?? ""}
                  min="1900-01-01"
                  max={new Date().toISOString().slice(0, 10)}
                  onChange={(e) => update("dateOfBirth", e.target.value)}
                  aria-invalid={dobErr ? true : undefined}
                  aria-describedby={dobErr ? "onb-dob-err" : undefined}
                />
                {dobErr ? (
                  <p id="onb-dob-err" data-field-error role="alert" className="mt-1.5 text-sm text-[var(--f-red-text)]">
                    {dobErr}
                  </p>
                ) : (
                  ageFromDob(form.dateOfBirth) != null && (
                    <p className="mt-1.5 text-xs text-muted-foreground">
                      {ageFromDob(form.dateOfBirth)} years old
                    </p>
                  )
                )}
              </div>
              <div>
                <label htmlFor="onb-freq" className={FIELD_LABEL}>Training frequency (required)</label>
                <select
                  id="onb-freq"
                  className={INPUT_CLASS}
                  value={form.trainingFrequency}
                  onChange={(e) => update("trainingFrequency", e.target.value)}
                  aria-invalid={choiceProblems.frequency ? true : undefined}
                >
                  <option value="" disabled>
                    Select…
                  </option>
                  {FREQUENCIES.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
                {choiceProblems.frequency && (
                  <p data-field-error role="alert" className="mt-1.5 text-sm text-[var(--f-red-text)]">
                    {choiceProblems.frequency}
                  </p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="onb-sport" className={FIELD_LABEL}>Primary sport (required)</label>
                <select
                  id="onb-sport"
                  className={INPUT_CLASS}
                  value={form.primarySport}
                  onChange={(e) => {
                    const sport = e.target.value;
                    setForm((f) => ({
                      ...f,
                      primarySport: sport,
                      // Level ladders differ per sport — the new sport's level must be chosen again.
                      level: sport === f.primarySport ? f.level : "",
                    }));
                  }}
                  aria-invalid={choiceProblems.sport ? true : undefined}
                >
                  <option value="" disabled>
                    Select…
                  </option>
                  {SPORTS.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
                {choiceProblems.sport && (
                  <p data-field-error role="alert" className="mt-1.5 text-sm text-[var(--f-red-text)]">
                    {choiceProblems.sport}
                  </p>
                )}
              </div>
              <div>
                <label htmlFor="onb-level" className={FIELD_LABEL}>
                  {levelLabelForSport(form.primarySport)} (required)
                </label>
                <select
                  id="onb-level"
                  className={INPUT_CLASS}
                  value={form.level}
                  onChange={(e) => update("level", e.target.value)}
                  disabled={!form.primarySport}
                  aria-invalid={choiceProblems.level ? true : undefined}
                >
                  <option value="" disabled>
                    {form.primarySport ? "Select…" : "Pick a sport first"}
                  </option>
                  {(form.primarySport ? levelsForSport(form.primarySport) : []).map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </select>
                {choiceProblems.level && (
                  <p data-field-error role="alert" className="mt-1.5 text-sm text-[var(--f-red-text)]">
                    {choiceProblems.level}
                  </p>
                )}
              </div>
            </div>

            <div>
              <label className={FIELD_LABEL}>Training background — other arts you've trained (optional)</label>
              <div className="flex flex-wrap gap-2">
                {TRAINING_BACKGROUND_OPTIONS.map((label) => {
                  const on = background.includes(label);
                  return (
                    <button
                      key={label}
                      type="button"
                      onClick={() => toggleBackground(label)}
                      aria-pressed={on}
                      className={`px-4 min-h-[44px] rounded-[8px] border text-sm transition-colors duration-200 ${
                        on
                          ? "border-[#F4F4F1] bg-[#F4F4F1] text-[#08090B]"
                          : "border-[var(--f-border)] bg-[var(--f-surface)] text-foreground/70 hover:bg-[var(--f-raised)]"
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className={FIELD_LABEL}>Goals — what does winning look like in 6 months (optional)</label>
              <textarea
                className={`${AREA_CLASS} min-h-[104px]`}
                value={form.goals}
                onChange={(e) => update("goals", e.target.value)}
                placeholder="e.g. compete this season, stop gassing in round 3, build a reliable A-game"
              />
            </div>

            <div>
              <label className={FIELD_LABEL}>Weaknesses — what's leaking right now (optional)</label>
              <textarea
                className={`${AREA_CLASS} min-h-[104px]`}
                value={form.weaknesses}
                onChange={(e) => update("weaknesses", e.target.value)}
                placeholder="e.g. fragment under top pressure, no takedowns, hesitate to commit to submissions"
              />
            </div>

            <div>
              <label className={FIELD_LABEL}>Bio — saved to your profile, read by FRAME every session (optional)</label>
              <textarea
                className={`${AREA_CLASS} min-h-[88px]`}
                value={form.bio ?? ""}
                onChange={(e) => update("bio", e.target.value)}
                placeholder="Background, injuries, competition history, or anything that shapes how you train."
              />
            </div>

            <div>
              <label className={FIELD_LABEL}>Anything else (optional)</label>
              <textarea
                className={`${AREA_CLASS} min-h-[72px]`}
                value={form.personality}
                onChange={(e) => update("personality", e.target.value)}
                placeholder="A line or two in your own words. Sharpens the read on your archetype."
              />
            </div>

            <label className="flex min-h-[44px] cursor-pointer select-none items-center gap-3 text-base text-foreground">
              <input
                type="checkbox"
                className="h-5 w-5 accent-[#B9A477]"
                checked={form.competes}
                onChange={(e) => update("competes", e.target.checked)}
              />
              <span>I compete (or plan to within 6 months)</span>
            </label>

            {saveError && (
              <div role="alert" className="text-sm text-[var(--f-red-text)]">
                {saveError}
              </div>
            )}

            {/* Pinned so Enter FRAME is always on screen on a long form, with or without the keyboard open. */}
            <div className="sticky bottom-0 z-10 -mx-5 flex items-center gap-3 border-t border-[var(--f-border)] bg-[var(--f-bg)] px-5 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
              <button
                type="button"
                onClick={goBack}
                className="btn-glass shrink-0 !px-5"
              >
                Back
              </button>
              <Button
                type="submit"
                size="lg"
                loading={save.isPending}
                className="flex-1"
              >
                Enter FRAME
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
