// Pure helpers for the injury / soreness log (no React / network).

export const INJURY_AREAS = [
  { key: "head", label: "Head" },
  { key: "neck", label: "Neck" },
  { key: "shoulder", label: "Shoulder" },
  { key: "elbow", label: "Elbow" },
  { key: "wrist_hand", label: "Wrist / hand" },
  { key: "ribs", label: "Ribs" },
  { key: "back", label: "Back" },
  { key: "hip", label: "Hip" },
  { key: "groin", label: "Groin" },
  { key: "knee", label: "Knee" },
  { key: "shin", label: "Shin" },
  { key: "ankle_foot", label: "Ankle / foot" },
] as const;

export type InjurySeverity = 1 | 2 | 3;

export const SEVERITIES: { value: InjurySeverity; label: string }[] = [
  { value: 1, label: "Niggle" },
  { value: 2, label: "Sore" },
  { value: 3, label: "Injured" },
];

export type InjuryRow = { id: number; date: string; area: string; severity: number; note: string };

export const areaLabel = (key: string): string => INJURY_AREAS.find((a) => a.key === key)?.label ?? key;
export const severityLabel = (v: number): string => SEVERITIES.find((s) => s.value === v)?.label ?? "Logged";

/** Today's entries keyed by area. */
export function todayByArea(rows: InjuryRow[], today: string): Record<string, InjuryRow> {
  const out: Record<string, InjuryRow> = {};
  for (const r of rows) if (r.date === today) out[r.area] = r;
  return out;
}

/**
 * One tap cycles an area: off -> niggle -> sore -> injured -> off.
 * Returns the severity to save, or null meaning "remove today's entry".
 */
export function nextSeverity(current: number | undefined): InjurySeverity | null {
  if (!current) return 1;
  if (current >= 3) return null;
  return (current + 1) as InjurySeverity;
}

export type DayGroup = { date: string; rows: InjuryRow[] };

/** History grouped by day, newest day first; within a day the worst first. */
export function groupByDay(rows: InjuryRow[]): DayGroup[] {
  const map = new Map<string, InjuryRow[]>();
  for (const r of rows) map.set(r.date, [...(map.get(r.date) ?? []), r]);
  return [...map.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([date, rs]) => ({ date, rows: rs.sort((a, b) => b.severity - a.severity) }));
}

/** Short summary, e.g. "Knee: sore, Ribs: niggle". Empty when nothing is logged today. */
export function todaySummary(rows: InjuryRow[], today: string): string {
  return Object.values(todayByArea(rows, today))
    .sort((a, b) => b.severity - a.severity)
    .map((r) => `${areaLabel(r.area)}: ${severityLabel(r.severity).toLowerCase()}`)
    .join(", ");
}
