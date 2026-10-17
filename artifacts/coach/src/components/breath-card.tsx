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
        <div className="display-heading px-5 pt-5 pb-1 !text-[1.5rem]">
          {breath.title}
        </div>
      )}
      {breath.purpose && (
        <div className="px-5 pb-1 text-[0.85rem] text-muted-foreground leading-relaxed">
          {breath.purpose}
        </div>
      )}

      <div className="flex flex-col items-center px-4 py-6">
        <div className="relative flex items-center justify-center w-44 h-44">
          <div
            className="absolute w-40 h-40 rounded-full border border-[hsl(var(--primary-light))]/60"
            style={{
              background:
                "radial-gradient(circle at 35% 30%, rgba(230,210,163,0.28), rgba(138,106,47,0.16) 55%, rgba(138,106,47,0.04) 100%)",
              boxShadow: "0 0 48px rgba(199,161,90,0.30), inset 0 1px 0 rgba(255,244,224,0.25)",
              transform: `scale(${scale})`,
              transition: `transform ${transitionSec}s ease-in-out`,
            }}
          />
          <div className="relative text-center">
            <div className="eyebrow eyebrow-gold">
              {done ? "Done" : running ? current.label : "Ready"}
            </div>
            {!done && (
              <div className="numeral numeral-l !text-[3rem] mt-1">
                {running ? remaining : current.seconds}
              </div>
            )}
          </div>
        </div>

        <div className="eyebrow mt-4">
          {done ? `${totalRounds} rounds complete` : `Round ${round} / ${totalRounds}`}
        </div>

        <div className="mt-4 flex items-center gap-3">
          {!running && !done && (
            <button
              type="button"
              onClick={() => dispatch({ type: "BEGIN" })}
              className="btn-bronze !min-h-[44px] !px-6"
            >
              Begin
            </button>
          )}
          {running && (
            <button
              type="button"
              onClick={() => dispatch({ type: "PAUSE" })}
              className="btn-glass !min-h-[44px] !px-6"
            >
              Pause
            </button>
          )}
          {!running && (phaseIdx > 0 || round > 1 || done) && (
            <button
              type="button"
              onClick={() => dispatch({ type: "RESET" })}
              className="btn-glass !min-h-[44px] !px-6"
            >
              Reset
            </button>
          )}
          {!running && phaseIdx > 0 && !done && (
            <button
              type="button"
              onClick={() => dispatch({ type: "BEGIN" })}
              className="btn-bronze !min-h-[44px] !px-6"
            >
              Resume
            </button>
          )}
        </div>

        <div className="mt-4 flex flex-wrap justify-center gap-x-3 gap-y-1">
          {phases.map((p, i) => (
            <span
              key={p.key + i}
              className={`chip !px-2.5 !py-1 !text-[10px] ${
                running && i === phaseIdx
                  ? "!border-primary/50 !bg-primary/20 !text-[hsl(var(--primary-pale))]"
                  : "!text-muted-foreground"
              }`}
            >
              {p.label} {p.seconds}s
            </span>
          ))}
        </div>
      </div>

      {breath.note && (
        <div className="px-5 pb-5 text-[0.8rem] text-muted-foreground leading-relaxed border-t border-white/10 pt-3">
          {breath.note}
        </div>
      )}
    </>
  );

  if (embedded) return inner;

  return (
    <div className="glass glass-gold my-4 overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-white/10">
        <div className="eyebrow eyebrow-gold">Regulate</div>
        <div className="eyebrow">Breath</div>
      </div>
      {inner}
    </div>
  );
}
