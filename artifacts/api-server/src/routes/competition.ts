import { Router, type IRouter } from "express";
import {
  db,
  competitionsTable,
  insertCompetitionSchema,
  insertTrainingSessionSchema,
} from "@workspace/db";
import { and, desc, eq } from "drizzle-orm";
import { getUserFighter } from "../middlewares/authMiddleware";
import {
  getActiveCompetition,
  pressureFor,
  weightCutFor,
} from "../lib/competitionService";
import {
  ownedCampId,
  listSessions,
  createSession,
  updateSession,
  deleteSession,
} from "../lib/trainingSessionService";

const router: IRouter = Router();

// The current camp + computed pressure (days out, tier, phase) + honest weight-cut
// readout + this camp's training sessions. Drives the Camp dashboard, the countdown
// banner, and the UI tightening as the event nears.
router.get("/competition/active", async (req, res) => {
  const fighter = await getUserFighter(req);
  if (!fighter) {
    res.json({ competition: null, pressure: null, weightCut: null, sessions: [] });
    return;
  }
  const competition = await getActiveCompetition(fighter.id);
  const sessions = competition
    ? await listSessions(competition.id, fighter.id)
    : [];
  res.json({
    competition,
    pressure: competition ? pressureFor(competition) : null,
    weightCut: competition ? weightCutFor(competition) : null,
    sessions,
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

// ---- Training sessions (the manual schedule under a camp) ----

// List every session for a camp (owned check inside the query).
router.get("/competition/:campId/sessions", async (req, res) => {
  const fighter = await getUserFighter(req);
  if (!fighter) {
    res.status(400).json({ error: "no fighter" });
    return;
  }
  const campId = Number(req.params.campId);
  if (!Number.isFinite(campId)) {
    res.status(400).json({ error: "invalid camp id" });
    return;
  }
  if (!(await ownedCampId(campId, fighter.id))) {
    res.status(404).json({ error: "camp not found" });
    return;
  }
  const sessions = await listSessions(campId, fighter.id);
  res.json({ sessions });
});

router.post("/competition/:campId/sessions", async (req, res) => {
  const fighter = await getUserFighter(req);
  if (!fighter) {
    res.status(400).json({ error: "no fighter" });
    return;
  }
  const campId = Number(req.params.campId);
  if (!Number.isFinite(campId)) {
    res.status(400).json({ error: "invalid camp id" });
    return;
  }
  if (!(await ownedCampId(campId, fighter.id))) {
    res.status(404).json({ error: "camp not found" });
    return;
  }
  const parsed = insertTrainingSessionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid session", details: parsed.error.flatten() });
    return;
  }
  const created = await createSession(campId, fighter.id, parsed.data);
  res.json({ session: created });
});

router.patch("/competition/sessions/:id", async (req, res) => {
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
  const parsed = insertTrainingSessionSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid session", details: parsed.error.flatten() });
    return;
  }
  const updated = await updateSession(id, fighter.id, parsed.data);
  if (!updated) {
    res.status(404).json({ error: "session not found" });
    return;
  }
  res.json({ session: updated });
});

router.delete("/competition/sessions/:id", async (req, res) => {
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
  const removed = await deleteSession(id, fighter.id);
  if (!removed) {
    res.status(404).json({ error: "session not found" });
    return;
  }
  res.json({ ok: true });
});

export default router;
