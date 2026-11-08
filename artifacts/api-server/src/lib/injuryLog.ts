// Pure helpers for the injury / soreness log (no db, no express).
import { z } from "zod/v4";

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

export const injuryInputSchema = z.object({
  area: z.enum(INJURY_AREAS),
  severity: z.coerce.number().int().min(1).max(3),
  note: z.string().trim().max(300).optional().default(""),
});
export type InjuryInput = z.infer<typeof injuryInputSchema>;

export interface InjuryEntry {
  date: string; // YYYY-MM-DD
  area: string;
  severity: number;
  note?: string;
}

const DAY = 86_400_000;
const dayDiff = (a: string, b: string) => Math.round((Date.parse(a) - Date.parse(b)) / DAY);

/** Latest entry per area within `windowDays` of today, worst/most recent first. */
export function activeInjuries(entries: InjuryEntry[], today: string, windowDays = 14): InjuryEntry[] {
  const latest = new Map<string, InjuryEntry>();
  for (const e of entries) {
    const age = dayDiff(today, e.date);
    if (age < 0 || age > windowDays) continue;
    const cur = latest.get(e.area);
    if (!cur || e.date > cur.date) latest.set(e.area, e);
  }
  return [...latest.values()].sort((a, b) => b.severity - a.severity || (a.date < b.date ? 1 : -1));
}

function areaName(area: string): string {
  return AREA_LABEL[area as InjuryArea] ?? area;
}

/** Block for the coach / planner context. Empty string when nothing is logged. */
export function buildInjuryBlock(entries: InjuryEntry[], today: string): string {
  const active = activeInjuries(entries, today);
  if (active.length === 0) return "";
  const lines = ["Injury and soreness the athlete logged in FRAME (self-reported, last 14 days, newest entry per area):"];
  for (const e of active) {
    const age = dayDiff(today, e.date);
    const when = age === 0 ? "today" : age === 1 ? "yesterday" : `${age} days ago`;
    const note = e.note ? ` — "${e.note}"` : "";
    lines.push(`- ${areaName(e.area)}: ${SEVERITY_LABEL[e.severity] ?? "logged"} (${when})${note}`);
  }
  lines.push(
    "Rule: work around logged areas when you suggest drills, sparring or load, and say so in a clause. Treat 'injured' as a reason to avoid loading that area and to suggest they get it looked at by a qualified professional. You are not a medical professional: never diagnose, and do not claim a logged area is healed unless a newer entry or the athlete says so.",
  );
  return lines.join("\n");
}
