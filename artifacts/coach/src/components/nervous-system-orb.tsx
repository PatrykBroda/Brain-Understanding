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
      ? "bg-primary animate-pulse"
      : state === "wired"
        ? "bg-destructive/80 animate-pulse"
        : state === "heavy"
          ? "bg-muted-foreground/50"
          : state === "clean"
            ? "bg-primary/70"
            : "bg-primary/40";

  return (
    <div className="flex items-center gap-2.5">
      <div className={`relative w-3 h-3 border ${ring} flex items-center justify-center`}>
        <div className={`w-1.5 h-1.5 ${core} transition-colors`} />
        {state === "streaming" && (
          <div className="absolute inset-0 border border-primary/30 animate-ping" />
        )}
      </div>
      {label && (
        <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          {label}
        </span>
      )}
    </div>
  );
}
