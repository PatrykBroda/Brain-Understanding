type State = "idle" | "streaming" | "wired" | "heavy" | "clean";

export function NervousSystemOrb({
  state = "idle",
  label,
}: {
  state?: State;
  label?: string;
}) {
  const ring =
    state === "streaming"
      ? "border-primary/80"
      : state === "wired"
        ? "border-destructive/60"
        : state === "heavy"
          ? "border-muted-foreground/40"
          : state === "clean"
            ? "border-primary/40"
            : "border-border";

  const core =
    state === "streaming"
      ? "bg-primary"
      : state === "wired"
        ? "bg-destructive/80"
        : state === "heavy"
          ? "bg-muted-foreground/50"
          : state === "clean"
            ? "bg-primary/70"
            : "bg-primary/40";

  // Idle/clean/heavy states get a slow ambient breath so the indicator never
  // feels fully static. Streaming/wired use the more urgent pulse.
  const coreAnim =
    state === "streaming" || state === "wired"
      ? "animate-pulse"
      : "nso-breath";

  return (
    <div className="flex items-center gap-2.5">
      <div className={`relative w-3 h-3 border ${ring} flex items-center justify-center`}>
        <div className={`w-1.5 h-1.5 ${core} ${coreAnim} transition-colors`} />
        {state === "streaming" && (
          <div className="absolute inset-0 border border-primary/30 animate-ping" />
        )}
      </div>
      {label && (
        <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          {label}
        </span>
      )}
      <style>{`
        @keyframes nso-breath {
          0%, 100% { opacity: 0.45; transform: scale(0.9); }
          50%      { opacity: 1;    transform: scale(1.05); }
        }
        .nso-breath { animation: nso-breath 3.4s ease-in-out infinite; }
      `}</style>
    </div>
  );
}
