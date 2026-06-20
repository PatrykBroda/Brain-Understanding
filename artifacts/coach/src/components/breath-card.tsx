import { useEffect, useReducer, useRef } from "react";
import {
  buildPhases,
  clampSec,
  makeBreathReducer,
  makeInitialBreathState,
  type Breath,
} from "../lib/breathReducer";

export type { Breath };

export function BreathCard({
  breath,
  embedded,
  onComplete,
}: {
  breath: Breath;
  embedded?: boolean;
  onComplete?: () => void;
}) {
  const phases = buildPhases(breath);
  const totalRounds = Math.max(1, Math.min(20, clampSec(breath.rounds, 5) || 5));

  const reducer = makeBreathReducer(phases, totalRounds);
  const [state, dispatch] = useReducer(reducer, makeInitialBreathState(phases));
  const { running, phaseIdx, remaining, round, done } = state;

  const timer = useRef<number | null>(null);

  const clearTimer = () => {
    if (timer.current != null) {
      window.clearInterval(timer.current);
      timer.current = null;
    }
  };

  useEffect(() => () => clearTimer(), []);

  useEffect(() => {
    if (!running) {
      clearTimer();
      return;
    }
    timer.current = window.setInterval(() => {
      dispatch({ type: "TICK" });
    }, 1000);
    return clearTimer;
  }, [running]);

  useEffect(() => {
    if (done) onComplete?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done]);

  if (phases.length === 0) return null;

  const current = phases[Math.min(phaseIdx, phases.length - 1)]!;
  const scale = running || done ? current.scale : 0.62;
  const transitionSec = running ? current.seconds : 0.4;

  const inner = (
    <>
      {breath.title && (
        <div className="px-4 pt-4 pb-1 font-mono text-sm text-foreground tracking-wide uppercase">
          {breath.title}
        </div>
      )}
      {breath.purpose && (
        <div className="px-4 pb-1 text-[0.85rem] text-muted-foreground leading-relaxed">
          {breath.purpose}
        </div>
      )}

      <div className="flex flex-col items-center px-4 py-6">
        <div className="relative flex items-center justify-center w-44 h-44">
          <div
            className="absolute w-40 h-40 border-2 border-primary/70 bg-primary/10"
            style={{
              clipPath:
                "polygon(30% 0%, 70% 0%, 100% 30%, 100% 70%, 70% 100%, 30% 100%, 0% 70%, 0% 30%)",
              transform: `scale(${scale})`,
              transition: `transform ${transitionSec}s ease-in-out`,
            }}
          />
          <div className="relative text-center">
            <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-primary/80">
              {done ? "Done" : running ? current.label : "Ready"}
            </div>
            {!done && (
              <div className="font-mono text-3xl text-foreground mt-1 tabular-nums">
                {running ? remaining : current.seconds}
              </div>
            )}
          </div>
        </div>

        <div className="mt-4 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          {done ? `${totalRounds} rounds complete` : `Round ${round} / ${totalRounds}`}
        </div>

        <div className="mt-4 flex items-center gap-3">
          {!running && !done && (
            <button
              type="button"
              onClick={() => dispatch({ type: "BEGIN" })}
              className="px-5 py-2 border border-primary/50 font-mono text-[10px] uppercase tracking-[0.25em] text-primary hover:bg-primary/10 transition-colors"
            >
              Begin
            </button>
          )}
          {running && (
            <button
              type="button"
              onClick={() => dispatch({ type: "PAUSE" })}
              className="px-5 py-2 border border-border/60 font-mono text-[10px] uppercase tracking-[0.25em] text-foreground/80 hover:border-primary/40 transition-colors"
            >
              Pause
            </button>
          )}
          {!running && (phaseIdx > 0 || round > 1 || done) && (
            <button
              type="button"
              onClick={() => dispatch({ type: "RESET" })}
              className="px-5 py-2 border border-border/60 font-mono text-[10px] uppercase tracking-[0.25em] text-foreground/80 hover:border-primary/40 transition-colors"
            >
              Reset
            </button>
          )}
          {!running && phaseIdx > 0 && !done && (
            <button
              type="button"
              onClick={() => dispatch({ type: "BEGIN" })}
              className="px-5 py-2 border border-primary/50 font-mono text-[10px] uppercase tracking-[0.25em] text-primary hover:bg-primary/10 transition-colors"
            >
              Resume
            </button>
          )}
        </div>

        <div className="mt-4 flex flex-wrap justify-center gap-x-3 gap-y-1">
          {phases.map((p, i) => (
            <span
              key={p.key + i}
              className={`font-mono text-[9px] uppercase tracking-widest ${
                running && i === phaseIdx ? "text-primary" : "text-muted-foreground/70"
              }`}
            >
              {p.label} {p.seconds}s
            </span>
          ))}
        </div>
      </div>

      {breath.note && (
        <div className="px-4 pb-4 text-[0.8rem] text-muted-foreground/90 leading-relaxed border-t border-primary/15 pt-3">
          {breath.note}
        </div>
      )}
    </>
  );

  if (embedded) return inner;

  return (
    <div className="my-4 border border-primary/30 bg-primary/5">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-primary/20 bg-primary/10">
        <div className="font-mono text-[10px] uppercase tracking-widest text-primary/80">
          Regulate
        </div>
        <div className="font-mono text-[10px] text-primary/60">BREATH</div>
      </div>
      {inner}
    </div>
  );
}
