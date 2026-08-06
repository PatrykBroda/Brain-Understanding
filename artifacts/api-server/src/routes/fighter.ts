import { Router, type IRouter } from "express";
import { db, fightersTable, insertFighterSchema, updateFighterSchema } from "@workspace/db";
import { eq } from "drizzle-orm";
import { promises as fs } from "node:fs";
import { existsSync } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { getUserFighter } from "../middlewares/authMiddleware";
import { UPLOADS_DIR } from "./attachments";
import { deriveSpiritAnimal } from "../lib/spiritAnimals";

const router: IRouter = Router();

const HERO_MAX_BYTES = 12 * 1024 * 1024; // 12MB
const HERO_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

// Derive whole-year age from an ISO "YYYY-MM-DD" date of birth.
function ageFromDob(dob: string | null | undefined): number | null {
  if (!dob) return null;
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getUTCFullYear() - d.getUTCFullYear();
  const m = now.getUTCMonth() - d.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < d.getUTCDate())) age--;
  return age >= 0 && age < 130 ? age : null;
}

router.get("/fighter", async (req, res) => {
  const fighter = await getUserFighter(req);
  res.json({ fighter: fighter ?? null });
});

router.post("/fighter", async (req, res) => {
  const parsed = insertFighterSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid fighter", details: parsed.error.flatten() });
    return;
  }
  const userId = req.userId!;
  // DOB is the source of truth; age is always derived server-side, never trusted from the client.
  const derivedAge = ageFromDob(parsed.data.dateOfBirth);
  if (derivedAge == null) {
    res.status(400).json({ error: "invalid date of birth" });
    return;
  }
  const values = { ...parsed.data, age: derivedAge };
  const existing = await getUserFighter(req);

  if (existing) {
    const [updated] = await db
      .update(fightersTable)
      .set(values)
      .where(eq(fightersTable.id, existing.id))
      .returning();

    // Re-read the spirit animal when the personality changed or it was never set.
    const personalityChanged =
      (parsed.data.personality ?? existing.personality) !== existing.personality;
    if (updated && (personalityChanged || !updated.spiritAnimal)) {
      const derived = await deriveSpiritAnimal(updated, req.log);
      if (derived) {
        const [reread] = await db
          .update(fightersTable)
          .set({ spiritAnimal: derived.animal, spiritAnimalTagline: derived.tagline })
          .where(eq(fightersTable.id, updated.id))
          .returning();
        res.json({ fighter: reread ?? updated });
        return;
      }
    }
    res.json({ fighter: updated });
    return;
  }

  const [created] = await db
    .insert(fightersTable)
    .values({ ...values, userId })
    .returning();

  if (created) {
    const derived = await deriveSpiritAnimal(created, req.log);
    if (derived) {
      const [enriched] = await db
        .update(fightersTable)
        .set({ spiritAnimal: derived.animal, spiritAnimalTagline: derived.tagline })
        .where(eq(fightersTable.id, created.id))
        .returning();
      res.json({ fighter: enriched ?? created });
      return;
    }
  }
  res.json({ fighter: created });
});

router.patch("/fighter", async (req, res) => {
  const parsed = updateFighterSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid fighter", details: parsed.error.flatten() });
    return;
  }
  const existing = await getUserFighter(req);
  if (!existing) {
    res.status(404).json({ error: "no fighter to update" });
    return;
  }

  // DOB is the source of truth; age is never accepted from the client (schema omits it)
  // and is recomputed server-side whenever DOB is part of the patch.
  const patch: Record<string, unknown> = { ...parsed.data };
  if ("dateOfBirth" in patch) {
    const derivedAge = ageFromDob(patch.dateOfBirth as string | null | undefined);
    if (derivedAge == null) {
      res.status(400).json({ error: "invalid date of birth" });
      return;
    }
    patch.age = derivedAge;
  }

  if (Object.keys(patch).length === 0) {
    res.json({ fighter: existing });
    return;
  }

  const [updated] = await db
    .update(fightersTable)
    .set(patch)
    .where(eq(fightersTable.id, existing.id))
    .returning();

  // Re-derive the spirit animal when the personality changed.
  const personalityChanged =
    patch.personality != null && patch.personality !== existing.personality;
  if (updated && personalityChanged) {
    const derived = await deriveSpiritAnimal(updated, req.log);
    if (derived) {
      const [reread] = await db
        .update(fightersTable)
        .set({ spiritAnimal: derived.animal, spiritAnimalTagline: derived.tagline })
        .where(eq(fightersTable.id, updated.id))
        .returning();
      res.json({ fighter: reread ?? updated });
      return;
    }
  }
  res.json({ fighter: updated ?? existing });
});

