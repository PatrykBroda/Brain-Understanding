import { Router, type IRouter } from "express";
import { db, fightersTable, insertFighterSchema } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getUserFighter } from "../middlewares/authMiddleware";

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
    res.json({ fighter: updated });
    return;
  }
  const [created] = await db
    .insert(fightersTable)
    .values({ ...parsed.data, userId })
    .returning();
  res.json({ fighter: created });
});

export default router;
