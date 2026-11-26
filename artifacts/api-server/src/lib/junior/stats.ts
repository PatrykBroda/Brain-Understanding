import { and, eq, gte, inArray, lt } from "drizzle-orm";
import {
  db,
  attendanceLogsTable,
  classOccurrencesTable,
  fightersTable,
  trainingSessionsTable,
} from "@workspace/db";
import { PERIOD_DAYS, type BoardPeriod } from "./accountConfig";
import type { DbLike } from "./history";

const DAY = 24 * 3600 * 1000;
const WEEK = 7 * DAY;

export interface ActivityEvent {
  at: Date;
  minutes: number;
}

export interface Window {
  start: Date;
  end: Date;
  priorStart: Date;
  priorEnd: Date;
}

/** Rolling window ending `now`, and the equal-length window right before it (fair delta, no partial weeks). */
export function periodWindow(period: BoardPeriod, now: Date): Window {
  const len = PERIOD_DAYS[period] * DAY;
  const start = new Date(now.getTime() - len);
  return { start, end: now, priorStart: new Date(start.getTime() - len), priorEnd: start };
}

/** Monday-based week number (UTC). */
export const weekIndex = (d: Date) => Math.floor((d.getTime() - 4 * DAY) / WEEK);

/**
 * Consecutive weeks with at least one session, counted back from this week. A week that has not had a
 * session YET does not break the streak (it still counts from last week).
 */
export function streakWeeks(events: ActivityEvent[], now: Date): number {
  const weeks = new Set(events.filter((e) => e.at.getTime() <= now.getTime()).map((e) => weekIndex(e.at)));
  let w = weekIndex(now);
  if (!weeks.has(w)) w -= 1;
  let n = 0;
  while (weeks.has(w)) {
    n += 1;
    w -= 1;
  }
  return n;
}

export interface Metrics {
  sessions: number;
  minutes: number;
  priorSessions: number;
  priorMinutes: number;
  streak: number;
  lastActiveAt: Date | null;
}

const inRange = (e: ActivityEvent, a: Date, b: Date) => e.at >= a && e.at < b;

export function summarize(events: ActivityEvent[], w: Window, now: Date): Metrics {
  const cur = events.filter((e) => inRange(e, w.start, new Date(w.end.getTime() + 1)));
  const prior = events.filter((e) => inRange(e, w.priorStart, w.priorEnd));
  const past = events.filter((e) => e.at.getTime() <= now.getTime());
  return {
    sessions: cur.length,
    minutes: cur.reduce((s, e) => s + e.minutes, 0),
    priorSessions: prior.length,
    priorMinutes: prior.reduce((s, e) => s + e.minutes, 0),
    streak: streakWeeks(events, now),
    lastActiveAt: past.length ? new Date(Math.max(...past.map((e) => e.at.getTime()))) : null,
  };
}

/** "Mia Kowalski" -> "Mia K."; "Mia" -> "Mia". Juniors are never shown by full name on a board. */
export function boardName(displayName: string): string {
  const parts = displayName.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "Member";
  const first = parts[0]!;
  if (parts.length === 1) return first;
  return `${first} ${parts[parts.length - 1]![0]!.toUpperCase()}.`;
}

export interface RankInput {
  key: string;
  minutes: number;
  sessions: number;
  priorMinutes: number;
}

export function improvement(m: { minutes: number; priorMinutes: number }) {
  const delta = m.minutes - m.priorMinutes;
  return { delta, pct: m.priorMinutes > 0 ? Math.round((delta / m.priorMinutes) * 100) : null };
}

/** Most improved: biggest positive minutes delta vs the prior window. Needs some activity now; ties: more sessions, then name. */
export function mostImproved<T extends RankInput & { name: string }>(rows: T[], limit = 5): Array<T & { delta: number; pct: number | null }> {
  return rows
    .map((r) => ({ ...r, ...improvement(r) }))
    .filter((r) => r.minutes > 0 && r.delta > 0)
    .sort((a, b) => b.delta - a.delta || b.sessions - a.sessions || a.name.localeCompare(b.name))
    .slice(0, limit);
}

