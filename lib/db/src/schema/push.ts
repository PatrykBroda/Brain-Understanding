import { pgTable, serial, text, integer, boolean, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

// Expo push tokens, one row per device token. A token belongs to exactly one user at a time:
// re-registering it on another account moves it (shared devices, sign-out/sign-in).
export const pushTokensTable = pgTable(
  "push_tokens",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    token: text("token").notNull(),
    platform: text("platform").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("push_tokens_token_uq").on(t.token), index("push_tokens_user_idx").on(t.userId)],
);

// Per-user push preferences. No row = defaults (enabled, quiet 21:00-08:00 local).
export const pushPreferencesTable = pgTable("push_preferences", {
  userId: text("user_id")
    .primaryKey()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  enabled: boolean("enabled").notNull().default(true),
  // Minutes after local midnight. The window may wrap midnight (start > end).
  quietStartMin: integer("quiet_start_min").notNull().default(21 * 60),
  quietEndMin: integer("quiet_end_min").notNull().default(8 * 60),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Idempotency ledger: a (user, dedupe_key) pair is claimed once, before sending, so a re-run or a
// second instance of the job never sends the same event twice.
export const pushSentTable = pgTable(
  "push_sent",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    dedupeKey: text("dedupe_key").notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("push_sent_user_key_uq").on(t.userId, t.dedupeKey)],
);

export type PushToken = typeof pushTokensTable.$inferSelect;
export type PushPreferences = typeof pushPreferencesTable.$inferSelect;
