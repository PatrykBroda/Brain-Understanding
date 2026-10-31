import { pgTable, serial, text, timestamp, integer, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

// One row per emailed reset code. The 6-digit code itself is never stored: only
// `token_hash` (HMAC-SHA256 of user id + code). A code is dead once it is used,
// expired, superseded by a newer request, or has burned its attempt allowance.
export const passwordResetTokensTable = pgTable(
  "password_reset_tokens",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    // Wrong guesses so far; the code is dead at the cap.
    attempts: integer("attempts").notNull().default(0),
    // Requesting IP, for abuse investigation only.
    requestIp: text("request_ip"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("password_reset_tokens_user_idx").on(t.userId)],
);

export type PasswordResetToken = typeof passwordResetTokensTable.$inferSelect;
