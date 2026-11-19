import { and, eq, isNull, or, gte } from "drizzle-orm";
import { classOccurrencesTable, classSchedulesTable, db, gymsTable } from "@workspace/db";
import { addDays, localDate, startOfLocalDay } from "../localTime";
import type { DbLike } from "./history";

/** Rolling window of generated occurrences, in days ahead. */
export const HORIZON_DAYS = 56;

/** 0 = Sunday ... 6 = Saturday for a "YYYY-MM-DD" calendar date (timezone-free). */
export function weekdayOf(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

/** Monday ("YYYY-MM-DD") of the week containing `date`. */
export function weekStartOf(date: string): string {
  const dow = weekdayOf(date);
  return addDays(date, dow === 0 ? -6 : 1 - dow);
}

/** The UTC instant of "HH:MM" on local calendar day `date` in `tz`. */
export function localInstant(date: string, hhmm: string, tz: string): Date {
  const [h, m] = hhmm.split(":").map(Number);
  return new Date(startOfLocalDay(date, tz).getTime() + ((h ?? 0) * 60 + (m ?? 0)) * 60_000);
}

export interface ScheduleRow {
  id: string;
  gymId: string;
  groupId: string;
  title: string;
  weekday: number;
  startLocal: string;
  endLocal: string;
  coachUserId: string | null;
  effectiveFrom: string;
  effectiveTo: string | null;
}

/**
 * Generate occurrences for one schedule across [from, to] (inclusive local dates).
 * Existing rows (including edited or cancelled ones, and anything with logs) are never touched:
 * the (schedule, original_date) unique index turns a re-insert into a no-op.
 */
export async function generateForSchedule(conn: DbLike, s: ScheduleRow, tz: string, from: string, to: string): Promise<number> {
  const start = from > s.effectiveFrom ? from : s.effectiveFrom;
  const end = s.effectiveTo && s.effectiveTo < to ? s.effectiveTo : to;
  let created = 0;
  for (let d = start; d <= end; d = addDays(d, 1)) {
    if (weekdayOf(d) !== s.weekday) continue;
    const rows = await conn
      .insert(classOccurrencesTable)
      .values({
        gymId: s.gymId,
        groupId: s.groupId,
        scheduleId: s.id,
        originalDate: d,
        startsAt: localInstant(d, s.startLocal, tz),
        endsAt: localInstant(d, s.endLocal, tz),
        title: s.title,
        coachUserId: s.coachUserId,
      })
      .onConflictDoNothing()
      .returning({ id: classOccurrencesTable.id });
    created += rows.length;
  }
  return created;
}

/** Make sure every active schedule of the gym has occurrences from (today - backDays) to today + HORIZON_DAYS. */
export async function ensureHorizon(gymId: string, now: Date, backDays = 14, conn: DbLike = db): Promise<void> {
  const [gym] = await conn.select({ tz: gymsTable.timezone }).from(gymsTable).where(eq(gymsTable.id, gymId)).limit(1);
  if (!gym) return;
  const today = localDate(now, gym.tz);
  const from = addDays(today, -backDays);
  const to = addDays(today, HORIZON_DAYS);
  const schedules = await conn
    .select()
    .from(classSchedulesTable)
    .where(and(eq(classSchedulesTable.gymId, gymId), or(isNull(classSchedulesTable.effectiveTo), gte(classSchedulesTable.effectiveTo, from))));
  for (const s of schedules) await generateForSchedule(conn, s, gym.tz, from, to);
}
