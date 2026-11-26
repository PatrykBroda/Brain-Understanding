import { and, count, eq } from "drizzle-orm";
import { attendanceLogsTable, milestoneRulesTable, milestoneStatesTable, type db } from "@workspace/db";
import { recordHistory, type DbLike } from "./history";

export const DEFAULT_MILESTONES: { threshold: number; label: string }[] = [
  { threshold: 1, label: "First session" },
  { threshold: 10, label: "10 sessions" },
  { threshold: 25, label: "25 sessions" },
  { threshold: 50, label: "50 sessions" },
];

/** Active (parent-logged) session count for a child. Wellbeing is never part of this. */
export async function activeSessionCount(conn: DbLike, childId: string): Promise<number> {
  const [row] = await conn
    .select({ n: count() })
    .from(attendanceLogsTable)
    .where(and(eq(attendanceLogsTable.childId, childId), eq(attendanceLogsTable.status, "active")));
  return row?.n ?? 0;
}

/**
 * Derived milestones always reflect the CURRENT active log count. Call inside the same transaction
 * as any log change (create / undo / remove / cancel). Crossing up reaches (or re-reaches with a new
 * date); dropping below withdraws, and every transition is written to change history.
 */
export async function recalcMilestones(
  tx: DbLike,
  childId: string,
  gymId: string,
  actor: { userId: string | null; role: "parent" | "coach" | "admin" | "system" },
  now: Date = new Date(),
): Promise<{ count: number; reached: string[]; withdrawn: string[] }> {
  const total = await activeSessionCount(tx, childId);
  const rules = await tx
    .select()
    .from(milestoneRulesTable)
    .where(and(eq(milestoneRulesTable.gymId, gymId), eq(milestoneRulesTable.kind, "session_count"), eq(milestoneRulesTable.active, true)));
  const states = await tx.select().from(milestoneStatesTable).where(eq(milestoneStatesTable.childId, childId));
  const byRule = new Map(states.map((s) => [s.ruleId, s]));
  const reached: string[] = [];
  const withdrawn: string[] = [];
  for (const rule of rules) {
    const st = byRule.get(rule.id);
    if (total >= rule.threshold) {
      if (!st) {
        await tx.insert(milestoneStatesTable).values({ childId, ruleId: rule.id, status: "reached", reachedAt: now });
      } else if (st.status === "withdrawn") {
        await tx
          .update(milestoneStatesTable)
          .set({ status: "reached", reachedAt: now, withdrawnAt: null })
          .where(and(eq(milestoneStatesTable.childId, childId), eq(milestoneStatesTable.ruleId, rule.id)));
      } else continue;
      reached.push(rule.label);
      await recordHistory(tx, {
        gymId,
        childId,
        actorUserId: actor.userId,
        actorRole: actor.role,
        entity: "milestone",
        entityId: rule.id,
        action: "reached",
        after: { label: rule.label, count: total },
      });
    } else if (st && st.status === "reached") {
      await tx
        .update(milestoneStatesTable)
        .set({ status: "withdrawn", withdrawnAt: now })
        .where(and(eq(milestoneStatesTable.childId, childId), eq(milestoneStatesTable.ruleId, rule.id)));
      withdrawn.push(rule.label);
      await recordHistory(tx, {
        gymId,
        childId,
        actorUserId: actor.userId,
        actorRole: actor.role,
        entity: "milestone",
        entityId: rule.id,
        action: "withdrawn",
        before: { label: rule.label },
        after: { count: total },
      });
    }
  }
  return { count: total, reached, withdrawn };
}

export type { db };
