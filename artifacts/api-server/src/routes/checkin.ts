import { Router, type IRouter } from "express";
import { db, dailyCheckinsTable, insertDailyCheckinSchema } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { getUserFighter } from "../middlewares/authMiddleware";

const router: IRouter = Router();

// Calendar day is server-derived (UTC) so a client can never write another day.
function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

// Today's self-reported readiness check-in (or null if not logged yet).
router.get("/checkin/today", async (req, res) => {
  const fighter = await getUserFighter(req);
  const date = todayUtc();
  if (!fighter) {
    res.json({ checkin: null, date });
    return;
  }
  const [checkin] = await db
    .select()
    .from(dailyCheckinsTable)
    .where(
      and(
        eq(dailyCheckinsTable.fighterId, fighter.id),
        eq(dailyCheckinsTable.checkinDate, date),
      ),
    )
    .limit(1);
  res.json({ checkin: checkin ?? null, date });
});

// Upsert today's check-in. All values are athlete-entered; one row per day.
router.post("/checkin", async (req, res) => {
  const fighter = await getUserFighter(req);
  if (!fighter) {
    res.status(400).json({ error: "no fighter — complete onboarding first" });
    return;
  }
  const parsed = insertDailyCheckinSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid check-in", details: parsed.error.flatten() });
    return;
  }
  const date = todayUtc();
  const [checkin] = await db
    .insert(dailyCheckinsTable)
    .values({ ...parsed.data, fighterId: fighter.id, checkinDate: date })
    .onConflictDoUpdate({
      target: [dailyCheckinsTable.fighterId, dailyCheckinsTable.checkinDate],
      set: {
        sleep: parsed.data.sleep,
        energy: parsed.data.energy,
        soreness: parsed.data.soreness,
        stress: parsed.data.stress,
        restingHr: parsed.data.restingHr ?? null,
        updatedAt: new Date(),
      },
    })
    .returning();
  res.json({ checkin, date });
});

export default router;
