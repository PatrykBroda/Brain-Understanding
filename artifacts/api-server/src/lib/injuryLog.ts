// Pure helpers for the injury / soreness log (no db, no express).
import { z } from "zod/v4";
import { formatLocalDate } from "./localTime";

export const INJURY_AREAS = [
  "head",
  "neck",
  "shoulder",
  "elbow",
  "wrist_hand",
  "ribs",
  "back",
  "hip",
  "groin",
  "knee",
  "shin",
  "ankle_foot",
] as const;
export type InjuryArea = (typeof INJURY_AREAS)[number];

export const SEVERITY_LABEL: Record<number, string> = { 1: "niggle", 2: "sore", 3: "injured" };

export const AREA_LABEL: Record<InjuryArea, string> = {
  head: "head",
  neck: "neck",
  shoulder: "shoulder",
  elbow: "elbow",
  wrist_hand: "wrist/hand",
  ribs: "ribs",
  back: "back",
  hip: "hip",
  groin: "groin",
  knee: "knee",
  shin: "shin",
  ankle_foot: "ankle/foot",
};

export const INJURY_KINDS = ["strain", "sprain", "bruise", "soreness", "other"] as const;
export type InjuryKind = (typeof INJURY_KINDS)[number];
export const INJURY_STATUSES = ["active", "recovered"] as const;
export type InjuryStatus = (typeof INJURY_STATUSES)[number];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
/** A real calendar day in YYYY-MM-DD (rejects 2026-02-31). */
export function isRealDay(s: string): boolean {
  if (!DATE_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}
const dayField = z.string().refine(isRealDay, "date must be YYYY-MM-DD");

// date is optional: omitted = today (what the one-tap home picker sends).
export const injuryInputSchema = z.object({
  area: z.enum(INJURY_AREAS),
  severity: z.coerce.number().int().min(1).max(3),
  note: z.string().trim().max(300).optional().default(""),
  kind: z.enum(INJURY_KINDS).optional().default("other"),
  date: dayField.optional(),
  status: z.enum(INJURY_STATUSES).optional().default("active"),
});
export type InjuryInput = z.infer<typeof injuryInputSchema>;

// Edit: every field optional, at least one required. Area is fixed once logged (delete + re-log to move it).
export const injuryPatchSchema = z
  .object({
    severity: z.coerce.number().int().min(1).max(3).optional(),
    note: z.string().trim().max(300).optional(),
    kind: z.enum(INJURY_KINDS).optional(),
    date: dayField.optional(),
    status: z.enum(INJURY_STATUSES).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "nothing to change");
export type InjuryPatch = z.infer<typeof injuryPatchSchema>;

/** The injury date must not be in the future (one day of slack for timezone skew) or absurdly old. */
export function injuryDateProblem(date: string, today: string): string | null {
  if (dayDiff(date, today) > 1) return "date is in the future";
  if (dayDiff(today, date) > 3650) return "date is too far back";
  return null;
}

export interface InjuryEntry {
  date: string; // YYYY-MM-DD
  area: string;
  severity: number;
  note?: string;
  kind?: string;
  status?: string; // missing = active
  resolvedAt?: string | null; // YYYY-MM-DD
}

const DAY = 86_400_000;
function dayDiff(a: string, b: string): number {
  return Math.round((Date.parse(a) - Date.parse(b)) / DAY);
}

const ACTIVE_WINDOW_DAYS = 90; // an active injury stays in the coach's view this long, labelled with its age
const RECOVERED_WINDOW_DAYS = 14; // a recovery is mentioned for this long after it was marked

const isRecovered = (e: InjuryEntry) => e.status === "recovered";

/** Newest entry per area that is still relevant: active within 90 days, or recovered within the last 14. Worst/most recent first. */
export function activeInjuries(entries: InjuryEntry[], today: string, windowDays = ACTIVE_WINDOW_DAYS): InjuryEntry[] {
  const latest = new Map<string, InjuryEntry>();
  for (const e of entries) {
    if (dayDiff(today, e.date) < 0) continue;
    const cur = latest.get(e.area);
    if (!cur || e.date > cur.date) latest.set(e.area, e);
  }
  const keep: InjuryEntry[] = [];
  for (const e of latest.values()) {
    if (isRecovered(e)) {
      if (dayDiff(today, e.resolvedAt ?? e.date) <= RECOVERED_WINDOW_DAYS) keep.push(e);
    } else if (dayDiff(today, e.date) <= windowDays) {
      keep.push(e);
    }
  }
  return keep.sort(
    (a, b) =>
      Number(isRecovered(a)) - Number(isRecovered(b)) || b.severity - a.severity || (a.date < b.date ? 1 : -1),
  );
}

function areaName(area: string): string {
  return AREA_LABEL[area as InjuryArea] ?? area;
}

function ago(date: string, today: string): string {
  const age = dayDiff(today, date);
  const rel = age <= 0 ? "today" : age === 1 ? "yesterday" : `${age} days ago`;
  return `${formatLocalDate(date)}, ${rel}`;
}

/** Block for the coach / planner context. Every date is stamped with its age so a past entry never reads as today. */
export function buildInjuryBlock(entries: InjuryEntry[], today: string): string {
  const rows = activeInjuries(entries, today);
  if (rows.length === 0) return "";
  const lines = [
    `Injury and soreness the athlete logged in FRAME (self-reported; today is ${formatLocalDate(today)}; newest entry per area):`,
  ];
  for (const e of rows) {
    const note = e.note ? ` — "${e.note}"` : "";
    const kind = e.kind && e.kind !== "other" ? `, ${e.kind}` : "";
    if (isRecovered(e)) {
      lines.push(`- ${areaName(e.area)}: marked RECOVERED ${ago(e.resolvedAt ?? e.date, today)}${note}`);
    } else {
      const stale = dayDiff(today, e.date) > 14 ? " — old entry, still marked active: check it is still true" : "";
      lines.push(
        `- ${areaName(e.area)}: ${SEVERITY_LABEL[e.severity] ?? "logged"}${kind} (logged ${ago(e.date, today)})${note}${stale}`,
      );
    }
  }
  lines.push(
    "Rule: work around active areas when you suggest drills, sparring or load, and say so in a clause. Treat 'injured' as a reason to avoid loading that area and to suggest they get it looked at by a qualified professional. Areas marked recovered can be reintroduced gradually. You are not a medical professional: never diagnose, and do not claim an active area is healed unless a newer entry or the athlete says so.",
  );
  return lines.join("\n");
}
