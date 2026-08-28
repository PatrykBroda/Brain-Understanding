import {
  attachmentsTable,
  accountDeletionFilesTable,
  conversationsTable,
  db,
  fightersTable,
  googleOauthStatesTable,
  messagesTable,
  usersTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import crypto from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  AccountNotFoundError,
  cleanupPendingAccountDeletionFiles,
  deleteAccountData,
} from "../lib/accountDeletionService";

const cleanupUserIds = new Set<string>();
const cleanupOauthStates = new Set<string>();
const cleanupDirectories = new Set<string>();
const cleanupQueuedPaths = new Set<string>();

afterEach(async () => {
  for (const userId of cleanupUserIds) {
    await db.delete(usersTable).where(eq(usersTable.id, userId));
  }
  for (const state of cleanupOauthStates) {
    await db
      .delete(googleOauthStatesTable)
      .where(eq(googleOauthStatesTable.state, state));
  }
  for (const directory of cleanupDirectories) {
    await fs.rm(directory, { recursive: true, force: true });
  }
  for (const filePath of cleanupQueuedPaths) {
    await db
      .delete(accountDeletionFilesTable)
      .where(eq(accountDeletionFilesTable.filePath, filePath));
  }
  cleanupUserIds.clear();
  cleanupOauthStates.clear();
  cleanupDirectories.clear();
  cleanupQueuedPaths.clear();
});

describe("deleteAccountData", () => {
  it("deletes the user cascade, OAuth state, and attachment bytes", async () => {
    const userId = crypto.randomUUID();
    const oauthState = `delete-test-${crypto.randomUUID()}`;
    const uploadsDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "frame-account-delete-"),
    );
    const storedFileName = `${crypto.randomUUID()}.txt`;
    cleanupUserIds.add(userId);
    cleanupOauthStates.add(oauthState);
    cleanupDirectories.add(uploadsDir);

    await db.insert(usersTable).values({
      id: userId,
      email: `${userId}@example.com`,
      hashedPassword: "test-only",
    });
    const [fighter] = await db
      .insert(fightersTable)
      .values({
        userId,
        name: "Deletion Test",
        age: 30,
        art: "BJJ",
        level: "blue",
        trainingFrequency: "3",
      })
      .returning({ id: fightersTable.id });
    const [conversation] = await db
      .insert(conversationsTable)
      .values({ fighterId: fighter!.id })
      .returning({ id: conversationsTable.id });
    const [message] = await db
      .insert(messagesTable)
      .values({
        conversationId: conversation!.id,
        role: "user",
        content: "delete me",
      })
      .returning({ id: messagesTable.id });
    await db.insert(attachmentsTable).values({
      conversationId: conversation!.id,
      messageId: message!.id,
      kind: "image",
      mimeType: "text/plain",
      filename: "delete-me.txt",
      filePath: storedFileName,
      sizeBytes: 4,
    });
    await db.insert(googleOauthStatesTable).values({
      state: oauthState,
      userId,
      expiresAt: new Date(Date.now() + 60_000),
    });
    await fs.writeFile(path.join(uploadsDir, storedFileName), "test");

    const result = await deleteAccountData(userId, uploadsDir);

    expect(result).toEqual({
      removedAttachmentFiles: 1,
      pendingAttachmentFiles: 0,
    });
    expect(
      await db.select().from(usersTable).where(eq(usersTable.id, userId)),
    ).toHaveLength(0);
    expect(
      await db
        .select()
        .from(fightersTable)
        .where(eq(fightersTable.userId, userId)),
    ).toHaveLength(0);
    expect(
      await db
        .select()
        .from(googleOauthStatesTable)
        .where(eq(googleOauthStatesTable.state, oauthState)),
    ).toHaveLength(0);
    await expect(
      fs.stat(path.join(uploadsDir, storedFileName)),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rolls back OAuth-state deletion when the user no longer exists", async () => {
    const userId = crypto.randomUUID();
    const oauthState = `rollback-test-${crypto.randomUUID()}`;
    cleanupOauthStates.add(oauthState);

    await db.insert(googleOauthStatesTable).values({
      state: oauthState,
      userId,
      expiresAt: new Date(Date.now() + 60_000),
    });

    await expect(deleteAccountData(userId)).rejects.toBeInstanceOf(
      AccountNotFoundError,
    );
    expect(
      await db
        .select()
        .from(googleOauthStatesTable)
        .where(eq(googleOauthStatesTable.state, oauthState)),
    ).toHaveLength(1);
  });

  it("keeps failed file cleanup in a durable queue for retry", async () => {
    const userId = crypto.randomUUID();
    const uploadsDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "frame-account-delete-retry-"),
    );
    const storedFileName = `${crypto.randomUUID()}.bin`;
    cleanupUserIds.add(userId);
    cleanupDirectories.add(uploadsDir);
    cleanupQueuedPaths.add(storedFileName);

    await db.insert(usersTable).values({
      id: userId,
      email: `${userId}@example.com`,
      hashedPassword: "test-only",
    });
    const [fighter] = await db
      .insert(fightersTable)
      .values({
        userId,
        name: "Deletion Retry Test",
        age: 30,
        art: "BJJ",
        level: "blue",
        trainingFrequency: "3",
      })
      .returning({ id: fightersTable.id });
    const [conversation] = await db
      .insert(conversationsTable)
      .values({ fighterId: fighter!.id })
      .returning({ id: conversationsTable.id });
    await db.insert(attachmentsTable).values({
      conversationId: conversation!.id,
      kind: "image",
      mimeType: "application/octet-stream",
      filename: "retry.bin",
      filePath: storedFileName,
      sizeBytes: 1,
    });

    // unlink() on a directory fails, deterministically exercising the retry path.
    await fs.mkdir(path.join(uploadsDir, storedFileName));
    const result = await deleteAccountData(userId, uploadsDir);

    expect(result).toEqual({
      removedAttachmentFiles: 0,
      pendingAttachmentFiles: 1,
    });
    const queued = await db
      .select()
      .from(accountDeletionFilesTable)
      .where(eq(accountDeletionFilesTable.filePath, storedFileName));
    expect(queued).toHaveLength(1);
    expect(queued[0]!.attempts).toBe(1);

    await fs.rm(path.join(uploadsDir, storedFileName), {
      recursive: true,
      force: true,
    });
    const retry = await cleanupPendingAccountDeletionFiles(uploadsDir, [
      queued[0]!.id,
    ]);
    expect(retry).toEqual({
      removedAttachmentFiles: 1,
      pendingAttachmentFiles: 0,
    });
  });
});