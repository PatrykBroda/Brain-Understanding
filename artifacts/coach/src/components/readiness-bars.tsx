import { useMemo } from "react";
import { formatDay } from "@/lib/local-day";
import { barSlots, checkinScore } from "@/lib/readiness-bars";
import type { DailyCheckinRow } from "@/lib/today";

/**
 * Readiness history as bars, one per day. Each bar with a check-in is a button: select it
 * to open that day's check-in below. Bars are white (selected: gold edge); a day with no
 * check-in is an empty slot, never a guessed number.
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
      <ul className="flex items-end gap-1" aria-label="Readiness check-ins, last 14 days">
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
                aria-label={checkin ? `${formatDay(date)}, readiness ${score}. Open this check-in` : `${formatDay(date)}, no check-in`}
                className="group flex w-full flex-col items-center gap-1.5 rounded-[8px] py-1 outline-none focus-visible:ring-2 focus-visible:ring-[var(--f-gold)] disabled:cursor-default"
              >
                <span className="flex h-24 w-full items-end justify-center">
                  {score != null ? (
                    <span
                      className={`w-full max-w-[18px] rounded-[4px] bg-[#F4F4F1] transition-opacity group-hover:opacity-100 ${
                        on ? "opacity-100 ring-[1.5px] ring-[var(--f-gold)]" : "opacity-90"
                      }`}
                      style={{ height: `${Math.max(6, score)}%` }}
                    />
                  ) : (
                    <span className="h-0.5 w-full max-w-[18px] rounded-sm bg-white/[0.12]" />
                  )}
                </span>
                <span className={`tnum text-[11px] ${on ? "font-semibold text-foreground" : "text-[var(--f-text-3)]"}`}>
                  {Number(date.slice(8))}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {open && (
        <div className="glass mt-3 px-4 py-4" role="region" aria-label={`Check-in for ${formatDay(open.checkinDate)}`}>
          <p className="text-[1.0625rem] font-semibold text-foreground">
            {formatDay(open.checkinDate)}
            {open.checkinDate === today ? " · today" : ""}
          </p>
          <p className="mt-0.5 text-[0.8125rem] text-[var(--f-text-2)]">
            {open.checkinDate === today ? "Logged today." : "A past check-in. It is not today's state."}
          </p>
          <dl className="mt-3 grid grid-cols-3 gap-y-3">
            <Metric label="Readiness" value={checkinScore(open)} strong />
            <Metric label="Sleep" value={open.sleep} />
            <Metric label="Energy" value={open.energy} />
            <Metric label="Soreness" value={100 - open.soreness} />
            <Metric label="Stress" value={100 - open.stress} />
            {open.restingHr != null && <Metric label="Resting HR" value={open.restingHr} unit="bpm" />}
          </dl>
        </div>
      )}
    </div>
  );
}

function Metric({ label, value, unit, strong }: { label: string; value: number; unit?: string; strong?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-[var(--f-text-3)]">{label}</dt>
      <dd className={`tnum text-lg font-semibold ${strong ? "text-foreground" : "text-[var(--f-text-2)]"}`}>
        {value}
        {unit && <span className="ml-1 text-xs font-normal text-[var(--f-text-3)]">{unit}</span>}
      </dd>
    </div>
  );
}
