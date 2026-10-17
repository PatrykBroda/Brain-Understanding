type State = "idle" | "streaming" | "wired" | "heavy" | "clean";

/**
 * Tiny status indicator for the coach. Static by design (v3): no breathing,
 * pulsing or ping, so it never implies live biometric measurement. The label
 * carries the meaning; the dot only repeats the tone.
 */
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
        ? "border-[rgba(229,100,90,0.6)]"
        : state === "heavy"
          ? "border-muted-foreground/40"
          : state === "clean"
            ? "border-primary/40"
            : "border-border";

  const core =
    state === "streaming"
      ? "bg-primary"
      : state === "wired"
        ? "bg-[#E5645A]"
        : state === "heavy"
          ? "bg-muted-foreground/60"
          : state === "clean"
            ? "bg-primary/70"
            : "bg-primary/40";

  return (
    <div className="flex items-center gap-2.5" role="status">
      <div className={`flex h-3.5 w-3.5 items-center justify-center rounded-full border ${ring}`} aria-hidden>
        <div className={`h-1.5 w-1.5 rounded-full ${core} transition-colors duration-200`} />
      </div>
      {label && <span className="text-xs text-muted-foreground">{label}</span>}
    </div>
  );
}
