import { Router, type IRouter } from "express";
import { db, fightersTable } from "@workspace/db";
import { asc } from "drizzle-orm";
import { getActiveFacts } from "../lib/factsService";

const router: IRouter = Router();

router.get("/memory", async (_req, res) => {
  const [fighter] = await db.select().from(fightersTable).orderBy(asc(fightersTable.id)).limit(1);
  if (!fighter) {
    res.json({ facts: [], count: 0 });
    return;
  }
  const facts = await getActiveFacts(fighter.id);
  res.json({ facts, count: facts.length });
});

export default router;
