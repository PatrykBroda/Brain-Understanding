import { BELT_PSYCHOLOGY, BELT_ORDER, beltKeyOf, beltMeaning, type BeltKey } from "@workspace/archetypes";

type BeltColor = { body: string; bar: string };

const COLORS: Record<BeltKey, BeltColor> = {
  white: { body: "#e7e2d2", bar: "#0d0d0d" },
  blue: { body: "#1f5fc4", bar: "#0a0a0a" },
  purple: { body: "#6b32c9", bar: "#0a0a0a" },
  brown: { body: "#5a3a22", bar: "#0a0a0a" },
  black: { body: "#0c0c0c", bar: "#b3261e" },
};

export function beltKey(level: string): BeltKey | null {
  return beltKeyOf(level);
}

// A BJJ-style belt rendered in rank colour with the rank bar near the tip.
// FRAME reinterprets the ladder psychologically: rank is not a technique
// catalogue, it is how the nervous system behaves under load. Below the belt we
// surface that psychological state + a quiet rank ladder for progression.
export function Belt({ level, showMeaning = true }: { level: string; showMeaning?: boolean }) {
  const key = beltKey(level);
  const color = key ? COLORS[key] : null;
  const meaning = key ? beltMeaning(key) : null;

  if (!key || !color || !meaning) {
    return (
      <div>
        <div className="h-7 w-full bg-secondary/60 border border-border/60" />
        <div className="font-mono text-[9px] uppercase tracking-[0.3em] text-muted-foreground mt-2">
          Unranked / other
        </div>
      </div>
    );
  }

  const idx = BELT_ORDER.indexOf(key);

  return (
    <div>
      <div
        className="relative h-7 w-full overflow-hidden border border-black/40"
        style={{ background: color.body }}
        aria-label={meaning.label}
      >
        <div className="absolute top-0 right-8 h-full w-14" style={{ background: color.bar }} />
      </div>

      <div className="flex items-center justify-between mt-2">
        <div className="font-mono text-[9px] uppercase tracking-[0.3em] text-muted-foreground">
          {meaning.label}
        </div>
        <div className="flex items-center gap-1.5">
          {BELT_ORDER.map((b, i) => (
            <span
              key={b}
              className="h-1.5 w-4"
              style={{
                background: i <= idx ? COLORS[b].body : "transparent",
                border: i <= idx ? "none" : "1px solid hsl(var(--border))",
                opacity: i <= idx ? 1 : 0.6,
              }}
              title={`${BELT_PSYCHOLOGY[i].label} — ${BELT_PSYCHOLOGY[i].state}`}
            />
          ))}
        </div>
      </div>

      {showMeaning && (
        <div className="mt-3 border-l border-primary/40 pl-3">
          <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-foreground/90">
            {meaning.state}
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed mt-1">{meaning.meaning}</p>
        </div>
      )}
    </div>
  );
}
