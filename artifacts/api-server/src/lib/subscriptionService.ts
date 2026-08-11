import { eq } from "drizzle-orm";
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

export async function getOrCreateUser(userId: string): Promise<User> {
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  if (!user) throw new Error("Failed to load user row");
  return user;
}

/**
 * Single source of truth for entitlement decisions.
 *
 * Payments run through Apple In-App Purchase via RevenueCat. The users row is
 * the cache and is kept current by two paths: the RevenueCat webhook
 * (/api/revenuecat/webhook) and the post-purchase reconcile (/billing/sync,
 * which reads RevenueCat's REST API directly). FRAME+ requires
 * `plan === frame_plus` AND a `currentPeriodEnd` in the future.
 */
export async function getEntitlementForUser(user: User): Promise<Entitlement> {
  // Comp / admin accounts always have full FRAME+ access — no purchase, no
  // expiry. This bypasses every paywall gate (all of which key off
  // `entitlement.plan === "free"`).
  if (user.isAdmin) {
    return {
      plan: "frame_plus",
      status: "admin",
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
    };
  }

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

/** Entitlement for gate checks, straight from the user id. */
export async function getEntitlementForUserId(
  userId: string,
): Promise<Entitlement> {
  const user = await getOrCreateUser(userId);
  return getEntitlementForUser(user);
}

/**
 * Apply a RevenueCat entitlement state to the users cache. `active` with a
 * future `expiresAt` grants FRAME+; anything else drops the user to free.
 * Called by the RevenueCat webhook and the /billing/sync reconcile.
 */
export async function setEntitlementFromRevenueCat(
  userId: string,
  params: { active: boolean; expiresAt: Date | null; status: string | null },
): Promise<void> {
  const grant =
    params.active &&
    !!params.expiresAt &&
    params.expiresAt.getTime() > Date.now();
  try {
    await db
      .update(usersTable)
      .set({
        plan: grant ? "frame_plus" : "free",
        subscriptionStatus: params.status,
        currentPeriodEnd: grant ? params.expiresAt : null,
      })
      .where(eq(usersTable.id, userId));
  } catch (err) {
    logger.warn({ err }, "failed to apply RevenueCat entitlement");
  }
}
