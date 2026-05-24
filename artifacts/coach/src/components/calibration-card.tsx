import { useState } from "react";
import { X } from "lucide-react";
import type { CalibrationQuestion } from "@/lib/api";

export function CalibrationCard({
  question,
  onAnswer,
  onDismiss,
  pending,
}: {
  question: CalibrationQuestion;
  onAnswer: (answer: string) => void;
  onDismiss: () => void;
  pending?: boolean;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  return (
    <div className="border border-primary/30 bg-secondary/40 backdrop-blur">
      <div className="flex items-center justify-between px-4 py-2 border-b border-primary/20">
        <div className="font-mono text-[10px] uppercase tracking-widest text-primary/80">
          Calibration
        </div>
        <button
          onClick={onDismiss}
          className="text-muted-foreground hover:text-foreground transition-colors"
          aria-label="dismiss"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="p-4 space-y-3">
        <div className="text-sm text-foreground font-medium">{question.prompt}</div>
        <div className="flex flex-wrap gap-2">
          {question.options.map((opt) => (
            <button
              key={opt}
              disabled={pending}
              onClick={() => {
                setSelected(opt);
                onAnswer(opt);
              }}
              className={`text-[0.78rem] font-mono px-3 py-1.5 border transition-colors ${
                selected === opt
                  ? "border-primary bg-primary/20 text-primary"
                  : "border-border/70 bg-background/40 text-muted-foreground hover:border-primary/50 hover:text-foreground"
              } disabled:opacity-50`}
            >
              {opt}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
