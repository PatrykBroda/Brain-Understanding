// "Today" on the athlete's own device clock. The server decides the authoritative
// local date from the X-Timezone this app sends; this is only used to key queries and
// to refresh them the moment the athlete's day rolls over.

export function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

const pad = (n: number) => String(n).padStart(2, "0");

/** "YYYY-MM-DD" on the device's wall clock. */
export function localDateString(d: Date = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Milliseconds until the device's next local midnight (at least 1s, so a timer never spins). */
export function msUntilNextLocalMidnight(d: Date = new Date()): number {
  const next = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 0, 0, 0, 0);
  return Math.max(1000, next.getTime() - d.getTime());
}

/** "Sat 17 Oct" for a "YYYY-MM-DD" string, independent of any timezone. */
export function formatDay(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return date;
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}

/** Whole days from `from` to `to` ("YYYY-MM-DD" both). */
export function daysBetweenDates(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** "YYYY-MM-DD" plus `n` calendar days (timezone-free). */
export function addDaysTo(date: string, n: number): string {
  const t = Date.parse(`${date}T00:00:00Z`) + n * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}
