import { eq } from "drizzle-orm";
import { db, juniorAccountsTable } from "@workspace/db";
import { juniorEnabled } from "./entitlement";

export interface LoginGate {
  status: number;
  code: string;
  error: string;
}

/** Called after a correct password for a junior login: blocks paused / unlinked accounts, stamps last login. */
export async function juniorLoginGate(userId: string): Promise<LoginGate | null> {
  if (!juniorEnabled()) return { status: 403, code: "JUNIOR_ACCOUNT_UNAVAILABLE", error: "Junior accounts are not available right now" };
  const [j] = await db.select().from(juniorAccountsTable).where(eq(juniorAccountsTable.userId, userId));
  if (!j) return { status: 403, code: "JUNIOR_ACCOUNT_UNAVAILABLE", error: "This account is not linked to a parent" };
  if (j.status === "paused") return { status: 403, code: "JUNIOR_ACCOUNT_PAUSED", error: "This account is paused by your parent" };
  await db.update(juniorAccountsTable).set({ lastLoginAt: new Date() }).where(eq(juniorAccountsTable.userId, userId));
  return null;
}
