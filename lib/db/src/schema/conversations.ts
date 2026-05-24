import { pgTable, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { fightersTable } from "./fighters";

export const conversationsTable = pgTable("conversations", {
  id: serial("id").primaryKey(),
  fighterId: integer("fighter_id")
    .notNull()
    .references(() => fightersTable.id, { onDelete: "cascade" }),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
});

export type Conversation = typeof conversationsTable.$inferSelect;
