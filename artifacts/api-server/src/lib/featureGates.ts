import { and, eq, gte, sql } from "drizzle-orm";
import { db, messagesTable, conversationsTable } from "@workspace/db";

/** Free-tier daily coaching allowance (user messages per day; the day is the athlete's own local day). */
export const FREE_DAILY_COACHING_LIMIT = 5;

export function utcMidnight(): Date {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

/**
 * Counts the athlete's own messages sent since `since` (their local midnight; UTC midnight if unknown). User messages, not
 * assistant rows — welcome briefings write assistant rows with no paired
 * user message and must never burn free quota.
 */
export async function countUserMessagesToday(fighterId: number, since: Date = utcMidnight()): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(messagesTable)
    .innerJoin(
      conversationsTable,
      eq(messagesTable.conversationId, conversationsTable.id),
    )
    .where(
      and(
        eq(conversationsTable.fighterId, fighterId),
        eq(messagesTable.role, "user"),
        gte(messagesTable.createdAt, since),
      ),
    );
  return row?.count ?? 0;
}
