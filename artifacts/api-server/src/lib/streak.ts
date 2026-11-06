// Pure streak + weekly-recap maths over local calendar dates ("YYYY-MM-DD").
import { addDays } from "./localTime";

export interface StreakInfo {
  /** Consecutive local days with a check-in, ending today (or yesterday while today is still open). */
  current: number;
  /** Longest run in the supplied dates. */
  longest: number;
  checkedInToday: boolean;
}

/**
 * A streak is not broken until a whole day passes with no check-in: if today is
 * not logged yet the run ending yesterday still counts.
 */
export function computeStreak(dates: readonly string[], today: string): StreakInfo {
  const set = new Set(dates.filter((d) => d <= today));
  const checkedInToday = set.has(today);
  let cursor = checkedInToday ? today : addDays(today, -1);
  let current = 0;
  while (set.has(cursor)) {
    current++;
    cursor = addDays(cursor, -1);
  }
  const sorted = [...set].sort();
  let longest = 0;
  let run = 0;
  let prev: string | null = null;
  for (const d of sorted) {
    run = prev && addDays(prev, 1) === d ? run + 1 : 1;
    if (run > longest) longest = run;
    prev = d;
  }
  return { current, longest, checkedInToday };
}

export interface RecapCheckin {
  date: string;
  sleep: number;
  energy: number;
  soreness: number;
  stress: number;
}

export interface RecapSession {
  date: string;
  completed: boolean;
}

export type TrendDirection = "up" | "down" | "steady" | "unknown";

export interface WeeklyRecap {
  /** Inclusive local-date window: the 7 days ending `end`. */
  start: string;
  end: string;
  sessionsPlanned: number;
  sessionsCompleted: number;
  checkins: number;
  avgState: number | null;
  prevAvgState: number | null;
  trend: TrendDirection;
}

const score = (c: RecapCheckin) => (c.sleep + c.energy + c.soreness + c.stress) / 4;
const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);

/** Differences under this many points read as "steady". */
export const TREND_THRESHOLD = 3;

export function trendOf(cur: number | null, prev: number | null): TrendDirection {
  if (cur == null || prev == null) return "unknown";
  if (cur - prev >= TREND_THRESHOLD) return "up";
  if (prev - cur >= TREND_THRESHOLD) return "down";
  return "steady";
}

/** The 7 local days ending `end` vs the 7 before them. */
export function buildWeeklyRecap(
  end: string,
  checkins: readonly RecapCheckin[],
  sessions: readonly RecapSession[],
): WeeklyRecap {
  const start = addDays(end, -6);
  const prevStart = addDays(end, -13);
  const prevEnd = addDays(end, -7);
  const inWeek = checkins.filter((c) => c.date >= start && c.date <= end);
  const inPrev = checkins.filter((c) => c.date >= prevStart && c.date <= prevEnd);
  const sess = sessions.filter((s) => s.date >= start && s.date <= end);
  const avgState = avg(inWeek.map(score));
  const prevAvgState = avg(inPrev.map(score));
  return {
    start,
    end,
    sessionsPlanned: sess.length,
    sessionsCompleted: sess.filter((s) => s.completed).length,
    checkins: inWeek.length,
    avgState,
    prevAvgState,
    trend: trendOf(avgState, prevAvgState),
  };
}
