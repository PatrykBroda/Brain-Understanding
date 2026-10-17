import { Link } from "wouter";
import { useActiveCompetition } from "@/hooks/use-competition";
import type { PressureTier } from "@/lib/api";

// Pressure reads from the tier label (always text) and one accent colour:
// gold while there is time, red text only in the final stretch. No glow, no pulse.
const TIER_FG: Record<PressureTier, string> = {
  base: "#B9A477",
  build: "#B9A477",
  sharpen: "#D4C7A3",
  peak: "#E5645A",
  fight_week: "#E5645A",
};

export function CompetitionBanner() {
  const { data } = useActiveCompetition();
  const pressure = data?.pressure ?? null;
  if (!pressure) return null;

  const fg = TIER_FG[pressure.tier];
  const hot = pressure.tier === "peak" || pressure.tier === "fight_week";
  const { competition: c, daysToEvent, daysToWeighIn } = pressure;
  const dayWord = daysToEvent === 1 ? "day" : "days";

  return (
    <Link
      href="/competition"
      aria-label="Competition mode details"
      className="block outline-none focus-visible:ring-2 focus-visible:ring-[#B9A477] rounded-[18px]"
    >
      <div
        className="glass px-4 py-3"
        style={hot ? { borderColor: "rgba(229,100,90,0.3)" } : undefined}
      >
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="label" style={{ color: fg }}>
              {pressure.tierLabel}
            </div>
            <div className="mt-0.5 truncate text-[1.0625rem] font-semibold leading-tight text-[#F4F4F1]">
              {c.eventName}
            </div>
          </div>
          <div className="flex flex-none items-baseline gap-4">
            {daysToWeighIn !== null && daysToWeighIn <= daysToEvent && (
              <div className="text-right">
                <span className="numeral numeral-m !text-[1.375rem]">{daysToWeighIn}</span>
                <span className="label ml-1.5">weigh-in</span>
              </div>
            )}
            <div className="text-right">
              <span className="numeral numeral-m !text-[1.75rem]" style={{ color: fg }}>
                {daysToEvent}
              </span>
              <span className="label ml-1.5">{dayWord}</span>
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}
