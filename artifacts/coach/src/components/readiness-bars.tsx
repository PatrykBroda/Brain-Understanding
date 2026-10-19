import { useMemo } from "react";
import { formatDay } from "@/lib/local-day";
import { barSlots, checkinScore } from "@/lib/readiness-bars";
import type { DailyCheckinRow } from "@/lib/today";

/**
 * Readiness history as bars, one per day (last 14). Each bar with a check-in is a button:
 * select it to open that day's check-in below. A day with no check-in is an empty slot,
 * never a guessed number. Drawn in the dashboard's original idiom (mono labels, hairline
 * panel, flat bars).
 */
export function ReadinessBars({
  checkins,
  today,
  selected,
  onSelect,
}: {
  checkins: DailyCheckinRow[];
  today: string;
  selected: string | null;
  onSelect: (date: string | null) => void;
}) {
  const slots = useMemo(() => barSlots(checkins, today), [checkins, today]);
  const open = selected ? slots.find((s) => s.date === selected)?.checkin ?? null : null;
  return (
    <div>
      <ul className="flex items-end gap-[3px]" aria-label="Readiness check-ins, last 14 days">
        {slots.map(({ date, checkin }) => {
          const score = checkin ? checkinScore(checkin) : null;
          const on = selected === date;
          return (
            <li key={date} className="flex-1">
              <button
                type="button"
                disabled={!checkin}
                onClick={() => onSelect(on ? null : date)}
                aria-pressed={on}
                aria-label={
                  checkin
                    ? `${formatDay(date)}, readiness ${score}. Open this check-in`
                    : `${formatDay(date)}, no check-in`
                }
                className="group flex w-full flex-col items-center gap-1.5 py-1 outline-none focus-visible:ring-1 focus-visible:ring-primary/60 disabled:cursor-default"
              >
                <span className="flex h-14 w-full items-end justify-center">
                  {score != null ? (
                    <span
                      className={`w-full rounded-t-[1px] transition-colors ${
                        on ? "bg-primary" : date === today ? "bg-primary/80" : "bg-foreground/25 group-hover:bg-foreground/45"
                      }`}
                      style={{ height: `${Math.max(6, score)}%` }}
                    />
                  ) : (
                    <span className="h-px w-full bg-white/[0.12]" />
                  )}
                </span>
                <span
                  className={`font-mono text-[8px] tabular-nums tracking-[0.1em] ${
                    on ? "text-primary" : "text-foreground/30"
                  }`}
                >
                  {Number(date.slice(8))}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {open && (
        <div
          className="mt-3 border border-white/[0.07] bg-white/[0.015] px-4 py-4"
          role="region"
          aria-label={`Check-in for ${formatDay(open.checkinDate)}`}
        >
          <p className="font-mono text-[10px] uppercase tracking-[0.35em] text-foreground/70">
            {formatDay(open.checkinDate)}
            {open.checkinDate === today ? " · today" : ""}
          </p>
          <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.25em] text-foreground/35 leading-relaxed">
            {open.checkinDate === today ? "Logged today." : "A past check-in. It is not today's state."}
          </p>
          <dl className="mt-4 grid grid-cols-3 gap-y-3">
            <Metric label="Readiness" value={checkinScore(open)} strong />
            <Metric label="Sleep" value={open.sleep} />
            <Metric label="Energy" value={open.energy} />
            <Metric label="Soreness" value={100 - open.soreness} />
            <Metric label="Stress" value={100 - open.stress} />
            {open.restingHr != null && <Metric label="Cardio HR" value={open.restingHr} unit="bpm" />}
          </dl>
        </div>
      )}
    </div>
  );
}

function Metric({ label, value, unit, strong }: { label: string; value: number; unit?: string; strong?: boolean }) {
  return (
    <div>
      <dt className="font-mono text-[9px] uppercase tracking-[0.3em] text-foreground/45">{label}</dt>
      <dd className={`font-sans font-light text-[15px] tabular-nums ${strong ? "text-primary/90" : "text-foreground/90"}`}>
        {value}
        {unit && <span className="ml-1 font-mono text-[9px] text-foreground/40">{unit}</span>}
      </dd>
    </div>
  );
}
