import {
  pgTable,
  serial,
  integer,
  text,
  boolean,
  timestamp,
  date,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { fightersTable } from "./fighters";
import { competitionsTable } from "./competitions";

export const SESSION_TYPES = [
  "sparring",
  "wrestling",
  "bjj",
  "striking",
  "conditioning",
  "recovery",
  "mobility",
] as const;
export type SessionType = (typeof SESSION_TYPES)[number];

export const SESSION_SOURCES = ["manual", "google_calendar"] as const;
export type SessionSource = (typeof SESSION_SOURCES)[number];

// A single scheduled training session inside a camp. Manual sessions are entered
// by the athlete; google_calendar sessions are imported (see externalEventId).
export const trainingSessionsTable = pgTable(
  "training_sessions",
  {
    id: serial("id").primaryKey(),
    campId: integer("camp_id")
      .notNull()
      .references(() => competitionsTable.id, { onDelete: "cascade" }),
    fighterId: integer("fighter_id")
      .notNull()
      .references(() => fightersTable.id, { onDelete: "cascade" }),
    sessionType: text("session_type").notNull(),
    // Calendar day of the session (YYYY-MM-DD, timezone-agnostic).
    sessionDate: date("session_date", { mode: "string" }).notNull(),
    // Optional wall-clock start time, "HH:MM".
    startTime: text("start_time"),
    durationMin: integer("duration_min"),
    coach: text("coach").notNull().default(""),
    objective: text("objective").notNull().default(""),
    notes: text("notes").notNull().default(""),
    completed: boolean("completed").notNull().default(false),
    // manual | google_calendar
    source: text("source").notNull().default("manual"),
    // Google Calendar event id for imported sessions; null for manual ones.
    externalEventId: text("external_event_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    // Imported events upsert on (camp, external id). Manual rows have a null
    // externalEventId; Postgres treats nulls as distinct so they never collide.
    campExternalUq: uniqueIndex("training_sessions_camp_external_uq").on(
      t.campId,
      t.externalEventId,
    ),
  }),
);

export const insertTrainingSessionSchema = createInsertSchema(trainingSessionsTable, {
  sessionType: z.enum(SESSION_TYPES),
  sessionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD"),
  startTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/, "expected HH:MM")
    .nullable()
    .optional(),
  durationMin: z.coerce.number().int().positive().max(1440).nullable().optional(),
}).omit({
  id: true,
  fighterId: true,
  campId: true,
  source: true,
  externalEventId: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertTrainingSession = z.infer<typeof insertTrainingSessionSchema>;
export type TrainingSession = typeof trainingSessionsTable.$inferSelect;
