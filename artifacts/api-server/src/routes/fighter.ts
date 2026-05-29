import { Router, type IRouter } from "express";
import { db, fightersTable, insertFighterSchema } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getUserFighter } from "../middlewares/authMiddleware";
import { deriveSpiritAnimal } from "../lib/spiritAnimals";

const router: IRouter = Router();

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
  const existing = await getUserFighter(req);

  if (existing) {
    const [updated] = await db
      .update(fightersTable)
      .set(parsed.data)
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
    .values({ ...parsed.data, userId })
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

export default router;
