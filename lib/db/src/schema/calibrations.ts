import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { fightersTable } from "./fighters";

export const calibrationsTable = pgTable("calibrations", {
  id: serial("id").primaryKey(),
  fighterId: integer("fighter_id")
    .notNull()
    .references(() => fightersTable.id, { onDelete: "cascade" }),
  promptKey: text("prompt_key").notNull(),
  promptText: text("prompt_text").notNull(),
  answer: text("answer").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Calibration = typeof calibrationsTable.$inferSelect;