// ── Customizable faded hero image for the profile fighter-card ────────────────
// Stored on disk (UPLOADS_DIR) with the safe filename kept in fighters.heroImageUrl.
// Server-managed only — never writable through the fighter PATCH payload.

router.post("/fighter/hero", async (req, res) => {
  const body = req.body as {
    mimeType?: unknown;
    filename?: unknown;
    dataBase64?: unknown;
  };
  if (
    typeof body.dataBase64 !== "string" ||
    typeof body.mimeType !== "string" ||
    typeof body.filename !== "string"
  ) {
    res.status(400).json({ error: "mimeType, filename, dataBase64 required" });
    return;
  }
  if (!HERO_MIME.has(body.mimeType)) {
    res.status(415).json({ error: `unsupported image mime: ${body.mimeType}` });
    return;
  }

  const fighter = await getUserFighter(req);
  if (!fighter) {
    res.status(404).json({ error: "no fighter" });
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
  if (bytes.length > HERO_MAX_BYTES) {
    res.status(413).json({ error: `file too large (max ${HERO_MAX_BYTES} bytes)` });
    return;
  }

  const ext = (path.extname(body.filename) || ".png")
    .toLowerCase()
    .replace(/[^a-z0-9.]/g, "");
  const safeName = `hero-${crypto.randomUUID()}${ext}`;
  await fs.writeFile(path.join(UPLOADS_DIR, safeName), bytes);

  // Remove the previous hero file (best-effort) so uploads don't accumulate.
  const prev = fighter.heroImageUrl;
  if (prev && /^hero-[a-z0-9.-]+$/i.test(prev)) {
    fs.unlink(path.join(UPLOADS_DIR, prev)).catch(() => {});
  }

  const [updated] = await db
    .update(fightersTable)
    .set({ heroImageUrl: safeName })
    .where(eq(fightersTable.id, fighter.id))
    .returning();
  res.json({ fighter: updated ?? fighter });
});

router.get("/fighter/hero/file", async (req, res) => {
  const fighter = await getUserFighter(req);
  const name = fighter?.heroImageUrl;
  if (!fighter || !name || !/^hero-[a-z0-9.-]+$/i.test(name)) {
    res.status(404).end();
    return;
  }
  const fp = path.join(UPLOADS_DIR, name);
  if (!existsSync(fp)) {
    res.status(404).end();
    return;
  }
  const ext = path.extname(name).toLowerCase();
  const mime =
    ext === ".jpg" || ext === ".jpeg"
      ? "image/jpeg"
      : ext === ".webp"
        ? "image/webp"
        : ext === ".gif"
          ? "image/gif"
          : "image/png";
  res.setHeader("Content-Type", mime);
  res.setHeader("Cache-Control", "private, max-age=3600");
  try {
    const buf = await fs.readFile(fp);
    res.end(buf);
  } catch (err) {
    req.log.error({ err }, "hero read failed");
    res.status(500).end();
  }
});

router.delete("/fighter/hero", async (req, res) => {
  const fighter = await getUserFighter(req);
  if (!fighter) {
    res.status(404).json({ error: "no fighter" });
    return;
  }
  const prev = fighter.heroImageUrl;
  if (prev && /^hero-[a-z0-9.-]+$/i.test(prev)) {
    fs.unlink(path.join(UPLOADS_DIR, prev)).catch(() => {});
  }
  const [updated] = await db
    .update(fightersTable)
    .set({ heroImageUrl: "" })
    .where(eq(fightersTable.id, fighter.id))
    .returning();
  res.json({ fighter: updated ?? fighter });
});

export default router;
