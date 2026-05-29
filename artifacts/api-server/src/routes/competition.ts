import { Router, type IRouter } from "express";
import { db, competitionsTable, insertCompetitionSchema } from "@workspace/db";
import { and, desc, eq } from "drizzle-orm";
import { getUserFighter } from "../middlewares/authMiddleware";
import { getActiveCompetition, pressureFor } from "../lib/competitionService";

const router: IRouter = Router();

// The current camp + computed pressure (days out, tier). Drives the countdown
// banner and the UI tightening as the event nears.
router.get("/competition/active", async (req, res) => {
  const fighter = await getUserFighter(req);
  if (!fighter) {
    res.json({ competition: null, pressure: null });
    return;
  }
  const competition = await getActiveCompetition(fighter.id);
  res.json({
    competition,
    pressure: competition ? pressureFor(competition) : null,
  });
});

// Full history (active + past) for the schedule list.
router.get("/competition", async (req, res) => {
  const fighter = await getUserFighter(req);
  if (!fighter) {
    res.json({ competitions: [] });
    return;
  }
  const competitions = await db
    .select()
    .from(competitionsTable)
    .where(eq(competitionsTable.fighterId, fighter.id))
    .orderBy(desc(competitionsTable.eventDate));
  res.json({ competitions });
});

router.post("/competition", async (req, res) => {
  const fighter = await getUserFighter(req);
  if (!fighter) {
    res.status(400).json({ error: "no fighter — complete onboarding first" });
    return;
  }
  const parsed = insertCompetitionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid competition", details: parsed.error.flatten() });
    return;
  }
  const [created] = await db
    .insert(competitionsTable)
    .values({ ...parsed.data, fighterId: fighter.id })
    .returning();
  res.json({ competition: created });
});

router.patch("/competition/:id", async (req, res) => {
  const fighter = await getUserFighter(req);
  if (!fighter) {
    res.status(400).json({ error: "no fighter" });
    return;
  }
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "invalid id" });
    return;
  }
  const parsed = insertCompetitionSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid competition", details: parsed.error.flatten() });
    return;
  }
  const [updated] = await db
    .update(competitionsTable)
    .set(parsed.data)
    .where(and(eq(competitionsTable.id, id), eq(competitionsTable.fighterId, fighter.id)))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "competition not found" });
    return;
  }
  res.json({ competition: updated });
});

// Soft-cancel: keep the row for history, drop it out of Competition Mode.
router.delete("/competition/:id", async (req, res) => {
  const fighter = await getUserFighter(req);
  if (!fighter) {
    res.status(400).json({ error: "no fighter" });
    return;
  }
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "invalid id" });
    return;
  }
  const [updated] = await db
    .update(competitionsTable)
    .set({ status: "cancelled" })
    .where(and(eq(competitionsTable.id, id), eq(competitionsTable.fighterId, fighter.id)))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "competition not found" });
    return;
  }
  res.json({ ok: true });
});

export default router;
