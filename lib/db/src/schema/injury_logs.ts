import { pgTable, serial, integer, date, text, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { fightersTable } from "./fighters";

// Athlete-entered injury / soreness notes, one row per fighter per day per body area.
// Never inferred. area is validated against a fixed list in the api-server (lib/injuryLog).
export const injuryLogsTable = pgTable(
  "injury_logs",
  {
    id: serial("id").primaryKey(),
    fighterId: integer("fighter_id")
      .notNull()
      .references(() => fightersTable.id, { onDelete: "cascade" }),
    logDate: date("log_date", { mode: "string" }).notNull(),
    area: text("area").notNull(),
    // 1 = niggle, 2 = sore, 3 = injured
    severity: integer("severity").notNull(),
    note: text("note").notNull().default(""),
    // strain | sprain | bruise | soreness | other (validated in the api-server)
    kind: text("kind").notNull().default("other"),
    // active | recovered. Recovered rows stay in the history; resolvedAt is the day it was marked recovered.
    status: text("status").notNull().default("active"),
    resolvedAt: date("resolved_at", { mode: "string" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex("injury_logs_fighter_day_area_uq").on(t.fighterId, t.logDate, t.area),
    index("injury_logs_fighter_date_idx").on(t.fighterId, t.logDate),
  ],
);

export type InjuryLog = typeof injuryLogsTable.$inferSelect;
