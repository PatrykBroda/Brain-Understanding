import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { fightersTable } from "./fighters";

// A scheduled competition. Drives "Competition Mode": a persistent countdown, a
// UI that tightens toward the event, and a stricter coach register under pressure.
// One fighter may schedule several over time; the soonest active one is "the camp".
export const competitionsTable = pgTable("competitions", {
  id: serial("id").primaryKey(),
  fighterId: integer("fighter_id")
    .notNull()
    .references(() => fightersTable.id, { onDelete: "cascade" }),
  eventName: text("event_name").notNull(),
  discipline: text("discipline").notNull().default(""),
  eventDate: timestamp("event_date", { withTimezone: true }).notNull(),
  weighInDate: timestamp("weigh_in_date", { withTimezone: true }),
  targetWeight: text("target_weight").notNull().default(""),
  currentWeight: text("current_weight").notNull().default(""),
  notes: text("notes").notNull().default(""),
  // active | completed | cancelled
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertCompetitionSchema = createInsertSchema(competitionsTable, {
  eventName: (s) => s.min(1),
  eventDate: z.coerce.date(),
  weighInDate: z.coerce.date().nullable().optional(),
}).omit({
  id: true,
  fighterId: true,
  status: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertCompetition = z.infer<typeof insertCompetitionSchema>;
export type Competition = typeof competitionsTable.$inferSelect;
