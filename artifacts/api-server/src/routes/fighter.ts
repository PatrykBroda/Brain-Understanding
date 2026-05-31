import { Router, type IRouter } from "express";
import { db, fightersTable, insertFighterSchema, updateFighterSchema } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getUserFighter } from "../middlewares/authMiddleware";
import { deriveSpiritAnimal } from "../lib/spiritAnimals";

const router: IRouter = Router();

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
  const userId = req.clerkUserId!;
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

export default router;
