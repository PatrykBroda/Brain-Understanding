import { and, desc, eq, gte } from "drizzle-orm";
import { db, injuryLogsTable } from "@workspace/db";
import { addDays } from "./localTime";
import { buildInjuryBlock, type InjuryEntry } from "./injuryLog";

export async function loadInjuryEntries(fighterId: number, today: string, days = 14): Promise<InjuryEntry[]> {
  const rows = await db
    .select()
    .from(injuryLogsTable)
    .where(and(eq(injuryLogsTable.fighterId, fighterId), gte(injuryLogsTable.logDate, addDays(today, -days))))
    .orderBy(desc(injuryLogsTable.logDate));
  return rows.map((r) => ({ date: r.logDate, area: r.area, severity: r.severity, note: r.note }));
}

/** Coach / planner block; "" when nothing is logged or the lookup fails (never costs the athlete a reply). */
export async function loadInjuryBlock(fighterId: number, today: string): Promise<string> {
  try {
    return buildInjuryBlock(await loadInjuryEntries(fighterId, today), today);
  } catch {
    return "";
  }
}
