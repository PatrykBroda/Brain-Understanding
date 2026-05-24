import { Router, type IRouter } from "express";
import { db, fightersTable, insertFighterSchema } from "@workspace/db";
import { asc, eq } from "drizzle-orm";

const router: IRouter = Router();

router.get("/fighter", async (_req, res) => {
  const [fighter] = await db.select().from(fightersTable).orderBy(asc(fightersTable.id)).limit(1);
  res.json({ fighter: fighter ?? null });
});

router.post("/fighter", async (req, res) => {
  const parsed = insertFighterSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid fighter", details: parsed.error.flatten() });
    return;
  }
  const [existing] = await db.select().from(fightersTable).orderBy(asc(fightersTable.id)).limit(1);
  if (existing) {
    const [updated] = await db
      .update(fightersTable)
      .set(parsed.data)
      .where(eq(fightersTable.id, existing.id))
      .returning();
    res.json({ fighter: updated });
    return;
  }
  const [created] = await db.insert(fightersTable).values(parsed.data).returning();
  res.json({ fighter: created });
});

export default router;
