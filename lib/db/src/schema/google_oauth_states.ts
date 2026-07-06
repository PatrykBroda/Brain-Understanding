import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

// Single-use CSRF nonce for the Google OAuth handshake. /oauth/start inserts a row
// (also embedded in the HMAC-signed `state`); /oauth/callback deletes it on use and
// rejects anything missing or expired. Identity travels in the signed state, so the
// public callback never needs a session cookie.
export const googleOauthStatesTable = pgTable("google_oauth_states", {
  state: text("state").primaryKey(),
  clerkUserId: text("clerk_user_id").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type GoogleOauthState = typeof googleOauthStatesTable.$inferSelect;
