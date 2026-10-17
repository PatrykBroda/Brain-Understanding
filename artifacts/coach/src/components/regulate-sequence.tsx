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
@media (prefers-reduced-motion: reduce){ [style*="reg-"]{animation:none !important} }
`;

// ─── State step ───────────────────────────────────────────────────────────────

function StateCard({ step, onDone }: { step: StateStep; onDone: () => void }) {
  return (
    <div className="px-5 py-5 space-y-4" style={{ animation: "reg-fade 0.4s ease-out" }}>
      <p className="text-[0.9375rem] text-foreground/90 leading-[1.6] whitespace-pre-wrap">{step.content}</p>
      <button
        type="button"
        onClick={onDone}
        className="btn-bronze !min-h-[44px] !px-6"
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
            className="btn-bronze !min-h-[44px] !px-6"
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
        <div className="label mb-5">{step.title}</div>
      )}

      {done ? (
        <div className="flex flex-col items-center gap-4" style={{ animation: "reg-fade 0.4s ease-out" }}>
          <div className="font-display text-2xl text-[#D4C7A3]">Anchored</div>
          <button
            type="button"
            onClick={onDone}
            className="btn-bronze mt-2 !min-h-[44px] !px-6"
          >
            Continue →
          </button>
        </div>
      ) : (
        <div key={animKey} className="flex flex-col items-center gap-3 w-full" style={{ animation: "reg-up 0.35s ease-out" }}>
          {/* Big count */}
          <div
            className="numeral leading-none select-none"
            style={{ fontSize: "4rem", color: "#B9A477" }}
          >
            {remaining}
          </div>

          {/* Prompt */}
          <p className="text-center text-[0.9375rem] text-foreground/90 leading-[1.6] max-w-xs">
            {prompts[idx]}
          </p>

          {/* Prompt dots */}
          <div className="flex items-center gap-1.5 mt-1">
            {prompts.map((_, i) => (
              <div
                key={i}
                className={`rounded-full transition-all duration-300 ${
                  i === idx
                    ? "w-4 h-1.5 bg-[#B9A477]"
                    : i < idx
                    ? "w-1.5 h-1.5 bg-[#B9A477]/40"
                    : "w-1.5 h-1.5 bg-white/15"
                }`}
              />
            ))}
          </div>

          <button
            type="button"
            onClick={advance}
            className="btn-bronze mt-3 !min-h-[44px] !px-6"
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
    <div className="px-5 py-5 space-y-4" style={{ animation: "reg-fade 0.5s ease-out" }}>
      <div
        className="border-l-2 border-[#B9A477]/60 pl-4 py-0.5"
      >
        <p className="text-[0.9375rem] text-foreground/90 leading-[1.6] whitespace-pre-wrap">
          {step.content}
        </p>
      </div>
      <button
        type="button"
        onClick={onDone}
        className="btn-bronze !min-h-[44px] !px-6"
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
    <section className="glass my-5 overflow-hidden" aria-label="Regulation sequence">
      <style>{CSS}</style>

      {/* Header */}
      <header className="flex items-center justify-between gap-3 px-5 pt-4 pb-3 border-b border-white/[0.06]">
        <span className="chip chip-gold">Regulate</span>
        {!finished && (
          <div className="label tnum">
            {label} · step {stepIdx + 1} of {steps.length}
          </div>
        )}
      </header>

      {/* Step content */}
      {finished ? (
        <div
          className="px-4 py-8 flex flex-col items-center gap-2"
          style={{ animation: "reg-fade 0.5s ease-out" }}
        >
          <div className="label !text-[#B9A477]">Sequence complete</div>
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
                  ? "w-5 h-1 bg-[#B9A477]"
                  : i < stepIdx
                  ? "w-2 h-1 bg-[#B9A477]/40"
                  : "w-2 h-1 bg-white/15"
              }`}
            />
          ))}
        </div>
      )}
    </section>
  );
}
