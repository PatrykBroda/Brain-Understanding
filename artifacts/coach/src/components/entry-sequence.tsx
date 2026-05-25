import { useEffect, useRef, useState } from "react";
import { CosmicOrb } from "@/components/cosmic-orb";
import type { CalibrationQuestion } from "@/lib/api";

interface EntrySequenceProps {
  fighterName: string | null;
  question: CalibrationQuestion | null;
  questionLoading: boolean;
  briefingPending: boolean;
  isAnswering: boolean;
  onAnswer: (key: string, answer: string) => void;
  onDismiss: () => void;
}

const MIN_DISPLAY_MS = 1100;

export function EntrySequence({
  fighterName,
  question,
  questionLoading,
  briefingPending,
  isAnswering,
  onAnswer,
  onDismiss,
}: EntrySequenceProps) {
  const [closing, setClosing] = useState(false);
  const mountedAtRef = useRef(performance.now());

  const close = () => {
    if (closing) return;
    const elapsed = performance.now() - mountedAtRef.current;
    const wait = Math.max(0, MIN_DISPLAY_MS - elapsed);
    setClosing(true);
    window.setTimeout(onDismiss, 260 + wait);
  };

  // If there is no question to answer (bank exhausted) and the briefing has
  // landed, auto-dismiss after the minimum dwell so the user lands in chat.
  useEffect(() => {
    if (questionLoading) return;
    if (question) return;
    if (briefingPending) return;
    const elapsed = performance.now() - mountedAtRef.current;
    const wait = Math.max(MIN_DISPLAY_MS - elapsed, 350);
    const id = window.setTimeout(close, wait);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questionLoading, question, briefingPending]);

  const handleAnswer = (option: string) => {
    if (!question || isAnswering) return;
    onAnswer(question.key, option);
    close();
  };

  return (
    <div
      className={`fixed inset-0 z-50 bg-background text-foreground flex flex-col px-6 transition-opacity duration-300 ${
        closing ? "opacity-0 pointer-events-none" : "opacity-100"
      }`}
      style={{
        paddingTop: "max(2rem, env(safe-area-inset-top))",
        paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))",
      }}
    >
      <header className="flex-none text-center animate-in fade-in slide-in-from-top-1 duration-500">
        <div className="font-mono font-bold text-sm tracking-[0.4em] text-foreground/95">
          SYNOCHI
        </div>
        <div className="font-mono text-[9px] tracking-[0.5em] text-muted-foreground mt-1.5">
          ENTRY SEQUENCE
        </div>
        {fighterName && (
          <div className="font-mono text-[10px] tracking-[0.35em] text-primary/85 mt-3 uppercase">
            {fighterName}
          </div>
        )}
      </header>

      <div className="flex-1 grid place-items-center min-h-0 py-4">
        <div className="w-full max-w-[260px] aspect-square animate-in fade-in zoom-in-95 duration-700">
          <CosmicOrb state="warming" className="w-full h-full" />
        </div>
      </div>

      <div className="flex-none w-full max-w-md mx-auto min-h-[200px] flex flex-col items-center justify-start">
        {question ? (
          <div className="w-full animate-in fade-in slide-in-from-bottom-2 duration-500">
            <div className="font-mono text-[10px] tracking-[0.45em] text-primary/90 uppercase text-center mb-3">
              Calibration
            </div>
            <div className="text-center text-[15px] leading-snug text-foreground/95 mb-5 max-w-sm mx-auto">
              {question.prompt}
            </div>
            <div className="flex flex-wrap gap-2 justify-center">
              {question.options.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  disabled={isAnswering || closing}
                  onClick={() => handleAnswer(opt)}
                  className="px-3 py-2 border border-border/70 bg-secondary/40 hover:border-primary/70 hover:bg-secondary/70 text-[13px] font-mono text-foreground/90 transition-colors disabled:opacity-40"
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4 pt-4 animate-in fade-in duration-500">
            <div className="font-mono text-[10px] tracking-[0.45em] text-muted-foreground uppercase">
              {briefingPending ? "Loading briefing" : questionLoading ? "Calibrating frame" : "Frame ready"}
            </div>
            <div className="flex gap-1.5">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="w-1 h-1 rounded-full bg-foreground/40 animate-pulse"
                  style={{ animationDelay: `${i * 180}ms` }}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="flex-none flex justify-center pt-4">
        <button
          type="button"
          onClick={close}
          disabled={closing}
          className="font-mono text-[10px] tracking-[0.4em] text-muted-foreground hover:text-foreground transition-colors uppercase disabled:opacity-40"
        >
          {question ? "Skip · enter frame" : "Enter frame"}
        </button>
      </div>
    </div>
  );
}
