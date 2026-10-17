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

  const reduceMotion =
    typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  const inner = (
    <>
      {breath.title && (
        <h3 className="display-heading px-5 pt-1 pb-1 !text-[1.1875rem]">{breath.title}</h3>
      )}
      {breath.purpose && (
        <p className="px-5 pb-1 text-[0.9375rem] text-muted-foreground leading-[1.6]">{breath.purpose}</p>
      )}

      <div className="flex flex-col items-center px-4 py-6">
        <div className="relative flex items-center justify-center w-44 h-44">
          <div
            className="absolute w-40 h-40 rounded-full border border-[#B9A477]/50 bg-[#191C20]"
            style={{
              transform: `scale(${reduceMotion ? 1 : scale})`,
              transition: reduceMotion ? "none" : `transform ${transitionSec}s ease-in-out`,
            }}
          />
          <div className="relative text-center">
            <div className="label !text-[#B9A477]">
              {done ? "Done" : running ? current.label : "Ready"}
            </div>
            {!done && (
              <div className="numeral numeral-l !text-[3rem] mt-1">
                {running ? remaining : current.seconds}
              </div>
            )}
          </div>
        </div>

        <div className="label mt-4 tnum">
          {done ? `${totalRounds} rounds complete` : `Round ${round} of ${totalRounds}`}
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
          {!running && !done && (
            <button type="button" onClick={() => dispatch({ type: "BEGIN" })} className="btn-bronze !min-h-[44px] !px-6">
              {phaseIdx > 0 ? "Resume" : "Begin"}
            </button>
          )}
          {running && (
            <button type="button" onClick={() => dispatch({ type: "PAUSE" })} className="btn-glass !min-h-[44px] !px-6">
              Pause
            </button>
          )}
          {!running && (phaseIdx > 0 || round > 1 || done) && (
            <button type="button" onClick={() => dispatch({ type: "RESET" })} className="btn-glass !min-h-[44px] !px-6">
              Reset
            </button>
          )}
        </div>

        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {phases.map((p, i) => (
            <span
              key={p.key + i}
              className={`chip tnum ${running && i === phaseIdx ? "chip-gold" : ""}`}
            >
              {p.label} {p.seconds}s
            </span>
          ))}
        </div>
      </div>

      {breath.note && (
        <p className="px-5 pb-5 text-[0.875rem] text-muted-foreground leading-[1.6] border-t border-white/[0.06] pt-3">
          {breath.note}
        </p>
      )}
    </>
  );

  if (embedded) return inner;

  return (
    <section className="glass my-5 overflow-hidden" aria-label="Breathing exercise">
      <header className="px-5 pt-4 pb-3">
        <span className="chip chip-gold">Breathwork</span>
      </header>
      {inner}
    </section>
  );
}
