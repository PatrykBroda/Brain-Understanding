import {
  db,
  trainingSessionsTable,
  competitionsTable,
  type TrainingSession,
  type InsertTrainingSession,
} from "@workspace/db";
import { and, asc, eq, gte } from "drizzle-orm";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

// Confirm a camp belongs to this fighter before any session write. Returns the
// camp id when owned, otherwise null.
export async function ownedCampId(
  campId: number,
  fighterId: number,
): Promise<number | null> {
  const [row] = await db
    .select({ id: competitionsTable.id })
    .from(competitionsTable)
    .where(and(eq(competitionsTable.id, campId), eq(competitionsTable.fighterId, fighterId)))
    .limit(1);
  return row?.id ?? null;
}

export async function listSessions(
  campId: number,
  fighterId: number,
): Promise<TrainingSession[]> {
  return db
    .select()
    .from(trainingSessionsTable)
    .where(
      and(
        eq(trainingSessionsTable.campId, campId),
        eq(trainingSessionsTable.fighterId, fighterId),
      ),
    )
    .orderBy(asc(trainingSessionsTable.sessionDate), asc(trainingSessionsTable.startTime));
}

// Non-completed sessions from today forward — used for the coach prompt context.
export async function getUpcomingSessions(
  campId: number,
  fighterId: number,
  limit = 8,
): Promise<TrainingSession[]> {
  const rows = await db
    .select()
    .from(trainingSessionsTable)
    .where(
      and(
        eq(trainingSessionsTable.campId, campId),
        eq(trainingSessionsTable.fighterId, fighterId),
        eq(trainingSessionsTable.completed, false),
        gte(trainingSessionsTable.sessionDate, todayIso()),
      ),
    )
    .orderBy(asc(trainingSessionsTable.sessionDate), asc(trainingSessionsTable.startTime))
    .limit(limit);
  return rows;
}

export async function createSession(
  campId: number,
  fighterId: number,
  data: InsertTrainingSession,
): Promise<TrainingSession> {
  const [created] = await db
    .insert(trainingSessionsTable)
    .values({ ...data, campId, fighterId, source: "manual" })
    .returning();
  return created!;
}

export async function updateSession(
  id: number,
  fighterId: number,
  data: Partial<InsertTrainingSession> & { completed?: boolean },
): Promise<TrainingSession | null> {
  const [updated] = await db
    .update(trainingSessionsTable)
    .set(data)
    .where(
      and(
        eq(trainingSessionsTable.id, id),
        eq(trainingSessionsTable.fighterId, fighterId),
      ),
    )
    .returning();
  return updated ?? null;
}

export async function deleteSession(id: number, fighterId: number): Promise<boolean> {
  const [removed] = await db
    .delete(trainingSessionsTable)
    .where(
      and(
        eq(trainingSessionsTable.id, id),
        eq(trainingSessionsTable.fighterId, fighterId),
      ),
    )
    .returning({ id: trainingSessionsTable.id });
  return !!removed;
}

export type CalendarImport = {
  externalEventId: string;
  sessionType: string;
  sessionDate: string;
  startTime: string | null;
  durationMin: number | null;
  objective: string;
};

// Upsert imported Google Calendar events as training_sessions keyed on
// (campId, externalEventId). Never touches manual rows.
export async function upsertCalendarSessions(
  campId: number,
  fighterId: number,
  events: CalendarImport[],
): Promise<number> {
  let count = 0;
  for (const e of events) {
    await db
      .insert(trainingSessionsTable)
      .values({
        campId,
        fighterId,
        sessionType: e.sessionType,
        sessionDate: e.sessionDate,
        startTime: e.startTime,
        durationMin: e.durationMin,
        objective: e.objective,
        source: "google_calendar",
        externalEventId: e.externalEventId,
      })
      .onConflictDoUpdate({
        target: [trainingSessionsTable.campId, trainingSessionsTable.externalEventId],
        set: {
          sessionType: e.sessionType,
          sessionDate: e.sessionDate,
          startTime: e.startTime,
          durationMin: e.durationMin,
          objective: e.objective,
          updatedAt: new Date(),
        },
      });
    count++;
  }
  return count;
}
