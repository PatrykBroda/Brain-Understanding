import { useState } from "react";
import { useSaveFighter } from "@/hooks/use-fighter";
import { Button } from "@/components/ui/button";
import type { FighterInput } from "@/lib/api";
import { ARTS, LEVELS, FREQUENCIES, SPORTS, ageFromDob } from "@/lib/fighter-options";

const FIELD_LABEL = "block font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-2";
const INPUT_CLASS =
  "w-full bg-secondary/40 border border-border/70 text-foreground text-sm px-3 py-2.5 focus:outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/40 placeholder:text-muted-foreground/60";

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
  const [step, setStep] = useState(0); // 0 = intro, 1..N = questions, N+1 = details
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [form, setForm] = useState<FighterInput>({
    name: "",
    dateOfBirth: "",
    art: "BJJ",
    primarySport: "bjj",
    level: "Blue",
    trainingFrequency: "3-4x / week",
    goals: "",
    weaknesses: "",
    competes: false,
    personality: "",
  });

  const update = <K extends keyof FighterInput>(k: K, v: FighterInput[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const totalSteps = QUESTIONS.length + 2; // intro + questions + details
  const detailsStep = QUESTIONS.length + 1;

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
    save.mutate({ ...form, personality: composePersonality() });
  };

  // Shared shell
  return (
    <div className="min-h-[100dvh] bg-background text-foreground flex justify-center px-4 py-12 md:py-16">
      <div className="w-full max-w-xl">
        {/* Wordmark + progress */}
        <div className="mb-10 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 bg-primary" />
            <h1 className="font-mono font-bold text-sm tracking-[0.3em] uppercase text-foreground/90">
              Synochi
            </h1>
          </div>
          <div className="flex items-center gap-1.5">
            {Array.from({ length: totalSteps }).map((_, i) => (
              <span
                key={i}
                className="h-0.5 flex-1 transition-colors duration-500"
                style={{ background: i <= step ? "hsl(var(--primary))" : "hsl(var(--border))" }}
              />
            ))}
          </div>
        </div>

        {/* Intro */}
        {step === 0 && (
          <div className="space-y-7">
            <div className="space-y-3">
              <h2 className="text-2xl md:text-3xl text-foreground font-light leading-tight">
                Let's see what you become under pressure.
              </h2>
              <p className="text-sm text-muted-foreground leading-relaxed max-w-md">
                Not your résumé. Your wiring. A few honest questions about how you move when it gets
                hard — the system reads them to find your combat archetype. No wrong answers, only
                true ones.
              </p>
            </div>
            <div>
              <label className={FIELD_LABEL}>Name / Callsign</label>
              <input
                className={INPUT_CLASS}
                value={form.name}
                onChange={(e) => update("name", e.target.value)}
                placeholder="What you go by on the mat"
                autoFocus
              />
            </div>
            <Button
              type="button"
              disabled={!form.name.trim()}
              onClick={() => setStep(1)}
              className="w-full h-12 font-mono text-xs uppercase tracking-[0.25em] bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
            >
              Begin calibration
            </Button>
          </div>
        )}

        {/* Behavioral questions */}
        {step >= 1 && step <= QUESTIONS.length && (() => {
          const q = QUESTIONS[step - 1];
          const selected = answers[q.id];
          return (
            <div className="space-y-7">
              <div className="space-y-2">
                <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-primary/80">
                  Calibration {step} / {QUESTIONS.length}
                </div>
                <h2 className="text-xl md:text-2xl text-foreground font-light leading-snug">
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
                      className={`w-full text-left px-4 py-3.5 border text-sm transition-colors ${
                        isSel
                          ? "border-primary bg-primary/10 text-foreground"
                          : "border-border/70 text-foreground/85 hover:border-primary/50 hover:bg-secondary/30"
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
              <button
                type="button"
                onClick={() => setStep((s) => Math.max(0, s - 1))}
                className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors"
              >
                ← Back
              </button>
            </div>
          );
        })()}

        {/* Practical details */}
        {step === detailsStep && (
          <form onSubmit={submit} className="space-y-6">
            <div className="space-y-2 mb-2">
              <h2 className="text-xl md:text-2xl text-foreground font-light leading-snug">
                Last thing — the hard facts.
              </h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Be honest about level and what's leaking. The model sharpens with every session.
              </p>
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
                  <p className="mt-1.5 font-mono text-[10px] text-muted-foreground">
                    {ageFromDob(form.dateOfBirth)} years old
                  </p>
                )}
              </div>
              <div>
                <label className={FIELD_LABEL}>Training Frequency</label>
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
                <label className={FIELD_LABEL}>Primary Combat Sport</label>
                <select
                  className={INPUT_CLASS}
                  value={form.primarySport}
                  onChange={(e) => update("primarySport", e.target.value)}
                >
                  {SPORTS.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={FIELD_LABEL}>Skill Level</label>
                <select
                  className={INPUT_CLASS}
                  value={form.level}
                  onChange={(e) => update("level", e.target.value)}
                >
                  {LEVELS.map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className={FIELD_LABEL}>Primary Art / Style</label>
              <select
                className={INPUT_CLASS}
                value={form.art}
                onChange={(e) => update("art", e.target.value)}
              >
                {ARTS.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className={FIELD_LABEL}>Goals — what does winning look like in 6 months</label>
              <textarea
                className={`${INPUT_CLASS} min-h-[72px] resize-y`}
                value={form.goals}
                onChange={(e) => update("goals", e.target.value)}
                placeholder="e.g. compete at IBJJF blue belt, stop gassing in round 3, build a real top game"
              />
            </div>

            <div>
              <label className={FIELD_LABEL}>Weaknesses — what's leaking right now</label>
              <textarea
                className={`${INPUT_CLASS} min-h-[72px] resize-y`}
                value={form.weaknesses}
                onChange={(e) => update("weaknesses", e.target.value)}
                placeholder="e.g. fragment under top pressure, no takedowns, hesitate to commit to submissions"
              />
            </div>

            <div>
              <label className={FIELD_LABEL}>Anything else the system should know (optional)</label>
              <textarea
                className={`${INPUT_CLASS} min-h-[60px] resize-y`}
                value={form.personality}
                onChange={(e) => update("personality", e.target.value)}
                placeholder="A line or two in your own words. Sharpens the read on your archetype."
              />
            </div>

            <label className="flex items-center gap-3 text-sm text-foreground cursor-pointer select-none">
              <input
                type="checkbox"
                className="w-4 h-4 accent-primary"
                checked={form.competes}
                onChange={(e) => update("competes", e.target.checked)}
              />
              <span>I compete (or plan to within 6 months)</span>
            </label>

            {save.isError && (
              <div className="text-sm text-destructive font-mono">
                {(save.error as Error).message}
              </div>
            )}

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setStep((s) => Math.max(0, s - 1))}
                className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors"
              >
                ← Back
              </button>
              <Button
                type="submit"
                disabled={save.isPending || !form.name.trim()}
                className="flex-1 h-12 font-mono text-xs uppercase tracking-[0.25em] bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {save.isPending ? "Reading you..." : "Enter the frame"}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
