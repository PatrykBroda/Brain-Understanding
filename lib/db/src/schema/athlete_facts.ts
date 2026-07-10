import { pgTable, serial, integer, text, timestamp, jsonb } from "drizzle-orm/pg-core";
import { fightersTable } from "./fighters";

// One piece of evidence backing an observation. `type` is open text so future
// writers (session reflections, competition reviews) plug in with no schema
// change. Examples: "chat", "video", "calibration", "athlete_confirmed".
export interface FactSource {
  type: string;
  ref: string; // e.g. "video:42", "calibration:guard-retention", "" when none
  at: string; // ISO timestamp
}

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
  // Legacy single-source string, kept as "latest source" for prompt/planner/
  // mobile compatibility. The full evidence trail lives in `sources`.
  source: text("source").notNull().default("chat"),
  // Evidence trail: every independent sighting of this observation.
  // Legacy rows have [] — read through factsService.factSources() which
  // falls back to parsing the legacy `source` column.
  sources: jsonb("sources").$type<FactSource[]>().notNull().default([]),
  evidenceCount: integer("evidence_count").notNull().default(1),
  lastConfirmedAt: timestamp("last_confirmed_at", { withTimezone: true }),
  // Fixed-ontology domain key (lib/ontology), e.g. "striking.exits".
  // Nullable: legacy facts keep keyword-based categorization.
  subcategory: text("subcategory"),
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
