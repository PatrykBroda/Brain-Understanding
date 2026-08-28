import {
  accountDeletionFilesTable,
  attachmentsTable,
  conversationsTable,
  db,
  fightersTable,
  googleOauthStatesTable,
  usersTable,
} from "@workspace/db";
import { eq, inArray, sql } from "drizzle-orm";
import { promises as fs } from "node:fs";
import path from "node:path";
import { UPLOADS_DIR } from "./uploads";

export class AccountNotFoundError extends Error {
  constructor() {
    super("Account not found");
    this.name = "AccountNotFoundError";
  }
}

export type AccountDeletionResult = {
  removedAttachmentFiles: number;
  pendingAttachmentFiles: number;
};

export async function cleanupPendingAccountDeletionFiles(
  uploadsDir = UPLOADS_DIR,
  ids?: number[],
): Promise<AccountDeletionResult> {
  if (ids && ids.length === 0) {
    return { removedAttachmentFiles: 0, pendingAttachmentFiles: 0 };
  }

  const query = db.select().from(accountDeletionFilesTable);
  const rows = ids
    ? await query.where(inArray(accountDeletionFilesTable.id, ids))
    : await query;
  let removedAttachmentFiles = 0;

  for (const row of rows) {
    const safePath = path.join(uploadsDir, path.basename(row.filePath));
    try {
      await fs.unlink(safePath);
      await db
        .delete(accountDeletionFilesTable)
        .where(eq(accountDeletionFilesTable.id, row.id));
      removedAttachmentFiles += 1;
    } catch (error) {
      const fsError = error as NodeJS.ErrnoException;
      if (fsError.code === "ENOENT") {
        await db
          .delete(accountDeletionFilesTable)
          .where(eq(accountDeletionFilesTable.id, row.id));
        removedAttachmentFiles += 1;
      } else {
        await db
          .update(accountDeletionFilesTable)
          .set({
            attempts: sql`${accountDeletionFilesTable.attempts} + 1`,
            lastError: fsError.code ?? "unlink_failed",
            updatedAt: new Date(),
          })
          .where(eq(accountDeletionFilesTable.id, row.id));
      }
    }
  }

  return {
    removedAttachmentFiles,
    pendingAttachmentFiles: rows.length - removedAttachmentFiles,
  };
}

/**
 * Permanently removes one user's FRAME data.
 *
 * The schema cascades users -> fighters -> all fighter-owned records, including
 * conversations, messages, attachment metadata, analyses and training data.
 * Google OAuth state is the one user-owned table without a foreign key, so it
 * is removed explicitly in the same transaction.
 *
 * Attachment bytes live on the API filesystem rather than in Postgres. Their
 * paths are captured before the transaction deletes the metadata, then removed
 * after commit so a database rollback can never leave a live row pointing at a
 * file that was already deleted.
 */
export async function deleteAccountData(
  userId: string,
  uploadsDir = UPLOADS_DIR,
): Promise<AccountDeletionResult> {
  const cleanupIds = await db.transaction(async (tx) => {
    const [account] = await tx
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .for("update");
    if (!account) {
      throw new AccountNotFoundError();
    }

    const paths = await tx
      .select({ filePath: attachmentsTable.filePath })
      .from(attachmentsTable)
      .innerJoin(
        conversationsTable,
        eq(conversationsTable.id, attachmentsTable.conversationId),
      )
      .innerJoin(
        fightersTable,
        eq(fightersTable.id, conversationsTable.fighterId),
      )
      .where(eq(fightersTable.userId, userId));

    const queuedFiles =
      paths.length > 0
        ? await tx
            .insert(accountDeletionFilesTable)
            .values(paths)
            .onConflictDoNothing()
            .returning({ id: accountDeletionFilesTable.id })
        : [];

    await tx
      .delete(googleOauthStatesTable)
      .where(eq(googleOauthStatesTable.userId, userId));

    const deletedUsers = await tx
      .delete(usersTable)
      .where(eq(usersTable.id, userId))
      .returning({ id: usersTable.id });

    if (deletedUsers.length !== 1) {
      throw new AccountNotFoundError();
    }

    return queuedFiles.map((row) => row.id);
  });

  return cleanupPendingAccountDeletionFiles(uploadsDir, cleanupIds);
}