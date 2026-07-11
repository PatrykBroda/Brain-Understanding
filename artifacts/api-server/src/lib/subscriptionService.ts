import { sql, eq } from "drizzle-orm";
import { db, usersTable, type User } from "@workspace/db";
import { logger } from "./logger";

export const FRAME_PLUS_PLAN_KEY = "frame_plus";

export type PlanKey = "free" | "frame_plus";

export interface Entitlement {
  plan: PlanKey;
  status: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
}

const FREE_ENTITLEMENT: Entitlement = {
  plan: "free",
  status: null,
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
};

interface SubscriptionRow {
  id: string;
  status: string | null;
  cancel_at_period_end: boolean | null;
  current_period_end: string | number | null;
  item_period_end: string | number | null;
}

function toIsoOrNull(value: string | number | null): string | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(n) || n <= 0) return null;
  return new Date(n * 1000).toISOString();
}

export async function getOrCreateUser(clerkUserId: string): Promise<User> {
  await db.insert(usersTable).values({ clerkUserId }).onConflictDoNothing();
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.clerkUserId, clerkUserId))
    .limit(1);
  if (!user) throw new Error("Failed to load user row");
  return user;
}

/**
 * Single source of truth for entitlement decisions. Queries the synced
 * `stripe` schema (webhooks + backfill keep it current) by the user's
 * Stripe customer id. `active` and `trialing` grant FRAME+; everything
 * else (past_due, canceled, unpaid, …) is free.
 *
 * Sync-lag guard: right after checkout the webhook may not have landed
 * yet, but /billing/confirm has already written the verified state to
 * the users cache directly from the Stripe API. If the stripe schema has
 * no row but the cache says FRAME+ with a future period end, honor the
 * cache instead of clobbering it.
 *
 * Note: on newer Stripe API versions `current_period_end` lives on the
 * subscription item, so the top-level column can be NULL — fall back to
 * the first item's value.
 */
export async function getEntitlementForUser(user: User): Promise<Entitlement> {
  // Comp / admin accounts always have full FRAME+ access — no Stripe customer,
  // no subscription, no payment. This bypasses every paywall gate (all of which
  // key off `entitlement.plan === "free"`).
  if (user.isAdmin) {
    return {
      plan: "frame_plus",
      status: "admin",
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
    };
  }

  if (!user.stripeCustomerId) return FREE_ENTITLEMENT;

  let rows: SubscriptionRow[];
  try {
    const result = await db.execute(sql`
      SELECT
        id,
        status::text AS status,
        cancel_at_period_end,
        current_period_end,
        items->'data'->0->>'current_period_end' AS item_period_end
      FROM stripe.subscriptions
      WHERE customer = ${user.stripeCustomerId}
        AND status::text IN ('active', 'trialing')
      ORDER BY created DESC NULLS LAST
      LIMIT 1
    `);
    rows = result.rows as unknown as SubscriptionRow[];
  } catch (err) {
    // stripe schema may not exist yet (init still running) — fall back to
    // the cache, else fail closed to free.
    logger.warn({ err }, "getEntitlementForUser: stripe schema query failed");
    return cachedEntitlementOrFree(user);
  }

  const sub = rows[0];
  if (!sub) {
    const cached = cachedEntitlementOrFree(user);
    if (cached.plan === "frame_plus") return cached; // sync lag — keep cache
    await updateUserBillingCache(user.clerkUserId, null, FREE_ENTITLEMENT);
    return FREE_ENTITLEMENT;
  }

  const entitlement: Entitlement = {
    plan: "frame_plus",
    status: sub.status,
    currentPeriodEnd:
      toIsoOrNull(sub.current_period_end) ?? toIsoOrNull(sub.item_period_end),
    cancelAtPeriodEnd: sub.cancel_at_period_end === true,
  };

  await updateUserBillingCache(user.clerkUserId, sub.id, entitlement);
  return entitlement;
}

/** Entitlement for gate checks, straight from the clerk user id. */
export async function getEntitlementForClerkUser(
  clerkUserId: string,
): Promise<Entitlement> {
  const user = await getOrCreateUser(clerkUserId);
  return getEntitlementForUser(user);
}

function cachedEntitlementOrFree(user: User): Entitlement {
  if (
    user.plan === "frame_plus" &&
    user.currentPeriodEnd &&
    user.currentPeriodEnd.getTime() > Date.now()
  ) {
    return {
      plan: "frame_plus",
      status: user.subscriptionStatus,
      currentPeriodEnd: user.currentPeriodEnd.toISOString(),
      cancelAtPeriodEnd: false,
    };
  }
  return FREE_ENTITLEMENT;
}

export async function updateUserBillingCache(
  clerkUserId: string,
  subscriptionId: string | null,
  entitlement: Entitlement,
): Promise<void> {
  try {
    await db
      .update(usersTable)
      .set({
        stripeSubscriptionId: subscriptionId,
        subscriptionStatus: entitlement.status,
        plan: entitlement.plan,
        currentPeriodEnd: entitlement.currentPeriodEnd
          ? new Date(entitlement.currentPeriodEnd)
          : null,
      })
      .where(eq(usersTable.clerkUserId, clerkUserId));
  } catch (err) {
    logger.warn({ err }, "failed to update user billing cache");
  }
}

/** Look up the FRAME+ recurring price from the synced stripe schema. */
export async function getFramePlusPrice(): Promise<{
  priceId: string;
  unitAmount: number;
  currency: string;
} | null> {
  try {
    const result = await db.execute(sql`
      SELECT pr.id, pr.unit_amount, pr.currency::text AS currency
      FROM stripe.prices pr
      JOIN stripe.products p ON p.id = pr.product
      WHERE p.metadata->>'plan_key' = ${FRAME_PLUS_PLAN_KEY}
        AND pr.active = true
        AND p.active = true
        AND pr.recurring IS NOT NULL
      ORDER BY pr.created DESC NULLS LAST
      LIMIT 1
    `);
    const row = result.rows[0] as
      | { id: string; unit_amount: string | number | null; currency: string }
      | undefined;
    if (!row) return null;
    return {
      priceId: row.id,
      unitAmount: Number(row.unit_amount ?? 0),
      currency: row.currency,
    };
  } catch (err) {
    logger.warn({ err }, "getFramePlusPrice: stripe schema query failed");
    return null;
  }
}
