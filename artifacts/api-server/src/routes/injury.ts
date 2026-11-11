import { Router, type IRouter, type Request, type Response } from "express";
import { and, desc, eq, gte, or } from "drizzle-orm";
import { db, injuryLogsTable } from "@workspace/db";
import { getUserFighter } from "../middlewares/authMiddleware";
import { rememberTimezone, todayFor } from "../middlewares/timezone";
import { addDays } from "../lib/localTime";
import { logger } from "../lib/logger";
import {
  injuryInputSchema,
  injuryPatchSchema,
  injuryDateProblem,
  INJURY_AREAS,
  INJURY_KINDS,
  INJURY_STATUSES,
} from "../lib/injuryLog";
import { toInjuryOut } from "../lib/injuryStore";

const router: IRouter = Router();

const HISTORY_DAYS = 90;

// drizzle wraps the driver error, so the pg code can be on err or err.cause.
function pgCode(err: unknown): string | undefined {
  const e = err as { code?: string; cause?: { code?: string } } | null;
  return e?.code ?? e?.cause?.code;
}

/** Never a silent failure and never a bare 500: the app shows `error`, support can match `code`. */
function fail(res: Response, err: unknown, what: string): void {
  const code = pgCode(err);
  logger.error({ err, pgCode: code }, `injuries: ${what} failed`);
  // 42P01 undefined_table, 42703 undefined_column: the injury migration has not been applied to this database.
  if (code === "42P01" || code === "42703") {
    res.status(503).json({
      error: "Injury history is temporarily unavailable. Nothing was lost; try again shortly.",
      code: "INJURY_STORAGE_UNAVAILABLE",
    });
    return;
  }
  if (code === "23505") {
    res.status(409).json({
      error: "You already have an entry for that area on that day. Edit it instead.",
      code: "INJURY_DUPLICATE",
    });
    return;
  }
  res.status(500).json({ error: "Couldn't save that injury. Try again.", code: "INJURY_SAVE_FAILED" });
}

const invalid = (res: Response, message = "Invalid injury entry") =>
  void res.status(400).json({ error: message, code: "INVALID_INJURY" });

const notFound = (res: Response) => void res.status(404).json({ error: "not found", code: "INJURY_NOT_FOUND" });

// History, newest first: the last 90 days plus any still-active entry. Free for everyone: it is the athlete's own data.
router.get("/injuries", async (req, res) => {
  try {
    const fighter = await getUserFighter(req);
    if (!fighter) {
      res.json({ injuries: [], areas: INJURY_AREAS, kinds: INJURY_KINDS, statuses: INJURY_STATUSES });
      return;
    }
    const today = todayFor(req, fighter.timezone);
    const rows = await db
      .select()
      .from(injuryLogsTable)
      .where(
        and(
          eq(injuryLogsTable.fighterId, fighter.id),
          or(gte(injuryLogsTable.logDate, addDays(today, -HISTORY_DAYS)), eq(injuryLogsTable.status, "active")),
        ),
      )
      .orderBy(desc(injuryLogsTable.logDate), desc(injuryLogsTable.id));
    res.set("Cache-Control", "no-store");
    res.json({
      today,
      areas: INJURY_AREAS,
      kinds: INJURY_KINDS,
      statuses: INJURY_STATUSES,
      injuries: rows.map(toInjuryOut),
    });
  } catch (err) {
    fail(res, err, "list");
  }
});

// Log an injury. date defaults to today (the one-tap picker); the same (day, area) updates that entry.
router.post("/injuries", async (req, res) => {
  try {
    const fighter = await getUserFighter(req);
    if (!fighter) {
      res.status(400).json({ error: "no fighter", code: "NO_FIGHTER" });
      return;
    }
    const parsed = injuryInputSchema.safeParse(req.body);
    if (!parsed.success) return invalid(res);
    await rememberTimezone(req, fighter);
    const today = todayFor(req, fighter.timezone);
    const { area, severity, note, kind, status } = parsed.data;
    const logDate = parsed.data.date ?? today;
    const problem = injuryDateProblem(logDate, today);
    if (problem) return invalid(res, `Invalid injury date: ${problem}`);
    const resolvedAt = status === "recovered" ? today : null;
    const [row] = await db
      .insert(injuryLogsTable)
      .values({ fighterId: fighter.id, logDate, area, severity, note, kind, status, resolvedAt })
      .onConflictDoUpdate({
        target: [injuryLogsTable.fighterId, injuryLogsTable.logDate, injuryLogsTable.area],
        set: { severity, note, kind, status, resolvedAt, updatedAt: new Date() },
      })
      .returning();
    res.json({ injury: toInjuryOut(row!) });
  } catch (err) {
    fail(res, err, "create");
  }
});

async function ownedId(req: Request) {
  const fighter = await getUserFighter(req);
  const id = Number(req.params["id"]);
  if (!fighter || !Number.isInteger(id)) return null;
  return { fighter, id };
}

// Edit an entry (severity, note, kind, date, status). Ownership is enforced in the WHERE clause.
router.patch("/injuries/:id", async (req, res) => {
  try {
    const ctx = await ownedId(req);
    if (!ctx) return notFound(res);
    const parsed = injuryPatchSchema.safeParse(req.body);
    if (!parsed.success) return invalid(res);
    const today = todayFor(req, ctx.fighter.timezone);
    const { date, status, ...rest } = parsed.data;
    if (date) {
      const problem = injuryDateProblem(date, today);
      if (problem) return invalid(res, `Invalid injury date: ${problem}`);
    }
    const set: Partial<typeof injuryLogsTable.$inferInsert> = { ...rest, updatedAt: new Date() };
    if (date) set.logDate = date;
    if (status === "recovered") {
      set.status = "recovered";
      set.resolvedAt = today;
    } else if (status === "active") {
      set.status = "active";
      set.resolvedAt = null;
    }
    const [row] = await db
      .update(injuryLogsTable)
      .set(set)
      .where(and(eq(injuryLogsTable.id, ctx.id), eq(injuryLogsTable.fighterId, ctx.fighter.id)))
      .returning();
    if (!row) return notFound(res);
    res.json({ injury: toInjuryOut(row) });
  } catch (err) {
    fail(res, err, "update");
  }
});

// Mark recovered. The entry stays in the history.
router.post("/injuries/:id/resolve", async (req, res) => {
  try {
    const ctx = await ownedId(req);
    if (!ctx) return notFound(res);
    const today = todayFor(req, ctx.fighter.timezone);
    const [row] = await db
      .update(injuryLogsTable)
      .set({ status: "recovered", resolvedAt: today, updatedAt: new Date() })
      .where(and(eq(injuryLogsTable.id, ctx.id), eq(injuryLogsTable.fighterId, ctx.fighter.id)))
      .returning();
    if (!row) return notFound(res);
    res.json({ injury: toInjuryOut(row) });
  } catch (err) {
    fail(res, err, "resolve");
  }
});

// Remove an entry. Ownership is enforced in the WHERE clause.
router.delete("/injuries/:id", async (req, res) => {
  try {
    const ctx = await ownedId(req);
    if (!ctx) return notFound(res);
    const gone = await db
      .delete(injuryLogsTable)
      .where(and(eq(injuryLogsTable.id, ctx.id), eq(injuryLogsTable.fighterId, ctx.fighter.id)))
      .returning({ id: injuryLogsTable.id });
    if (gone.length === 0) return notFound(res);
    res.json({ ok: true });
  } catch (err) {
    fail(res, err, "delete");
  }
});

export default router;
