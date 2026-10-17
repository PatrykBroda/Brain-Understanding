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
    <div className="glass overflow-hidden">
      <div className="flex items-center justify-between pl-4 pr-1 pt-1">
        <div className="label">Quick question</div>
        <button
          onClick={onDismiss}
          className="grid h-11 w-11 place-items-center rounded-[12px] text-muted-foreground transition-colors hover:text-foreground"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" strokeWidth={1.75} />
        </button>
      </div>
      <div className="space-y-3 px-4 pb-4">
        <div className="text-base font-medium leading-snug text-foreground">{question.prompt}</div>
        <div className="flex flex-wrap gap-2">
          {question.options.map((opt) => (
            <button
              key={opt}
              disabled={pending}
              aria-pressed={selected === opt}
              onClick={() => {
                setSelected(opt);
                onAnswer(opt);
              }}
              className={`min-h-[44px] rounded-full border px-4 text-sm transition-colors duration-200 disabled:opacity-40 ${
                selected === opt
                  ? "border-[rgba(185,164,119,0.5)] bg-[var(--f-raised)] text-foreground"
                  : "border-[var(--f-border)] bg-[var(--f-surface)] text-[var(--f-text-2)] hover:bg-[var(--f-raised)] hover:text-foreground"
              }`}
            >
              {opt}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
