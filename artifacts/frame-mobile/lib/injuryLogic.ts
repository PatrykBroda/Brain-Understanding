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

export type InjuryKind = "strain" | "sprain" | "bruise" | "soreness" | "other";

export const KINDS: { value: InjuryKind; label: string }[] = [
  { value: "strain", label: "Strain" },
  { value: "sprain", label: "Sprain" },
  { value: "bruise", label: "Bruise" },
  { value: "soreness", label: "Soreness" },
  { value: "other", label: "Other" },
];

export type InjuryStatus = "active" | "recovered";

export type InjuryRow = {
  id: number;
  date: string;
  area: string;
  severity: number;
  note: string;
  kind?: string;
  status?: string;
  resolvedAt?: string | null;
};

export const kindLabel = (v: string | undefined): string => KINDS.find((k) => k.value === v)?.label ?? "Other";
export const isRecovered = (r: Pick<InjuryRow, "status">): boolean => r.status === "recovered";
export const isRealDate = (d: string): boolean => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
  if (!m) return false;
  const dt = new Date(Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!));
  return dt.getUTCFullYear() === +m[1]! && dt.getUTCMonth() === +m[2]! - 1 && dt.getUTCDate() === +m[3]!;
};

/** Why a typed date cannot be saved, or null when fine. Mirrors the server check so the form fails before the network. */
export function dateProblem(d: string, today: string | undefined): string | null {
  if (!isRealDate(d)) return "Use a real date as YYYY-MM-DD.";
  if (today && d > today) return "The date cannot be in the future.";
  return null;
}

/** Active entries first (worst first, then newest), then recovered (newest first). */
export function splitByStatus(rows: InjuryRow[]): { active: InjuryRow[]; recovered: InjuryRow[] } {
  const active = rows.filter((r) => !isRecovered(r)).sort((a, b) => b.severity - a.severity || (a.date < b.date ? 1 : -1));
  const recovered = rows.filter(isRecovered).sort((a, b) => (a.date < b.date ? 1 : -1));
  return { active, recovered };
}

export const areaLabel = (key: string): string => INJURY_AREAS.find((a) => a.key === key)?.label ?? key;
export const severityLabel = (v: number): string => SEVERITIES.find((s) => s.value === v)?.label ?? "Logged";

/** Today's still-active entries keyed by area (a recovered one is not a chip). */
export function todayByArea(rows: InjuryRow[], today: string): Record<string, InjuryRow> {
  const out: Record<string, InjuryRow> = {};
  for (const r of rows) if (r.date === today && !isRecovered(r)) out[r.area] = r;
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
