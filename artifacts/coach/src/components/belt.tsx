type BeltStyle = { body: string; bar: string; label: string };

const BELTS: Record<string, BeltStyle> = {
  white: { body: "#e7e2d2", bar: "#0d0d0d", label: "White belt" },
  blue: { body: "#1f5fc4", bar: "#0a0a0a", label: "Blue belt" },
  purple: { body: "#6b32c9", bar: "#0a0a0a", label: "Purple belt" },
  brown: { body: "#5a3a22", bar: "#0a0a0a", label: "Brown belt" },
  black: { body: "#0c0c0c", bar: "#b3261e", label: "Black belt" },
};

const ORDER = ["white", "blue", "purple", "brown", "black"];

export function beltKey(level: string): string | null {
  const l = level.toLowerCase();
  if (l.startsWith("white")) return "white";
  if (l.startsWith("blue")) return "blue";
  if (l.startsWith("purple")) return "purple";
  if (l.startsWith("brown")) return "brown";
  if (l.startsWith("black")) return "black";
  return null;
}

// A BJJ-style belt: the belt body in rank colour with the black (or red, at
// black belt) rank bar near the tip. Below it, a quiet rank ladder shows
// progression so the athlete can see where they are and what is next.
export function Belt({ level }: { level: string }) {
  const key = beltKey(level);
  const style = key ? BELTS[key] : null;

  if (!style || !key) {
    return (
      <div>
        <div className="h-6 w-full bg-secondary/60 border border-border/60" />
        <div className="font-mono text-[9px] uppercase tracking-[0.3em] text-muted-foreground mt-2">
          Unranked / other
        </div>
      </div>
    );
  }

  const idx = ORDER.indexOf(key);

  return (
    <div>
      <div
        className="relative h-7 w-full overflow-hidden border border-black/40"
        style={{ background: style.body }}
        aria-label={style.label}
      >
        {/* rank bar near the tip */}
        <div
          className="absolute top-0 right-8 h-full w-14"
          style={{ background: style.bar }}
        />
      </div>
      <div className="flex items-center justify-between mt-2">
        <div className="font-mono text-[9px] uppercase tracking-[0.3em] text-muted-foreground">
          {style.label}
        </div>
        <div className="flex items-center gap-1.5">
          {ORDER.map((b, i) => (
            <span
              key={b}
              className="h-1.5 w-4"
              style={{
                background: i <= idx ? BELTS[b].body : "transparent",
                border: i <= idx ? "none" : "1px solid hsl(var(--border))",
                opacity: i <= idx ? 1 : 0.6,
              }}
              title={BELTS[b].label}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
