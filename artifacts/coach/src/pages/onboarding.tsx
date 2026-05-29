import { useState } from "react";
import { useSaveFighter } from "@/hooks/use-fighter";
import { Button } from "@/components/ui/button";
import type { FighterInput } from "@/lib/api";

const ARTS = ["BJJ", "BJJ + Striking", "MMA", "Wrestling", "Judo", "Other grappling"];
const LEVELS = ["White", "Blue", "Purple", "Brown", "Black", "No belt / other"];
const FREQUENCIES = ["1-2x / week", "3-4x / week", "5-6x / week", "Daily / pro"];

const FIELD_LABEL = "block font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-2";
const INPUT_CLASS =
  "w-full bg-secondary/40 border border-border/70 text-foreground text-sm px-3 py-2.5 focus:outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/40 placeholder:text-muted-foreground/60";

export default function OnboardingPage() {
  const save = useSaveFighter();
  const [form, setForm] = useState<FighterInput>({
    name: "",
    age: 28,
    art: "BJJ",
    level: "Blue",
    trainingFrequency: "3-4x / week",
    goals: "",
    weaknesses: "",
    competes: false,
    personality: "",
  });

  const update = <K extends keyof FighterInput>(k: K, v: FighterInput[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || save.isPending) return;
    save.mutate(form);
  };

  return (
    <div className="min-h-[100dvh] bg-background text-foreground flex justify-center px-4 py-12 md:py-20">
      <div className="w-full max-w-xl">
        <div className="mb-10 space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 bg-primary" />
            <h1 className="font-mono font-bold text-sm tracking-[0.3em] uppercase text-foreground/90">
              Synochi
            </h1>
          </div>
          <h2 className="text-2xl md:text-3xl text-foreground font-light leading-tight">
            Initialise athlete model.
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed max-w-md">
            This is not a profile — it is the seed for how the system coaches you. Be honest about
            level and weakness. The model sharpens with every session.
          </p>
        </div>

        <form onSubmit={submit} className="space-y-6">
          <div>
            <label className={FIELD_LABEL}>Name / Callsign</label>
            <input
              className={INPUT_CLASS}
              value={form.name}
              onChange={(e) => update("name", e.target.value)}
              placeholder="What you go by on the mat"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={FIELD_LABEL}>Age</label>
              <input
                type="number"
                className={INPUT_CLASS}
                value={form.age}
                min={10}
                max={99}
                onChange={(e) => update("age", parseInt(e.target.value || "0", 10))}
                required
              />
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
              <label className={FIELD_LABEL}>Primary Art</label>
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
            <label className={FIELD_LABEL}>
              Personality — who are you on and off the mat
            </label>
            <textarea
              className={`${INPUT_CLASS} min-h-[80px] resize-y`}
              value={form.personality}
              onChange={(e) => update("personality", e.target.value)}
              placeholder="A few honest lines. Calm or chaotic, patient or aggressive, methodical or instinctive. This sets your spirit animal."
            />
            <p className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground/70 mt-1.5">
              The system reads this to assign your spirit animal.
            </p>
          </div>

          <div>
            <label className={FIELD_LABEL}>Goals — what does winning look like in 6 months</label>
            <textarea
              className={`${INPUT_CLASS} min-h-[80px] resize-y`}
              value={form.goals}
              onChange={(e) => update("goals", e.target.value)}
              placeholder="e.g. compete at IBJJF blue belt, stop gassing in round 3, build a real top game"
            />
          </div>

          <div>
            <label className={FIELD_LABEL}>Weaknesses — what's leaking right now</label>
            <textarea
              className={`${INPUT_CLASS} min-h-[80px] resize-y`}
              value={form.weaknesses}
              onChange={(e) => update("weaknesses", e.target.value)}
              placeholder="e.g. fragment under top pressure, no takedowns, hesitate to commit to submissions"
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

          <Button
            type="submit"
            disabled={save.isPending || !form.name.trim()}
            className="w-full h-12 font-mono text-xs uppercase tracking-[0.25em] bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {save.isPending ? "Initialising..." : "Enter the system"}
          </Button>
        </form>
      </div>
    </div>
  );
}
