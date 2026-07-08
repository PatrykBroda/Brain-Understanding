import {
  pgTable,
  serial,
  integer,
  date,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { fightersTable } from "./fighters";

// One self-reported readiness check-in per fighter per calendar day (UTC).
// Every value is entered by the athlete — never inferred, never fabricated.
// sleep/energy/soreness/stress are 0-100 quality scores where 100 = optimal
// (fully rested / no soreness / no stress). restingHr is an optional
// self-measured resting heart rate in bpm.
export const dailyCheckinsTable = pgTable(
  "daily_checkins",
  {
    id: serial("id").primaryKey(),
    fighterId: integer("fighter_id")
      .notNull()
      .references(() => fightersTable.id, { onDelete: "cascade" }),
    // Calendar day the check-in describes (YYYY-MM-DD, server-derived UTC).
    checkinDate: date("checkin_date", { mode: "string" }).notNull(),
    sleep: integer("sleep").notNull(),
    energy: integer("energy").notNull(),
    soreness: integer("soreness").notNull(),
    stress: integer("stress").notNull(),
    restingHr: integer("resting_hr"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    fighterDayUq: uniqueIndex("daily_checkins_fighter_day_uq").on(
      t.fighterId,
      t.checkinDate,
    ),
  }),
);

const score = z.coerce.number().int().min(0).max(100);

// Client payload: the four ratings plus optional resting HR. fighterId and
// checkinDate are server-controlled so a client can never write another day
// (or another fighter's) row.
export const insertDailyCheckinSchema = createInsertSchema(dailyCheckinsTable, {
  sleep: score,
  energy: score,
  soreness: score,
  stress: score,
  restingHr: z.coerce.number().int().min(25).max(220).nullable().optional(),
}).omit({
  id: true,
  fighterId: true,
  checkinDate: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertDailyCheckin = z.infer<typeof insertDailyCheckinSchema>;
export type DailyCheckin = typeof dailyCheckinsTable.$inferSelect;
