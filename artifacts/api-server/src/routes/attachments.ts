import { Router, type IRouter } from "express";
import {
  db,
  attachmentsTable,
  conversationsTable,
  fightersTable,
  usersTable,
} from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { promises as fs } from "node:fs";
import { existsSync } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { getUserFighter } from "../middlewares/authMiddleware";
import { UPLOADS_DIR } from "../lib/uploads";

const router: IRouter = Router();

const MAX_BYTES = 12 * 1024 * 1024; // 12MB upload cap

const SAFE_IMAGE_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);
const SAFE_VIDEO_MIME = new Set([
  "video/mp4",
  "video/webm",
  "video/quicktime",
]);

router.post("/attachments", async (req, res) => {
  const body = req.body as {
    conversationId?: unknown;
    kind?: unknown;
    mimeType?: unknown;
    filename?: unknown;
    dataBase64?: unknown;
  };

  if (
    typeof body.conversationId !== "number" ||
    typeof body.dataBase64 !== "string" ||
    typeof body.mimeType !== "string" ||
    typeof body.filename !== "string"
  ) {
    res.status(400).json({ error: "conversationId, kind, mimeType, filename, dataBase64 required" });
    return;
  }

  const kind: "image" | "video" = body.kind === "video" ? "video" : "image";
  const okMime =
    kind === "image"
      ? SAFE_IMAGE_MIME.has(body.mimeType)
      : SAFE_VIDEO_MIME.has(body.mimeType);
  if (!okMime) {
    res.status(415).json({ error: `unsupported ${kind} mime: ${body.mimeType}` });
    return;
  }

  const fighter = await getUserFighter(req);
  if (!fighter) {
    res.status(403).json({ error: "no fighter" });
    return;
  }

  let bytes: Buffer;
  try {
    bytes = Buffer.from(body.dataBase64, "base64");
  } catch {
    res.status(400).json({ error: "invalid base64" });
    return;
  }
  if (bytes.length === 0) {
    res.status(400).json({ error: "empty file" });
    return;
  }
  if (bytes.length > MAX_BYTES) {
    res.status(413).json({ error: `file too large (max ${MAX_BYTES} bytes)` });
    return;
  }

  const ext = (path.extname(body.filename) || (kind === "image" ? ".png" : ".mp4"))
    .toLowerCase()
    .replace(/[^a-z0-9.]/g, "");
  const safeName = `${crypto.randomUUID()}${ext}`;
  const filePath = path.join(UPLOADS_DIR, safeName);
  let fileWritten = false;
  let att: typeof attachmentsTable.$inferSelect | null = null;
  try {
    att = await db.transaction(async (tx) => {
      // Serialize account-owned writes with DELETE /account. If deletion holds
      // this lock, we wait and then observe that the user is gone before any
      // bytes are written. If upload holds it first, deletion waits, then sees
      // and queues the committed attachment for cleanup.
      const [account] = await tx
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(eq(usersTable.id, req.userId!))
        .for("update");
      if (!account) return null;

      const [conv] = await tx
        .select({ id: conversationsTable.id })
        .from(conversationsTable)
        .innerJoin(
          fightersTable,
          eq(fightersTable.id, conversationsTable.fighterId),
        )
        .where(
          and(
            eq(conversationsTable.id, body.conversationId as number),
            eq(fightersTable.userId, req.userId!),
          ),
        )
        .limit(1);
      if (!conv) return null;

      await fs.writeFile(filePath, bytes);
      fileWritten = true;
      const [inserted] = await tx
        .insert(attachmentsTable)
        .values({
          conversationId: conv.id,
          kind,
          mimeType: body.mimeType as string,
          filename: body.filename as string,
          filePath: safeName,
          sizeBytes: bytes.length,
        })
        .returning();
      return inserted!;
    });
  } catch (error) {
    // Account/conversation deletion can win the race after bytes are written.
    // Compensate so a failed metadata insert never leaves a private orphan file.
    await fs.unlink(filePath).catch(() => null);
    throw error;
  }
  if (!att) {
    if (fileWritten) await fs.unlink(filePath).catch(() => null);
    res.status(404).json({ error: "account or conversation not found" });
    return;
  }

  res.json({
    attachment: {
      id: att!.id,
      kind: att!.kind,
      mimeType: att!.mimeType,
      filename: att!.filename,
      sizeBytes: att!.sizeBytes,
    },
  });
});

router.get("/attachments/:id/file", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).end();
    return;
  }
  const [row] = await db
    .select({
      att: attachmentsTable,
      ownerUserId: fightersTable.userId,
    })
    .from(attachmentsTable)
    .innerJoin(conversationsTable, eq(conversationsTable.id, attachmentsTable.conversationId))
    .innerJoin(fightersTable, eq(fightersTable.id, conversationsTable.fighterId))
    .where(eq(attachmentsTable.id, id))
    .limit(1);
  if (!row || row.ownerUserId !== req.userId) {
    res.status(404).end();
    return;
  }
  const att = row.att;
  const fp = path.join(UPLOADS_DIR, att.filePath);
  if (!existsSync(fp)) {
    res.status(404).end();
    return;
  }
  res.setHeader("Content-Type", att.mimeType);
  res.setHeader("Cache-Control", "private, max-age=3600");
  try {
    const buf = await fs.readFile(fp);
    res.end(buf);
  } catch (err) {
    req.log.error({ err }, "attachment read failed");
    res.status(500).end();
  }
});

export default router;
