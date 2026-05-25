import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { fightersTable } from "./fighters";

export const FACT_CATEGORIES = [
  "strength",
  "weakness",
  "technical_knowledge",
  "pattern",
  "preference",
  "event",
  "goal",
  "context",
] as const;

export const FACT_STATUSES = ["active", "superseded", "resolved"] as const;

export const athleteFactsTable = pgTable("athlete_facts", {
  id: serial("id").primaryKey(),
  fighterId: integer("fighter_id")
    .notNull()
    .references(() => fightersTable.id, { onDelete: "cascade" }),
  category: text("category", { enum: FACT_CATEGORIES }).notNull(),
  topic: text("topic").notNull(),
  content: text("content").notNull(),
  confidence: integer("confidence").notNull().default(3),
  status: text("status", { enum: FACT_STATUSES }).notNull().default("active"),
  source: text("source").notNull().default("chat"),
  supersededById: integer("superseded_by_id"),
  resolvedReason: text("resolved_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type AthleteFact = typeof athleteFactsTable.$inferSelect;
export type FactCategory = (typeof FACT_CATEGORIES)[number];
export type FactStatus = (typeof FACT_STATUSES)[number];
