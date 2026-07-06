import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

// One row per Clerk user who has linked their own Google Calendar. Tokens are
// stored ENCRYPTED (AES-256-GCM, keyed by APP_ENCRYPTION_KEY) — never returned to
// any client. Linking is per-user (not per-device): a user links once and both the
// web and mobile clients get sync because the tokens live here, keyed by clerkUserId.
export const googleCalendarConnectionsTable = pgTable("google_calendar_connections", {
  clerkUserId: text("clerk_user_id")
    .primaryKey()
    .references(() => usersTable.clerkUserId, { onDelete: "cascade" }),
  googleEmail: text("google_email").notNull().default(""),
  // Encrypted OAuth tokens ("<ivB64>:<tagB64>:<cipherB64>"). Access token is
  // refreshed as needed; refresh token is only present after the first offline
  // consent, so it is preserved across refreshes when Google omits it.
  encAccessToken: text("enc_access_token"),
  encRefreshToken: text("enc_refresh_token"),
  // Absolute expiry of the current access token.
  expiryDate: timestamp("expiry_date", { withTimezone: true }),
  scope: text("scope").notNull().default(""),
  // Which Google calendar we read/write. Hardcoded to the user's primary for MVP.
  calendarId: text("calendar_id").notNull().default("primary"),
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type GoogleCalendarConnection = typeof googleCalendarConnectionsTable.$inferSelect;
