import { Router, type IRouter } from "express";
import { and, desc, eq, gte } from "drizzle-orm";
import { db, injuryLogsTable } from "@workspace/db";
import { getUserFighter } from "../middlewares/authMiddleware";
import { rememberTimezone, todayFor } from "../middlewares/timezone";
import { addDays } from "../lib/localTime";
import { injuryInputSchema, INJURY_AREAS } from "../lib/injuryLog";

const router: IRouter = Router();

const HISTORY_DAYS = 90;

// History, newest first. Free for everyone: it is the athlete's own data.
router.get("/injuries", async (req, res) => {
  const fighter = await getUserFighter(req);
  if (!fighter) {
    res.json({ injuries: [], areas: INJURY_AREAS });
    return;
  }
  const today = todayFor(req, fighter.timezone);
  const rows = await db
    .select()
    .from(injuryLogsTable)
    .where(and(eq(injuryLogsTable.fighterId, fighter.id), gte(injuryLogsTable.logDate, addDays(today, -HISTORY_DAYS))))
    .orderBy(desc(injuryLogsTable.logDate), desc(injuryLogsTable.id));
  res.set("Cache-Control", "no-store");
  res.json({
    today,
    areas: INJURY_AREAS,
    injuries: rows.map((r) => ({ id: r.id, date: r.logDate, area: r.area, severity: r.severity, note: r.note })),
  });
});

// Log (or update) today's entry for one area. The day is derived server-side.
router.post("/injuries", async (req, res) => {
  const fighter = await getUserFighter(req);
  if (!fighter) {
    res.status(400).json({ error: "no fighter" });
    return;
  }
  const parsed = injuryInputSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid injury entry", code: "INVALID_INJURY" });
    return;
  }
  await rememberTimezone(req, fighter);
  const today = todayFor(req, fighter.timezone);
  const { area, severity, note } = parsed.data;
  const [row] = await db
    .insert(injuryLogsTable)
    .values({ fighterId: fighter.id, logDate: today, area, severity, note })
    .onConflictDoUpdate({
      target: [injuryLogsTable.fighterId, injuryLogsTable.logDate, injuryLogsTable.area],
      set: { severity, note, updatedAt: new Date() },
    })
    .returning();
  res.json({ injury: { id: row!.id, date: row!.logDate, area: row!.area, severity: row!.severity, note: row!.note } });
});

// Remove an entry. Ownership is enforced in the WHERE clause.
router.delete("/injuries/:id", async (req, res) => {
  const fighter = await getUserFighter(req);
  const id = Number(req.params["id"]);
  if (!fighter || !Number.isInteger(id)) {
    res.status(404).json({ error: "not found" });
    return;
  }
  const gone = await db
    .delete(injuryLogsTable)
    .where(and(eq(injuryLogsTable.id, id), eq(injuryLogsTable.fighterId, fighter.id)))
    .returning({ id: injuryLogsTable.id });
  if (gone.length === 0) {
    res.status(404).json({ error: "not found" });
    return;
  }
  res.json({ ok: true });
});

export default router;
