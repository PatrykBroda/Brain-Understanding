import { pgTable, text, timestamp, boolean } from "drizzle-orm/pg-core";

// Billing columns are a display CACHE only. Payments run through Apple IAP via
// RevenueCat; the RevenueCat webhook (and the /billing/sync reconcile) keep
// these current. The subscription resolver reads them for every gate check.
export const usersTable = pgTable("users", {
  id: text("id").primaryKey(), // UUID generated on register (crypto.randomUUID())
  email: text("email").notNull().unique(),
  hashedPassword: text("hashed_password").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  subscriptionStatus: text("subscription_status"),
  plan: text("plan").notNull().default("free"),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
  // Comp / admin accounts: always fully entitled to FRAME+ with no purchase.
  // Checked FIRST in the entitlement resolver.
  isAdmin: boolean("is_admin").notNull().default(false),
});

export type User = typeof usersTable.$inferSelect;
