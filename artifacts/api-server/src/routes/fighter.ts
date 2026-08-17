import { Router, type IRouter } from "express";
import {
  db,
  fightersTable,
  heroImagesTable,
  insertFighterSchema,
  updateFighterSchema,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { getUserFighter } from "../middlewares/authMiddleware";
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
// The image bytes live in the shared Postgres `hero_images` table (one row per
// fighter), NOT on local disk: the app runs on Replit autoscale where each
// instance has its own ephemeral filesystem, so a file written on the upload
// instance is gone by the time the image GET lands on another instance.
// `fighters.heroImageUrl` holds only a short non-empty marker used for the
// `hasHero` check and cache-busting — never the payload. Server-managed only.

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

  // Decode only to validate the payload is real, non-empty and within size.
  // The canonical stored form is the base64 string itself.
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

  // Upsert the single per-fighter hero row.
  await db
    .insert(heroImagesTable)
    .values({
      fighterId: fighter.id,
      mimeType: body.mimeType,
      dataBase64: body.dataBase64,
    })
    .onConflictDoUpdate({
      target: heroImagesTable.fighterId,
      set: {
        mimeType: body.mimeType,
        dataBase64: body.dataBase64,
        updatedAt: new Date(),
      },
    });

  // Store a fresh non-empty marker so `hasHero` is true and the client's
  // cache key (fighter.updatedAt) changes on every upload.
  const [updated] = await db
    .update(fightersTable)
    .set({ heroImageUrl: `db:${Date.now()}` })
    .where(eq(fightersTable.id, fighter.id))
    .returning();
  res.json({ fighter: updated ?? fighter });
});

router.get("/fighter/hero/file", async (req, res) => {
  const fighter = await getUserFighter(req);
  if (!fighter) {
    res.status(404).end();
    return;
  }
  const [row] = await db
    .select()
    .from(heroImagesTable)
    .where(eq(heroImagesTable.fighterId, fighter.id))
    .limit(1);
  if (!row) {
    res.status(404).end();
    return;
  }
  let buf: Buffer;
  try {
    buf = Buffer.from(row.dataBase64, "base64");
  } catch (err) {
    req.log.error({ err }, "hero decode failed");
    res.status(500).end();
    return;
  }
  res.setHeader("Content-Type", row.mimeType);
  res.setHeader("Cache-Control", "private, max-age=3600");
  res.end(buf);
});

router.delete("/fighter/hero", async (req, res) => {
  const fighter = await getUserFighter(req);
  if (!fighter) {
    res.status(404).json({ error: "no fighter" });
    return;
  }
  await db.delete(heroImagesTable).where(eq(heroImagesTable.fighterId, fighter.id));
  const [updated] = await db
    .update(fightersTable)
    .set({ heroImageUrl: "" })
    .where(eq(fightersTable.id, fighter.id))
    .returning();
  res.json({ fighter: updated ?? fighter });
});

export default router;
