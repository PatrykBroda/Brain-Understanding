import { pgTable, serial, text, timestamp, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

// Onboarding funnel: one row per "step viewed / completed / errored" so we can
// see which step people quit on. Append-only and analytics-only: nothing reads
// it to make a product decision, and losing a row never affects a user.
// `app` is 'mobile' | 'coach'; `step` is a key from @workspace/onboarding;
// `event` is 'view' | 'complete' | 'error'. Validated in the route, not here,
// so the vocabulary can grow without a migration.
export const onboardingEventsTable = pgTable(
  "onboarding_events",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    app: text("app").notNull(),
    step: text("step").notNull(),
    event: text("event").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("onboarding_events_user_idx").on(t.userId),
    index("onboarding_events_app_step_idx").on(t.app, t.step),
  ],
);

export type OnboardingEvent = typeof onboardingEventsTable.$inferSelect;
