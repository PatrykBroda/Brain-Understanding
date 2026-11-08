// Pure logic for check-in streaks and the Sunday weekly recap. No React Native imports so it is
// unit-testable; lib/weeklyRecap.ts wires it to AsyncStorage and expo-notifications.

export const RECAP_ID = "frame-weekly-recap";
/** expo-notifications weekly trigger weekday: 1 = Sunday. */
export const RECAP_WEEKDAY = 1;
export const RECAP_HOUR = 18;
export const RECAP_MINUTE = 0;

export interface StreakInfo {
  current: number;
  longest: number;
  checkedInToday: boolean;
}

export type TrendDirection = "up" | "down" | "steady" | "unknown";

export interface WeeklyRecapData {
  start: string;
  end: string;
  sessionsPlanned: number;
  sessionsCompleted: number;
  checkins: number;
  avgState: number | null;
  prevAvgState: number | null;
  trend: TrendDirection;
}

export interface RecapPrefs {
  /** Opt-out: on by default, switched off in Profile. */
  enabled: boolean;
  /** Week-end date ("YYYY-MM-DD") whose in-app card the athlete dismissed. */
  dismissedFor: string | null;
}

export const DEFAULT_RECAP_PREFS: RecapPrefs = { enabled: true, dismissedFor: null };

const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

export function parseRecapPrefs(raw: string | null | undefined): RecapPrefs {
  if (!raw) return { ...DEFAULT_RECAP_PREFS };
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    return { enabled: o.enabled !== false, dismissedFor: isDate(o.dismissedFor) ? o.dismissedFor : null };
  } catch {
    return { ...DEFAULT_RECAP_PREFS };
  }
}

/** 0 = Sunday … 6 = Saturday for a "YYYY-MM-DD" calendar date (timezone-free). */
export function dayOfWeek(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

/** The recap card is up on Sunday (its day) and Monday (a missed Sunday), until dismissed. */
export function shouldShowRecapCard(prefs: RecapPrefs, today: string): boolean {
  if (!prefs.enabled) return false;
  const dow = dayOfWeek(today);
  if (dow !== 0 && dow !== 1) return false;
  return prefs.dismissedFor !== today && prefs.dismissedFor !== weekKey(today);
}

/** Key for a card dismissal: the Sunday that ends the recap week. */
export function weekKey(today: string): string {
  const dow = dayOfWeek(today);
  if (dow === 0) return today;
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}

export const RECAP_NOTIFICATION = {
  title: "Your FRAME weekly recap",
  body: "Your week is in: sessions, how your state moved and one thing to focus on. Tap to see it.",
} as const;

export function isRecapTap(data: unknown): boolean {
  return !!data && typeof data === "object" && (data as { route?: unknown }).route === "recap";
}

/** "3-day streak" / "Start a streak: check in today". */
export function streakLabel(s: StreakInfo | null | undefined): string | null {
  if (!s) return null;
  if (s.current <= 0) return s.longest > 0 ? "Start a new streak: check in today" : "Check in today to start a streak";
  const days = `${s.current}-day streak`;
  return s.checkedInToday ? days : `${days}: check in today to keep it`;
}

export function trendText(r: WeeklyRecapData): string {
  if (r.avgState == null) return "No check-ins this week, so no state trend yet.";
  switch (r.trend) {
    case "up":
      return `State averaged ${r.avgState}, up from ${r.prevAvgState} last week.`;
    case "down":
      return `State averaged ${r.avgState}, down from ${r.prevAvgState} last week.`;
    case "steady":
      return `State held steady around ${r.avgState}.`;
    default:
      return `State averaged ${r.avgState} (no earlier week to compare).`;
  }
}

export function sessionsText(r: WeeklyRecapData): string {
  if (r.sessionsPlanned === 0) return "No sessions were scheduled this week.";
  const n = r.sessionsCompleted;
  return `${n} of ${r.sessionsPlanned} session${r.sessionsPlanned === 1 ? "" : "s"} completed.`;
}

/** Lines for the in-app card. `focus` is the athlete's current Today's Focus title, if any. */
export function recapLines(r: WeeklyRecapData, focus: string | null): string[] {
  const lines = [sessionsText(r), trendText(r)];
  if (focus && focus.trim()) lines.push(`Focus for next week: ${focus.trim()}`);
  return lines;
}
