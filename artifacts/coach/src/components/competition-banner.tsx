import { Link } from "wouter";
import { useActiveCompetition } from "@/hooks/use-competition";
import type { PressureTier } from "@/lib/api";

// Visual pressure scales with the camp phase: calm amber far out, hard red in
// fight week. The closer the event, the stronger the contrast and the pulse.
const TIER_STYLE: Record<
  PressureTier,
  { fg: string; border: string; glow: string; pulse: boolean }
> = {
  base: {
    fg: "hsl(39 49% 36%)",
    border: "hsla(39,49%,36%,0.30)",
    glow: "none",
    pulse: false,
  },
  build: {
    fg: "hsl(28 70% 58%)",
    border: "hsla(28,70%,55%,0.40)",
    glow: "none",
    pulse: false,
  },
  sharpen: {
    fg: "hsl(14 78% 56%)",
    border: "hsla(14,78%,52%,0.50)",
    glow: "0 0 24px -6px hsla(14,80%,50%,0.45)",
    pulse: false,
  },
  peak: {
    fg: "hsl(2 80% 58%)",
    border: "hsla(2,80%,52%,0.65)",
    glow: "0 0 28px -4px hsla(2,82%,50%,0.55)",
    pulse: true,
  },
  fight_week: {
    fg: "hsl(0 85% 60%)",
    border: "hsla(0,85%,54%,0.85)",
    glow: "0 0 34px -2px hsla(0,88%,52%,0.7)",
    pulse: true,
  },
};

export function CompetitionBanner() {
  const { data } = useActiveCompetition();
  const pressure = data?.pressure ?? null;
  if (!pressure) return null;

  const style = TIER_STYLE[pressure.tier];
  const { competition: c, daysToEvent, daysToWeighIn } = pressure;

  const dayWord = daysToEvent === 1 ? "DAY" : "DAYS";

  return (
    <Link
      href="/competition"
      aria-label="Competition mode details"
      className="block outline-none focus-visible:ring-1 focus-visible:ring-[hsl(var(--red-accent))]"
    >
      <div
        className={`relative overflow-hidden border-y px-4 py-2.5 ${style.pulse ? "comp-pulse" : ""}`}
        style={{
          background:
            "linear-gradient(180deg, rgba(0,0,0,0.4) 0%, rgba(0,0,0,0.0) 100%)",
          borderColor: style.border,
          boxShadow: style.glow,
        }}
      >
        <div className="flex items-center justify-between gap-3 max-w-md mx-auto">
          <div className="min-w-0">
            <div
              className="font-mono text-[9px] uppercase tracking-[0.4em] opacity-80"
              style={{ color: style.fg }}
            >
              {pressure.tierLabel}
            </div>
            <div className="font-sans uppercase tracking-[0.06em] text-foreground/90 text-[12px] truncate mt-0.5">
              {c.eventName}
            </div>
          </div>
          <div className="flex items-baseline gap-2 flex-none">
            {daysToWeighIn !== null && daysToWeighIn <= daysToEvent && (
              <div className="text-right">
                <span
                  className="font-sans font-light tabular-nums text-[15px]"
                  style={{ color: style.fg }}
                >
                  {daysToWeighIn}
                </span>
                <span className="font-mono text-[8px] uppercase tracking-[0.3em] text-foreground/55 ml-1">
                  weigh-in
                </span>
              </div>
            )}
            <div className="text-right">
              <span
                className="font-sans font-light tabular-nums text-[22px] leading-none"
                style={{ color: style.fg }}
              >
                {daysToEvent}
              </span>
              <span className="font-mono text-[8px] uppercase tracking-[0.3em] text-foreground/55 ml-1">
                {dayWord}
              </span>
            </div>
          </div>
        </div>
      </div>
      <style>{`
        @keyframes comp-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.82; }
        }
        .comp-pulse { animation: comp-pulse 2.4s ease-in-out infinite; }
      `}</style>
    </Link>
  );
}
