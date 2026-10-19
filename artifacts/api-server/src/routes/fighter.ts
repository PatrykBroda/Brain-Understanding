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
import { hasAiConsentForUser } from "../lib/aiConsent";
import { deriveSpiritAnimal } from "../lib/spiritAnimals";
import { archetypeStateFor, shapeFighter } from "../lib/archetypeGate";
import { getActiveFacts } from "../lib/factsService";
import type { Fighter } from "@workspace/db";
import { prepareFighterBody, questionnaireChanged } from "../lib/fighterBody";
import { recordFinish } from "../lib/onboardingEvents";

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

/**
 * What every /fighter response sends: the row with the archetype (animal) withheld until
 * FRAME's understanding of the athlete reaches 25%, plus `understanding` and
 * `archetypeUnlocked` so the apps can say why. The animal is also only (re)assigned here
 * once unlocked; onboarding no longer assigns one (there is nothing to read yet).
 */
async function respondFighter(row: Fighter, opts: { personalityChanged?: boolean }, log: { warn: (o: object, m: string) => void }) {
  const facts = await getActiveFacts(row.id);
  const state = archetypeStateFor(facts);
  let current = row;
  if (state.archetypeUnlocked && (opts.personalityChanged || !row.spiritAnimal) && (await hasAiConsentForUser(row.userId))) {
    try {
      const derived = await deriveSpiritAnimal(row, log as never);
      if (derived) {
        const [reread] = await db
          .update(fightersTable)
          .set({ spiritAnimal: derived.animal, spiritAnimalTagline: derived.tagline })
          .where(eq(fightersTable.id, row.id))
          .returning();
        current = reread ?? row;
      }
    } catch (err) {
      log.warn({ err }, "archetype derivation failed");
    }
  }
  return shapeFighter(current, state);
}

router.get("/fighter", async (req, res) => {
  const fighter = await getUserFighter(req);
  res.json({ fighter: fighter ? await respondFighter(fighter, {}, req.log) : null });
});

router.post("/fighter", async (req, res) => {
  const current = await getUserFighter(req);
  const parsed = insertFighterSchema.safeParse(prepareFighterBody(req.body, current ?? undefined));
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
  const existing = await getUserFighter(req);
  const values: Record<string, unknown> & typeof parsed.data & { age: number } = {
    ...parsed.data,
    age: derivedAge,
    ...(!existing || questionnaireChanged(existing as unknown as Record<string, unknown>, parsed.data as Record<string, unknown>)
      ? { questionnaireUpdatedAt: req.frameNow ?? new Date() }
      : {}),
  };
  const aiConsent = await hasAiConsentForUser(userId);

  if (existing) {
    const [updated] = await db
      .update(fightersTable)
      .set(values)
      .where(eq(fightersTable.id, existing.id))
      .returning();
    const personalityChanged =
      (parsed.data.personality ?? existing.personality) !== existing.personality;
    res.json({ fighter: updated ? await respondFighter(updated, { personalityChanged }, req.log) : existing });
    return;
  }

  const [created] = await db
    .insert(fightersTable)
    .values({ ...values, userId })
    .returning();

  // Funnel: first save of the profile = onboarding finished (analytics only, never throws).
  if (created) await recordFinish(userId, req.log);

  // No archetype at sign-up: FRAME has nothing to read yet (see respondFighter).
  res.json({ fighter: created ? await respondFighter(created, {}, req.log) : created });
});

router.patch("/fighter", async (req, res) => {
  const existing = await getUserFighter(req);
  const parsed = updateFighterSchema.safeParse(prepareFighterBody(req.body, existing ?? undefined));
  if (!parsed.success) {
    res.status(400).json({ error: "invalid fighter", details: parsed.error.flatten() });
    return;
  }
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
  if (questionnaireChanged(existing as unknown as Record<string, unknown>, patch)) {
    patch.questionnaireUpdatedAt = req.frameNow ?? new Date();
  }

  const [updated] = await db
    .update(fightersTable)
    .set(patch)
    .where(eq(fightersTable.id, existing.id))
    .returning();

  // The archetype is re-read when the answers behind it changed AND understanding allows one.
  const personalityChanged =
    patch.personality != null && patch.personality !== existing.personality;
  res.json({ fighter: updated ? await respondFighter(updated, { personalityChanged }, req.log) : existing });
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
