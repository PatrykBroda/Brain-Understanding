import { useState } from "react";
import { useSaveFighter } from "@/hooks/use-fighter";
import { Button } from "@/components/ui/button";
import { Check, ChevronLeft } from "lucide-react";
import { VideoBackdrop } from "@/components/media-backdrop";
import { TAGLINE, SUBLINE } from "@/components/auth-layout";
import { Atmosphere } from "@/components/frame-ui";
import type { FighterInput } from "@/lib/api";
import {
  FREQUENCIES,
  SPORTS,
  TRAINING_BACKGROUND_OPTIONS,
  levelsForSport,
  levelLabelForSport,
  sportLabel,
  ageFromDob,
} from "@/lib/fighter-options";

const FIELD_LABEL = "label block mb-1.5";
const INPUT_CLASS = "field-glass";
const AREA_CLASS = "field-glass !py-3 leading-6 resize-y";

// Behavioral calibration. Each answer carries a short "read" sentence that gets
// composed into the personality signal the system uses to assign an archetype.
// The questions are about what the athlete BECOMES under load — not trivia.
type Choice = { label: string; read: string };
type Question = { id: string; prompt: string; choices: Choice[] };

const QUESTIONS: Question[] = [
  {
    id: "tired",
    prompt: "You're gassed and there's still a round left. What happens to you?",
    choices: [
      { label: "I press harder — pace is the weapon", read: "Under fatigue they raise the pace instead of dropping it — pressure-forward." },
      { label: "I shell up and survive the storm", read: "Under fatigue they go defensive and ride it out — survival-minded under load." },
      { label: "I slow down and pick my shots", read: "Under fatigue they get patient and selective — calm and economical." },
      { label: "I start forcing it, emotions creep in", read: "Under fatigue they force things and get emotional — reactive when tired." },
    ],
  },
  {
    id: "imposed",
    prompt: "Someone imposes their pace on you. First instinct?",
    choices: [
      { label: "Meet it head-on, collide", read: "Meets imposed pressure head-on — collision over evasion." },
      { label: "Circle out, reset, re-angle", read: "Slips imposed pressure and re-angles — movement over collision." },
      { label: "Sit still, bait, then counter", read: "Absorbs pressure and counters off the bait — patient counter-fighter." },
      { label: "Match it and outlast them", read: "Matches imposed pace and turns it into attrition — endurance war." },
    ],
  },
  {
    id: "proud",
    prompt: "The roll you're proudest of — you won it by...",
    choices: [
      { label: "Drowning them in relentless pace", read: "Best wins come from relentless pace — a chainer." },
      { label: "Catching the one clean opening", read: "Best wins come from precise timing — a one-shot finisher." },
      { label: "Out-thinking them, two moves ahead", read: "Best wins come from reading the pattern — high fight-IQ." },
      { label: "Refusing to break when they pushed", read: "Best wins come from refusing to break — pure will." },
    ],
  },
  {
    id: "chaos",
    prompt: "When it all goes chaotic, you become...",
    choices: [
      { label: "More aggressive", read: "Chaos makes them more aggressive." },
      { label: "More still and quiet", read: "Chaos makes them go still and quiet." },
      { label: "More analytical", read: "Chaos makes them more analytical." },
      { label: "More stubborn", read: "Chaos makes them dig in and get stubborn." },
    ],
  },
];

