import { useState } from "react";
import { BreathCard, type Breath } from "./breath-card";

// ─── Types ────────────────────────────────────────────────────────────────────

type StateStep    = { type: "state";    content: string };
type BreathStep   = { type: "breath"  } & Omit<Breath, never>;
type GroundingStep= { type: "grounding"; title?: string; prompts: string[] };
type FocusStep    = { type: "focus";   content: string };

export type RegulateStep = StateStep | BreathStep | GroundingStep | FocusStep;
export type RegulateSequenceData = { steps: RegulateStep[] };

const STEP_LABEL: Record<string, string> = {
  state: "Assess",
  breath: "Breathe",
  grounding: "Ground",
  focus: "Focus",
};

// ─── Shared CSS ───────────────────────────────────────────────────────────────

const CSS = `
@keyframes reg-fade { from{opacity:0} to{opacity:1} }
@keyframes reg-up   { from{opacity:0;transform:translateY(14px)} to{opacity:1;transform:translateY(0)} }
@keyframes reg-pulse-left { 0%{border-color:hsl(var(--primary)/0.2)} 55%{border-color:hsl(var(--primary)/0.85)} 100%{border-color:hsl(var(--primary)/0.55)} }
`;

// ─── State step ───────────────────────────────────────────────────────────────

function StateCard({ step, onDone }: { step: StateStep; onDone: () => void }) {
  return (
    <div className="px-4 py-5 space-y-4" style={{ animation: "reg-fade 0.4s ease-out" }}>
      <p className="text-sm text-foreground/85 leading-relaxed whitespace-pre-wrap">{step.content}</p>
      <button
        type="button"
        onClick={onDone}
        className="px-5 py-2 border border-primary/50 font-mono text-[10px] uppercase tracking-[0.25em] text-primary hover:bg-primary/10 transition-colors"
      >
        Continue →
      </button>
    </div>
  );
}

// ─── Breath step (embedded, no outer card wrapper) ────────────────────────────

