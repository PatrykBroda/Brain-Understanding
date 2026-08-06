import { Router, type IRouter } from "express";
import { db, attachmentsTable, conversationsTable, fightersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { promises as fs } from "node:fs";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { getUserFighter } from "../middlewares/authMiddleware";

const router: IRouter = Router();

export const UPLOADS_DIR = path.resolve(process.cwd(), "uploads");
if (!existsSync(UPLOADS_DIR)) {
  mkdirSync(UPLOADS_DIR, { recursive: true });
}

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

async function conversationBelongsToUser(
  conversationId: number,
  userId: string,
): Promise<{ id: number } | null> {
  const [row] = await db
    .select({ id: conversationsTable.id })
    .from(conversationsTable)
    .innerJoin(fightersTable, eq(fightersTable.id, conversationsTable.fighterId))
    .where(eq(conversationsTable.id, conversationId))
    .limit(1);
  if (!row) return null;
  const [owner] = await db
    .select({ userId: fightersTable.userId })
    .from(conversationsTable)
    .innerJoin(fightersTable, eq(fightersTable.id, conversationsTable.fighterId))
    .where(eq(conversationsTable.id, conversationId))
    .limit(1);
  if (!owner || owner.userId !== userId) return null;
  return { id: row.id };
}

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
  const conv = await conversationBelongsToUser(body.conversationId, req.userId!);
  if (!conv) {
    res.status(404).json({ error: "conversation not found" });
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
  await fs.writeFile(filePath, bytes);

  const [att] = await db
    .insert(attachmentsTable)
    .values({
      conversationId: conv.id,
      kind,
      mimeType: body.mimeType,
      filename: body.filename,
      filePath: safeName,
      sizeBytes: bytes.length,
    })
    .returning();

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
