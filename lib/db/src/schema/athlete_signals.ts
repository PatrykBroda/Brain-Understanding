import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { fightersTable } from "./fighters";

export const athleteSignalsTable = pgTable("athlete_signals", {
  id: serial("id").primaryKey(),
  fighterId: integer("fighter_id")
    .notNull()
    .references(() => fightersTable.id, { onDelete: "cascade" }),
  signal: text("signal").notNull(),
  source: text("source").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type AthleteSignal = typeof athleteSignalsTable.$inferSelect;
