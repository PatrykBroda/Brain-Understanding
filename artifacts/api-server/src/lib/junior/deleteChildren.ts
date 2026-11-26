import { and, eq, inArray, sql } from "drizzle-orm";
import { changeHistoryTable, childGymMembershipsTable, childrenTable, guardianLinksTable, juniorAccountsTable, usersTable } from "@workspace/db";
import { recordHistory, type Tx } from "./history";

/**
 * Hard delete of child profiles. Everything keyed to the child cascades (logs, wellbeing, observations,
 * milestones, links). change_history is append-only, so the purge is explicit and scoped: the guard
 * trigger is lifted for this transaction only (SET LOCAL), the child's own history rows are removed, and a
 * content-free row is left on each gym's history so admins can see that a deletion happened.
 */
export async function deleteChildren(tx: Tx, childIds: string[], actorUserId: string | null): Promise<void> {
  if (!childIds.length) return;
  const gyms = await tx
    .select({ gymId: childGymMembershipsTable.gymId })
    .from(childGymMembershipsTable)
    .where(inArray(childGymMembershipsTable.childId, childIds));
  // A junior's login goes with the record (the link is ON DELETE SET NULL, so find the users first).
  const juniorUsers = await tx.select({ userId: juniorAccountsTable.userId }).from(juniorAccountsTable).where(inArray(juniorAccountsTable.childId, childIds));
  await tx.execute(sql`SET LOCAL frame.allow_history_purge = 'on'`);
  await tx.delete(changeHistoryTable).where(inArray(changeHistoryTable.childId, childIds));
  await tx.delete(childrenTable).where(inArray(childrenTable.id, childIds));
  await tx.execute(sql`SET LOCAL frame.allow_history_purge = 'off'`);
  const loginIds = juniorUsers.map((j) => j.userId).filter((x): x is string => !!x);
  if (loginIds.length) await tx.delete(usersTable).where(and(inArray(usersTable.id, loginIds), eq(usersTable.isJunior, true)));
  for (const g of new Set(gyms.map((x) => x.gymId))) {
    await recordHistory(tx, { gymId: g, actorUserId, actorRole: "parent", entity: "child", action: "deleted" });
  }
}

/** Children for which `userId` is the ONLY active guardian (these go when the account goes). */
export async function soleGuardianChildIds(tx: Tx, userId: string): Promise<string[]> {
  const mine = await tx
    .select({ childId: guardianLinksTable.childId })
    .from(guardianLinksTable)
    .where(and(eq(guardianLinksTable.userId, userId), eq(guardianLinksTable.status, "active")));
  const out: string[] = [];
  for (const m of mine) {
    const others = await tx
      .select({ id: guardianLinksTable.id })
      .from(guardianLinksTable)
      .where(and(eq(guardianLinksTable.childId, m.childId), eq(guardianLinksTable.status, "active")));
    if (others.length <= 1) out.push(m.childId);
  }
  return out;
}
