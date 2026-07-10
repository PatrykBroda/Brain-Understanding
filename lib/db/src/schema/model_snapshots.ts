import { pgTable, serial, integer, date, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { fightersTable } from "./fighters";

// A lightweight weekly snapshot of the athlete model's coverage. One row per
// fighter per ISO week (Monday, UTC). The FRAME Intelligence Report upserts the
// current week's row idempotently on view, then reads the prior week's row to
// compute an honest, reproducible week-over-week delta (never a per-browser
// guess). Only stores real, deterministically-derived values — model
// completeness (from computeModelMaturity) and the active fact count.
export const modelSnapshotsTable = pgTable(
  "model_snapshots",
  {
    id: serial("id").primaryKey(),
    fighterId: integer("fighter_id")
      .notNull()
      .references(() => fightersTable.id, { onDelete: "cascade" }),
    // ISO-Monday-UTC week start, stored as a YYYY-MM-DD date string.
    weekStart: date("week_start").notNull(),
    // 0-100 model completeness (computeModelMaturity), derived from real evidence.
    completeness: integer("completeness").notNull().default(0),
    // Active fact count at capture time.
    factCount: integer("fact_count").notNull().default(0),
    capturedAt: timestamp("captured_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [uniqueIndex("model_snapshots_fighter_week_unq").on(t.fighterId, t.weekStart)],
);

export type ModelSnapshot = typeof modelSnapshotsTable.$inferSelect;
