import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

// Stripe billing columns are a display CACHE only — the synced `stripe` schema
// (stripe-replit-sync) is the source of truth; the subscription resolver
// refreshes these on every status read.
export const usersTable = pgTable("users", {
  clerkUserId: text("clerk_user_id").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  subscriptionStatus: text("subscription_status"),
  plan: text("plan").notNull().default("free"),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
});

export type User = typeof usersTable.$inferSelect;