export default function OnboardingPage() {
  const save = useSaveFighter();
  const [started, setStarted] = useState(false); // false = opening screen
  const [step, setStep] = useState(0); // 0..N-1 = questions, N = details
  const [answers, setAnswers] = useState<Record<string, number>>({});
  // Optional multi-select "Training background" — other arts they've trained.
  const [background, setBackground] = useState<string[]>([]);
  const [form, setForm] = useState<FighterInput>({
    name: "",
    dateOfBirth: "",
    art: "MMA",
    primarySport: "mma",
    level: "Beginner",
    trainingFrequency: "3-4x / week",
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

  const toggleBackground = (label: string) =>
    setBackground((b) =>
      b.includes(label) ? b.filter((x) => x !== label) : [...b, label],
    );

  const composePersonality = (): string => {
    const reads = QUESTIONS.map((q) => {
      const idx = answers[q.id];
      return idx == null ? null : q.choices[idx].read;
    }).filter(Boolean) as string[];
    const extra = form.personality?.trim();
    return [...reads, extra].filter(Boolean).join(" ");
  };

  const answerQuestion = (q: Question, idx: number) => {
    setAnswers((a) => ({ ...a, [q.id]: idx }));
    // Auto-advance after a beat so the selection registers visually.
    window.setTimeout(() => setStep((s) => s + 1), 220);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || save.isPending) return;
    // DOB is required and is the source of truth; the server derives age from it.
    if (ageFromDob(form.dateOfBirth) == null) return;
    const sport = form.primarySport ?? "mma";
    save.mutate({
      ...form,
      name: form.name.trim(),
      art: sportLabel(sport),
      trainingBackground: background.join(", "),
      personality: composePersonality(),
    });
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
            <button type="button" className="btn-bronze w-full" onClick={() => setStarted(true)}>
              Get started
            </button>
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <span>Already have an account?</span>
              <a
                href={`${import.meta.env.BASE_URL.replace(/\/$/, "")}/sign-in`}
                className="inline-flex min-h-[44px] items-center font-semibold text-[var(--f-gold)] transition-colors hover:text-[var(--f-gold-pale)]"
              >
                Sign in
              </a>
            </div>
          </div>
        </section>
      </div>
    );
  }

  // Shared shell
  return (
    <div className="relative min-h-[100dvh] overflow-hidden text-foreground">
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
                style={{ background: i <= step ? "var(--f-gold)" : "rgba(255,255,255,0.1)" }}
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
                      className={`flex w-full items-center justify-between gap-3 rounded-[16px] border px-4 py-3.5 min-h-[56px] text-left text-base transition-colors duration-200 active:scale-[0.99] motion-reduce:transition-none ${
                        isSel
                          ? "border-[rgba(185,164,119,0.5)] bg-[var(--f-raised)] text-foreground"
                          : "border-[var(--f-border)] bg-[var(--f-surface)] text-foreground/90 hover:bg-[var(--f-raised)]"
                      }`}
                    >
                      <span>{c.label}</span>
                      {isSel && <Check className="h-5 w-5 shrink-0 text-[var(--f-gold)]" strokeWidth={2} aria-hidden />}
                    </button>
                  );
                })}
              </div>
              {step > 0 && (
                <button
                  type="button"
                  onClick={() => setStep((s) => Math.max(0, s - 1))}
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
          <form onSubmit={submit} className="space-y-6">
            <div className="space-y-2 mb-2">
              <h2 className="display-title !text-[1.625rem] !leading-tight">
                Tell FRAME about your training
              </h2>
              <p className="text-base text-muted-foreground leading-6">
                The basics — the model sharpens with every session.
              </p>
            </div>

            <div>
              <label className={FIELD_LABEL}>Name or callsign</label>
              <input
                className={INPUT_CLASS}
                value={form.name}
                onChange={(e) => update("name", e.target.value)}
                placeholder="What you go by on the mat"
                required
                autoFocus
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={FIELD_LABEL}>Date of birth</label>
                <input
                  type="date"
                  className={INPUT_CLASS}
                  value={form.dateOfBirth ?? ""}
                  max={new Date().toISOString().slice(0, 10)}
                  onChange={(e) => update("dateOfBirth", e.target.value)}
                  required
                />
                {ageFromDob(form.dateOfBirth) != null && (
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    {ageFromDob(form.dateOfBirth)} years old
                  </p>
                )}
              </div>
              <div>
                <label className={FIELD_LABEL}>Training frequency</label>
                <select
                  className={INPUT_CLASS}
                  value={form.trainingFrequency}
                  onChange={(e) => update("trainingFrequency", e.target.value)}
                >
                  {FREQUENCIES.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={FIELD_LABEL}>Primary combat sport</label>
                <select
                  className={INPUT_CLASS}
                  value={form.primarySport}
                  onChange={(e) => {
                    const sport = e.target.value;
                    setForm((f) => ({
                      ...f,
                      primarySport: sport,
                      // Level ladders differ per sport — reset to the first option.
                      level: levelsForSport(sport)[0],
                    }));
                  }}
                >
                  {SPORTS.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={FIELD_LABEL}>
                  {levelLabelForSport(form.primarySport)}
                </label>
                <select
                  className={INPUT_CLASS}
                  value={form.level}
                  onChange={(e) => update("level", e.target.value)}
                >
                  {levelsForSport(form.primarySport ?? "mma").map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </select>
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
                      className={`px-4 min-h-[44px] rounded-full border text-sm transition-colors duration-200 ${
                        on
                          ? "border-[rgba(185,164,119,0.5)] bg-[var(--f-raised)] text-foreground"
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
              <label className={FIELD_LABEL}>Goals — what does winning look like in 6 months</label>
              <textarea
                className={`${AREA_CLASS} min-h-[88px]`}
                value={form.goals}
                onChange={(e) => update("goals", e.target.value)}
                placeholder="e.g. compete this season, stop gassing in round 3, build a reliable A-game"
              />
            </div>

            <div>
              <label className={FIELD_LABEL}>Weaknesses — what's leaking right now</label>
              <textarea
                className={`${AREA_CLASS} min-h-[88px]`}
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

            {save.isError && (
              <div role="alert" className="text-sm text-[var(--f-red-text)]">
                {(save.error as Error).message}
              </div>
            )}

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setStep((s) => Math.max(0, s - 1))}
                className="btn-glass shrink-0 !px-5"
              >
                Back
              </button>
              <Button
                type="submit"
                size="lg"
                loading={save.isPending}
                disabled={!form.name.trim()}
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
