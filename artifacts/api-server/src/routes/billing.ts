import { Router, type IRouter, type Request, type Response } from "express";
import { eq, and, isNull } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { getUncachableStripeClient } from "../lib/stripeClient";
import {
  getOrCreateUser,
  getEntitlementForUser,
  getFramePlusPrice,
  updateUserBillingCache,
} from "../lib/subscriptionService";

const router: IRouter = Router();

function appBaseUrl(): string {
  const domain = process.env["REPLIT_DOMAINS"]?.split(",")[0];
  if (!domain) throw new Error("REPLIT_DOMAINS not set");
  return `https://${domain}`;
}

async function ensureStripeCustomer(req: Request): Promise<string> {
  const clerkUserId = req.clerkUserId;
  if (!clerkUserId) throw new Error("Missing clerkUserId");
  const user = await getOrCreateUser(clerkUserId);
  if (user.stripeCustomerId) return user.stripeCustomerId;

  const stripe = await getUncachableStripeClient();
  const customer = await stripe.customers.create({
    metadata: { clerk_user_id: clerkUserId },
  });

  // Persist immediately; guard against a concurrent create winning the race.
  const updated = await db
    .update(usersTable)
    .set({ stripeCustomerId: customer.id })
    .where(
      and(
        eq(usersTable.clerkUserId, clerkUserId),
        isNull(usersTable.stripeCustomerId),
      ),
    )
    .returning({ stripeCustomerId: usersTable.stripeCustomerId });

  if (updated.length > 0) return customer.id;

  const fresh = await getOrCreateUser(clerkUserId);
  if (!fresh.stripeCustomerId) throw new Error("Failed to persist customer id");
  return fresh.stripeCustomerId;
}

// GET /billing/status — plan + price info for the signed-in user.
router.get("/billing/status", async (req: Request, res: Response) => {
  try {
    const user = await getOrCreateUser(req.clerkUserId as string);
    const entitlement = await getEntitlementForUser(user);
    const price = await getFramePlusPrice();
    res.json({
      ...entitlement,
      price: price
        ? { unitAmount: price.unitAmount, currency: price.currency }
        : null,
    });
  } catch (err) {
    req.log.error({ err }, "billing status failed");
    res.status(500).json({ error: "Failed to load billing status" });
  }
});

// POST /billing/checkout — start a FRAME+ subscription checkout.
router.post("/billing/checkout", async (req: Request, res: Response) => {
  try {
    const user = await getOrCreateUser(req.clerkUserId as string);
    const entitlement = await getEntitlementForUser(user);
    if (entitlement.plan === "frame_plus") {
      res.status(409).json({ error: "Already subscribed to FRAME+" });
      return;
    }

    const price = await getFramePlusPrice();
    if (!price) {
      res.status(503).json({
        error: "FRAME+ is not available right now. Try again shortly.",
      });
      return;
    }

    const customerId = await ensureStripeCustomer(req);
    const stripe = await getUncachableStripeClient();
    const base = appBaseUrl();

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      line_items: [{ price: price.priceId, quantity: 1 }],
      success_url: `${base}/profile?upgrade=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${base}/profile?upgrade=cancelled`,
      subscription_data: {
        metadata: { clerk_user_id: req.clerkUserId as string },
      },
    });

    if (!session.url) {
      res.status(500).json({ error: "Stripe did not return a checkout URL" });
      return;
    }
    res.json({ url: session.url });
  } catch (err) {
    req.log.error({ err }, "checkout session failed");
    res.status(500).json({ error: "Failed to start checkout" });
  }
});

// POST /billing/confirm — deterministic unlock after checkout return.
// Verifies the session against the Stripe API directly (webhook is
// reconciliation, not the unlock path) and writes the users cache.
router.post("/billing/confirm", async (req: Request, res: Response) => {
  try {
    const sessionId = (req.body as { sessionId?: unknown })?.sessionId;
    if (typeof sessionId !== "string" || !sessionId.startsWith("cs_")) {
      res.status(400).json({ error: "Invalid session id" });
      return;
    }

    const user = await getOrCreateUser(req.clerkUserId as string);
    const stripe = await getUncachableStripeClient();
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["subscription"],
    });

    const sessionCustomer =
      typeof session.customer === "string"
        ? session.customer
        : session.customer?.id;
    if (!user.stripeCustomerId || sessionCustomer !== user.stripeCustomerId) {
      res.status(403).json({ error: "Session does not belong to this user" });
      return;
    }

    const sub =
      typeof session.subscription === "string" ? null : session.subscription;
    if (!sub || (sub.status !== "active" && sub.status !== "trialing")) {
      res.json({ plan: "free", status: sub?.status ?? null });
      return;
    }

    const periodEnd =
      sub.items?.data?.[0]?.current_period_end ??
      (sub as unknown as { current_period_end?: number }).current_period_end ??
      null;

    const entitlement = {
      plan: "frame_plus" as const,
      status: sub.status,
      currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
      cancelAtPeriodEnd: sub.cancel_at_period_end === true,
    };
    await updateUserBillingCache(user.clerkUserId, sub.id, entitlement);
    res.json(entitlement);
  } catch (err) {
    req.log.error({ err }, "billing confirm failed");
    res.status(500).json({ error: "Failed to confirm subscription" });
  }
});

// POST /billing/portal — Stripe customer portal for managing the subscription.
router.post("/billing/portal", async (req: Request, res: Response) => {
  try {
    const user = await getOrCreateUser(req.clerkUserId as string);
    if (!user.stripeCustomerId) {
      res.status(400).json({ error: "No billing account yet" });
      return;
    }
    const stripe = await getUncachableStripeClient();
    const session = await stripe.billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: `${appBaseUrl()}/profile`,
    });
    res.json({ url: session.url });
  } catch (err) {
    req.log.error({ err }, "portal session failed");
    res.status(500).json({ error: "Failed to open billing portal" });
  }
});

export default router;