/** Standard competition ranking (1,2,2,4) by minutes, then sessions. Returns key -> rank. */
export function rankByMinutes(rows: RankInput[]): Map<string, number> {
  const sorted = [...rows].sort((a, b) => b.minutes - a.minutes || b.sessions - a.sessions);
  const out = new Map<string, number>();
  let prev: RankInput | null = null;
  let rank = 0;
  sorted.forEach((r, i) => {
    if (!prev || prev.minutes !== r.minutes || prev.sessions !== r.sessions) rank = i + 1;
    out.set(r.key, rank);
    prev = r;
  });
  return out;
}

// -- Data loading -------------------------------------------------------------

const STREAK_LOOKBACK_DAYS = 400;

/** Class attendance for juniors: events per child id. Only active logs; optionally only classes at one gym. */
export async function juniorEvents(gymId: string | null, childIds: string[], now: Date, conn: DbLike = db): Promise<Map<string, ActivityEvent[]>> {
  const out = new Map<string, ActivityEvent[]>();
  if (!childIds.length) return out;
  const since = new Date(now.getTime() - STREAK_LOOKBACK_DAYS * DAY);
  const rows = await conn
    .select({ childId: attendanceLogsTable.childId, startsAt: classOccurrencesTable.startsAt, endsAt: classOccurrencesTable.endsAt })
    .from(attendanceLogsTable)
    .innerJoin(classOccurrencesTable, eq(classOccurrencesTable.id, attendanceLogsTable.occurrenceId))
    .where(
      and(
        inArray(attendanceLogsTable.childId, childIds),
        eq(attendanceLogsTable.status, "active"),
        gte(classOccurrencesTable.startsAt, since),
        ...(gymId ? [eq(classOccurrencesTable.gymId, gymId)] : []),
      ),
    );
  for (const r of rows) {
    const list = out.get(r.childId) ?? [];
    list.push({ at: r.startsAt, minutes: Math.max(0, Math.round((r.endsAt.getTime() - r.startsAt.getTime()) / 60000)) });
    out.set(r.childId, list);
  }
  return out;
}

/** Adult members: completed training sessions from their own FRAME training log. */
export async function memberEvents(userIds: string[], now: Date, conn: DbLike = db): Promise<Map<string, ActivityEvent[]>> {
  const out = new Map<string, ActivityEvent[]>();
  if (!userIds.length) return out;
  const since = new Date(now.getTime() - STREAK_LOOKBACK_DAYS * DAY).toISOString().slice(0, 10);
  const rows = await conn
    .select({ userId: fightersTable.userId, date: trainingSessionsTable.sessionDate, minutes: trainingSessionsTable.durationMin })
    .from(trainingSessionsTable)
    .innerJoin(fightersTable, eq(fightersTable.id, trainingSessionsTable.fighterId))
    .where(and(inArray(fightersTable.userId, userIds), eq(trainingSessionsTable.completed, true), gte(trainingSessionsTable.sessionDate, since)));
  for (const r of rows) {
    const list = out.get(r.userId) ?? [];
    list.push({ at: new Date(`${r.date}T12:00:00Z`), minutes: r.minutes ?? 0 });
    out.set(r.userId, list);
  }
  return out;
}

/** Scheduled (non-cancelled) classes per group in [start, end): the denominator of the attendance rate. */
export async function scheduledPerGroup(gymId: string, start: Date, end: Date, conn: DbLike = db): Promise<Map<string, number>> {
  const rows = await conn
    .select({ groupId: classOccurrencesTable.groupId })
    .from(classOccurrencesTable)
    .where(and(eq(classOccurrencesTable.gymId, gymId), eq(classOccurrencesTable.status, "scheduled"), gte(classOccurrencesTable.startsAt, start), lt(classOccurrencesTable.startsAt, end)));
  const out = new Map<string, number>();
  for (const r of rows) out.set(r.groupId, (out.get(r.groupId) ?? 0) + 1);
  return out;
}
