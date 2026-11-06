import { Router, type IRouter } from "express";
import {
  db,
  dailyCheckinsTable,
  insertDailyCheckinSchema,
  trainingSessionsTable,
} from "@workspace/db";
import { and, asc, eq, gte, lte } from "drizzle-orm";
import { getUserFighter } from "../middlewares/authMiddleware";
import { getEntitlementForUserId } from "../lib/subscriptionService";
import { rememberTimezone, todayFor } from "../middlewares/timezone";
import { addDays } from "../lib/localTime";
import { buildWeeklyRecap, computeStreak } from "../lib/streak";

const router: IRouter = Router();

const STREAK_LOOKBACK_DAYS = 400;

async function streakFor(fighterId: number, today: string) {
  const rows = await db
    .select({ d: dailyCheckinsTable.checkinDate })
    .from(dailyCheckinsTable)
    .where(
      and(
        eq(dailyCheckinsTable.fighterId, fighterId),
        gte(dailyCheckinsTable.checkinDate, addDays(today, -STREAK_LOOKBACK_DAYS)),
      ),
    );
  return computeStreak(rows.map((r) => r.d), today);
}

// The calendar day is derived on the server in the athlete's own timezone (the
// X-Timezone the app sends, else the one we stored, else UTC), so a client can
// never write another day and a check-in at 00:30 local lands on the new day.

// Today's self-reported readiness check-in (or null if not logged yet).
router.get("/checkin/today", async (req, res) => {
  const fighter = await getUserFighter(req);
  const date = todayFor(req, fighter?.timezone);
  if (!fighter) {
    res.json({ checkin: null, date, streak: computeStreak([], date) });
    return;
  }
  await rememberTimezone(req, fighter);
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
  res.json({ checkin: checkin ?? null, date, streak: await streakFor(fighter.id, date) });
});

// Weekly recap: the 7 local days ending today (sessions, state trend vs the week before).
// Free for everyone: it summarises what the athlete logged themselves.
router.get("/checkin/recap", async (req, res) => {
  const fighter = await getUserFighter(req);
  const today = todayFor(req, fighter?.timezone);
  if (!fighter) {
    res.json({ recap: buildWeeklyRecap(today, [], []) });
    return;
  }
  await rememberTimezone(req, fighter);
  const since = addDays(today, -13);
  const [rows, sessions] = await Promise.all([
    db
      .select()
      .from(dailyCheckinsTable)
      .where(
        and(
          eq(dailyCheckinsTable.fighterId, fighter.id),
          gte(dailyCheckinsTable.checkinDate, since),
          lte(dailyCheckinsTable.checkinDate, today),
        ),
      ),
    db
      .select()
      .from(trainingSessionsTable)
      .where(
        and(
          eq(trainingSessionsTable.fighterId, fighter.id),
          gte(trainingSessionsTable.sessionDate, since),
          lte(trainingSessionsTable.sessionDate, today),
        ),
      ),
  ]);
  const recap = buildWeeklyRecap(
    today,
    rows.map((r) => ({ date: r.checkinDate, sleep: r.sleep, energy: r.energy, soreness: r.soreness, stress: r.stress })),
    sessions.map((s) => ({ date: s.sessionDate, completed: s.completed })),
  );
  res.set("Cache-Control", "no-store");
  res.json({ recap });
});

// Readiness trend — the last 30 days of self-reported check-ins, oldest first.
// Advanced readiness insight is FRAME+ (the daily check-in itself stays free).
router.get("/checkin/history", async (req, res) => {
  const fighter = await getUserFighter(req);
  if (!fighter) {
    res.json({ checkins: [] });
    return;
  }
  const entitlement = await getEntitlementForUserId(req.userId as string);
  if (entitlement.plan === "free") {
    res.status(402).json({
      error: "The readiness trend is a FRAME+ feature. Today's check-in stays free.",
      code: "FRAME_PLUS_REQUIRED",
      feature: "fight_readiness",
    });
    return;
  }
  const since = addDays(todayFor(req, fighter.timezone), -30);
  const checkins = await db
    .select()
    .from(dailyCheckinsTable)
    .where(
      and(
        eq(dailyCheckinsTable.fighterId, fighter.id),
        gte(dailyCheckinsTable.checkinDate, since),
      ),
    )
    .orderBy(asc(dailyCheckinsTable.checkinDate));
  res.json({ checkins, today: todayFor(req, fighter.timezone) });
});

// Upsert today's check-in. All values are athlete-entered; one row per day.
router.post("/checkin", async (req, res) => {
  const fighter = await getUserFighter(req);
  if (!fighter) {
    res.status(400).json({ error: "no fighter" });
    return;
  }
  const parsed = insertDailyCheckinSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid check-in", details: parsed.error.flatten() });
    return;
  }
  const date = todayFor(req, fighter.timezone);
  await rememberTimezone(req, fighter);
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
  res.json({ checkin, date, streak: await streakFor(fighter.id, date) });
});

export default router;
