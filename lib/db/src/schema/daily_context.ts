import {
  pgTable,
  serial,
  integer,
  text,
  boolean,
  date,
  jsonb,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { fightersTable } from "./fighters";

// One row per fighter per LOCAL calendar day (in the athlete's own timezone): the
// State and Today's Focus FRAME produced from the information it actually held
// that day. A row is only written on a day with fresh information (a check-in,
// a chat message, a new observation or an analysis that day); a day without any
// has no row, which is how the apps know to say "nothing new today" instead of
// presenting an older read as current. Past rows keep their date.
export interface DailyFocusPayload {
  title: string;
  detail: string;
  // Plain-language reasons, each tied to something the athlete gave FRAME ("Your check-in today: sleep 40").
  because: string[];
  kind: "recovery" | "camp" | "weakness" | "goal" | "onboarding" | "open";
}

export const dailyContextTable = pgTable(
  "daily_context",
  {
    id: serial("id").primaryKey(),
    fighterId: integer("fighter_id")
      .notNull()
      .references(() => fightersTable.id, { onDelete: "cascade" }),
    // YYYY-MM-DD in `timezone`.
    localDate: date("local_date", { mode: "string" }).notNull(),
    timezone: text("timezone").notNull().default("UTC"),
    state: text("state").notNull(),
    stateSource: text("state_source").notNull().default(""),
    focus: jsonb("focus").$type<DailyFocusPayload>().notNull(),
    // Hash of the inputs the row was built from; a changed hash within the day regenerates it.
    inputsHash: text("inputs_hash").notNull().default(""),
    generatedAt: timestamp("generated_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    fighterDayUq: uniqueIndex("daily_context_fighter_day_uq").on(t.fighterId, t.localDate),
  }),
);

export type DailyContext = typeof dailyContextTable.$inferSelect;
