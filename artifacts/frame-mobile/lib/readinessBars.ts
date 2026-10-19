import { addDaysTo } from "./localDay";
import type { DailyCheckinRow } from "./today";

export const BAR_DAYS = 14;

export function checkinScore(c: Pick<DailyCheckinRow, "sleep" | "energy" | "soreness" | "stress">): number {
  return Math.round((c.sleep + c.energy + c.soreness + c.stress) / 4);
}

/** The last `days` calendar days ending on `today`, each with its check-in or null. */
export function barSlots(checkins: DailyCheckinRow[], today: string, days = BAR_DAYS) {
  const byDate = new Map(checkins.map((c) => [c.checkinDate, c]));
  return Array.from({ length: days }, (_, i) => {
    const date = addDaysTo(today, i - (days - 1));
    return { date, checkin: byDate.get(date) ?? null };
  });
}