function BreathStepCard({ step, onDone }: { step: BreathStep; onDone: () => void }) {
  const [breathDone, setBreathDone] = useState(false);
  const { type: _t, ...breathProps } = step as BreathStep & Record<string, unknown>;
  return (
    <div>
      <BreathCard breath={breathProps as Breath} embedded onComplete={() => setBreathDone(true)} />
      {breathDone && (
        <div className="px-4 pb-4" style={{ animation: "reg-fade 0.4s ease-out" }}>
          <button
            type="button"
            onClick={onDone}
            className="px-5 py-2 border border-primary/50 font-mono text-[10px] uppercase tracking-[0.25em] text-primary hover:bg-primary/10 transition-colors"
          >
            Continue →
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Grounding step ───────────────────────────────────────────────────────────

const DEFAULT_PROMPTS = [
  "Name 5 things you can see right now",
  "Feel 4 surfaces your body is touching",
  "Identify 3 sounds in the room",
  "Notice 2 smells around you",
  "Name 1 thing you can taste",
];

function GroundingCard({ step, onDone }: { step: GroundingStep; onDone: () => void }) {
  const prompts = step.prompts?.length ? step.prompts : DEFAULT_PROMPTS;
  const [idx, setIdx]     = useState(0);
  const [animKey, setAnimKey] = useState(0);
  const [done, setDone]   = useState(false);

  function advance() {
    if (idx + 1 >= prompts.length) {
      setDone(true);
    } else {
      setIdx((i) => i + 1);
      setAnimKey((k) => k + 1);
    }
  }

  const remaining = prompts.length - idx;

  return (
    <div className="flex flex-col items-center px-4 py-6">
      {step.title && (
        <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-5">
          {step.title}
        </div>
      )}

      {done ? (
        <div className="flex flex-col items-center gap-4" style={{ animation: "reg-fade 0.4s ease-out" }}>
          <div className="font-mono text-3xl tracking-[0.25em] text-primary/70">Anchored</div>
          <button
            type="button"
            onClick={onDone}
            className="mt-2 px-5 py-2 border border-primary/50 font-mono text-[10px] uppercase tracking-[0.25em] text-primary hover:bg-primary/10 transition-colors"
          >
            Continue →
          </button>
        </div>
      ) : (
        <div key={animKey} className="flex flex-col items-center gap-3 w-full" style={{ animation: "reg-up 0.35s ease-out" }}>
          {/* Big count */}
          <div
            className="font-mono leading-none select-none tabular-nums"
            style={{ fontSize: "6.5rem", color: "hsl(var(--primary) / 0.22)" }}
          >
            {remaining}
          </div>

          {/* Prompt */}
          <p className="text-center text-sm text-foreground/80 leading-relaxed max-w-xs">
            {prompts[idx]}
          </p>

          {/* Prompt dots */}
          <div className="flex items-center gap-1.5 mt-1">
            {prompts.map((_, i) => (
              <div
                key={i}
                className={`rounded-full transition-all duration-300 ${
                  i === idx
                    ? "w-4 h-1.5 bg-primary"
                    : i < idx
                    ? "w-1.5 h-1.5 bg-primary/40"
                    : "w-1.5 h-1.5 bg-border/50"
                }`}
              />
            ))}
          </div>

          <button
            type="button"
            onClick={advance}
            className="mt-3 px-5 py-2 border border-primary/50 font-mono text-[10px] uppercase tracking-[0.25em] text-primary hover:bg-primary/10 transition-colors"
          >
            Got it →
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Focus step ───────────────────────────────────────────────────────────────

function FocusCard({ step, onDone }: { step: FocusStep; onDone: () => void }) {
  return (
    <div className="px-4 py-5 space-y-4" style={{ animation: "reg-fade 0.5s ease-out" }}>
      <div
        className="border-l-2 border-primary/55 pl-4 py-0.5"
        style={{ animation: "reg-pulse-left 1.8s ease-in-out 1" }}
      >
        <p className="text-sm text-foreground/85 leading-relaxed whitespace-pre-wrap">
          {step.content}
        </p>
      </div>
      <button
        type="button"
        onClick={onDone}
        className="px-5 py-2 border border-primary/50 font-mono text-[10px] uppercase tracking-[0.25em] text-primary hover:bg-primary/10 transition-colors"
      >
        Done
      </button>
    </div>
  );
}

// ─── Main sequence ────────────────────────────────────────────────────────────

export function RegulateSequence({ data }: { data: RegulateSequenceData }) {
  const steps = data.steps ?? [];
  const [stepIdx, setStepIdx] = useState(0);
  const [finished, setFinished] = useState(false);

  if (steps.length === 0) return null;

  function advance() {
    if (stepIdx + 1 >= steps.length) {
      setFinished(true);
    } else {
      setStepIdx((i) => i + 1);
    }
  }

  const step  = steps[stepIdx]!;
  const label = STEP_LABEL[step.type] ?? step.type;

  return (
    <div className="my-4 border border-primary/30 bg-primary/5">
      <style>{CSS}</style>

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-primary/20 bg-primary/10">
        <div className="font-mono text-[10px] uppercase tracking-widest text-primary/80">
          Regulate
        </div>
        {!finished && (
          <div className="font-mono text-[10px] text-primary/60 uppercase tracking-widest">
            {label} · {stepIdx + 1}/{steps.length}
          </div>
        )}
      </div>

      {/* Step content */}
      {finished ? (
        <div
          className="px-4 py-8 flex flex-col items-center gap-2"
          style={{ animation: "reg-fade 0.5s ease-out" }}
        >
          <div className="font-mono text-[10px] uppercase tracking-widest text-primary/50">
            Sequence complete
          </div>
        </div>
      ) : (
        <div key={stepIdx}>
          {step.type === "state"    && <StateCard    step={step} onDone={advance} />}
          {step.type === "breath"   && <BreathStepCard step={step} onDone={advance} />}
          {step.type === "grounding"&& <GroundingCard step={step} onDone={advance} />}
          {step.type === "focus"    && <FocusCard    step={step} onDone={advance} />}
        </div>
      )}

      {/* Sequence-level progress dots */}
      {!finished && steps.length > 1 && (
        <div className="flex justify-center gap-1.5 pb-3 pt-1">
          {steps.map((_, i) => (
            <div
              key={i}
              className={`rounded-full transition-all duration-300 ${
                i === stepIdx
                  ? "w-5 h-1 bg-primary/70"
                  : i < stepIdx
                  ? "w-2 h-1 bg-primary/35"
                  : "w-2 h-1 bg-border/40"
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
