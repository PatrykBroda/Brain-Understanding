import { and, desc, eq, gte, or } from "drizzle-orm";
import { db, injuryLogsTable } from "@workspace/db";
import { addDays } from "./localTime";
import { buildInjuryBlock, type InjuryEntry } from "./injuryLog";

export type InjuryRowOut = {
  id: number;
  date: string;
  area: string;
  severity: number;
  note: string;
  kind: string;
  status: string;
  resolvedAt: string | null;
};

export function toInjuryOut(r: typeof injuryLogsTable.$inferSelect): InjuryRowOut {
  return {
    id: r.id,
    date: r.logDate,
    area: r.area,
    severity: r.severity,
    note: r.note,
    kind: r.kind,
    status: r.status,
    resolvedAt: r.resolvedAt,
  };
}

/** Rows the coach should see: anything logged in the last `days`, plus every still-active entry however old (it is labelled with its age). */
export async function loadInjuryEntries(fighterId: number, today: string, days = 90): Promise<InjuryEntry[]> {
  const rows = await db
    .select()
    .from(injuryLogsTable)
    .where(
      and(
        eq(injuryLogsTable.fighterId, fighterId),
        or(gte(injuryLogsTable.logDate, addDays(today, -days)), eq(injuryLogsTable.status, "active")),
      ),
    )
    .orderBy(desc(injuryLogsTable.logDate));
  return rows.map((r) => ({
    date: r.logDate,
    area: r.area,
    severity: r.severity,
    note: r.note,
    kind: r.kind,
    status: r.status,
    resolvedAt: r.resolvedAt,
  }));
}

/** Coach / planner block; "" when nothing is logged or the lookup fails (never costs the athlete a reply). */
export async function loadInjuryBlock(fighterId: number, today: string): Promise<string> {
  try {
    return buildInjuryBlock(await loadInjuryEntries(fighterId, today), today);
  } catch {
    return "";
  }
}
