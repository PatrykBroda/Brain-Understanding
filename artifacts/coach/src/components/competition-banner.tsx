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
    fg: "hsl(39 50% 56%)",
    border: "hsla(39,50%,56%,0.30)",
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
      className="block rounded-[1.5rem] outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--red-accent))]"
    >
      <div
        className={`glass relative overflow-hidden px-5 py-3.5 ${style.pulse ? "comp-pulse" : ""}`}
        style={{
          borderColor: style.border,
          boxShadow: `0 18px 40px -18px rgba(0,0,0,0.85), inset 0 1px 0 rgba(255,255,255,0.09)${style.glow !== "none" ? ", " + style.glow : ""}`,
        }}
      >
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="eyebrow" style={{ color: style.fg }}>
              {pressure.tierLabel}
            </div>
            <div className="mt-1 truncate font-display text-[1rem] leading-tight text-[#F4F4F1]">
              {c.eventName}
            </div>
          </div>
          <div className="flex flex-none items-baseline gap-4">
            {daysToWeighIn !== null && daysToWeighIn <= daysToEvent && (
              <div className="text-right">
                <span className="numeral numeral-m !text-[1.5rem]" style={{ color: style.fg }}>
                  {daysToWeighIn}
                </span>
                <span className="eyebrow ml-1.5 !text-xs">weigh-in</span>
              </div>
            )}
            <div className="text-right">
              <span className="numeral numeral-m !text-[2.2rem]" style={{ color: style.fg }}>
                {daysToEvent}
              </span>
              <span className="eyebrow ml-1.5 !text-xs">{dayWord}</span>
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
        @media (prefers-reduced-motion: reduce) { .comp-pulse { animation: none; } }
      `}</style>
    </Link>
  );
}
