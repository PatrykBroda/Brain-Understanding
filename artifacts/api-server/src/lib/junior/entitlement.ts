import { and, eq, gt, isNull, or } from "drizzle-orm";
import { db, guardianLinksTable, userEntitlementsTable, usersTable } from "@workspace/db";
import { JuniorError } from "./http";
import type { DbLike } from "./history";

export const PARENT_ENTITLEMENT = "frame_parent";

/** The whole /api/junior surface is dark unless this server flag is on (pilot / TestFlight). */
export function juniorEnabled(): boolean {
  const v = process.env["JUNIOR_PORTAL_ENABLED"];
  return v === "1" || v === "true";
}

/** An active, unexpired frame_parent grant (pilot/admin/revenuecat), or a FRAME admin account. */
export async function userHasParentEntitlement(userId: string, now: Date = new Date(), conn: DbLike = db): Promise<boolean> {
  const [u] = await conn.select({ isAdmin: usersTable.isAdmin }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (u?.isAdmin) return true;
  const rows = await conn
    .select({ userId: userEntitlementsTable.userId })
    .from(userEntitlementsTable)
    .where(
      and(
        eq(userEntitlementsTable.userId, userId),
        eq(userEntitlementsTable.entitlement, PARENT_ENTITLEMENT),
        eq(userEntitlementsTable.status, "active"),
        or(isNull(userEntitlementsTable.expiresAt), gt(userEntitlementsTable.expiresAt, now)),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

/**
 * Family rule: a child is covered when ANY active guardian holds the entitlement. This is a separate
 * check from gym membership: payment never widens access, it only toggles write features.
 */
export async function childIsCovered(childId: string, now: Date = new Date(), conn: DbLike = db): Promise<boolean> {
  const guardians = await conn
    .select({ userId: guardianLinksTable.userId })
    .from(guardianLinksTable)
    .where(and(eq(guardianLinksTable.childId, childId), eq(guardianLinksTable.status, "active")));
  for (const g of guardians) {
    if (await userHasParentEntitlement(g.userId, now, conn)) return true;
  }
  return false;
}

/** Write features (new logs, wellbeing) need cover. Reads never do: a lapsed family keeps its history. */
export async function requireParentEntitlement(childId: string, now: Date = new Date(), conn: DbLike = db): Promise<void> {
  if (!(await childIsCovered(childId, now, conn))) {
    throw new JuniorError(402, "PARENT_PLAN_REQUIRED", "A FRAME Family plan is needed to add new records");
  }
}
