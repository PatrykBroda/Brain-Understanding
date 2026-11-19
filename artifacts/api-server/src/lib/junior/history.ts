import { changeHistoryTable, type db } from "@workspace/db";

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type DbLike = Tx | typeof db;

export interface HistoryEntry {
  gymId?: string | null;
  childId?: string | null;
  actorUserId: string | null;
  actorRole: "parent" | "coach" | "admin" | "frame_admin" | "system";
  entity: string;
  entityId?: string | null;
  action: string;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
}

/**
 * Append one audit row. Always call with the SAME transaction handle as the write it describes,
 * so the change and its history commit (or roll back) together. The table rejects UPDATE/DELETE.
 */
export async function recordHistory(tx: DbLike, e: HistoryEntry): Promise<void> {
  await tx.insert(changeHistoryTable).values({
    gymId: e.gymId ?? null,
    childId: e.childId ?? null,
    actorUserId: e.actorUserId,
    actorRole: e.actorRole,
    entity: e.entity,
    entityId: e.entityId ?? null,
    action: e.action,
    before: e.before ?? null,
    after: e.after ?? null,
    reason: e.reason ?? null,
  });
}
