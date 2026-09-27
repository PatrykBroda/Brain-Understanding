import { Router, type IRouter, type Request, type Response } from "express";
import {
  getOrCreateUser,
  getEntitlementForUser,
  setEntitlementFromRevenueCat,
} from "../lib/subscriptionService";
import { fetchRevenueCatEntitlement } from "../lib/revenuecat";
import { getAppleSubscriptionPrice } from "../lib/appleSubscriptionPrice";

const router: IRouter = Router();

router.get("/billing/apple-price", async (req: Request, res: Response): Promise<void> => {
  const productId = req.query.productId;
  const countryCode = req.query.countryCode;
  if (typeof productId !== "string" || productId.length > 150 || !/^[A-Za-z0-9._-]+$/.test(productId) ||
      typeof countryCode !== "string" || !/^[A-Z]{2}$/.test(countryCode)) {
    res.status(400).json({ error: "A valid offering product and App Store country are required." });
    return;
  }
  try {
    res.setHeader("Cache-Control", "no-store");
    res.json(await getAppleSubscriptionPrice(productId, countryCode));
  } catch (err) {
    req.log.warn({ err }, "Apple subscription price unavailable");
    res.status(503).json({ error: "The current App Store price is unavailable. Please try again later." });
  }
});

// GET /billing/status — current entitlement for the signed-in user.
// Purchases happen natively via Apple IAP (RevenueCat) on the client; this
// just reports the resolved entitlement.
router.get("/billing/status", async (req: Request, res: Response) => {
  try {
    const user = await getOrCreateUser(req.userId as string);
    const entitlement = await getEntitlementForUser(user);
    res.json(entitlement);
  } catch (err) {
    req.log.error({ err }, "billing status failed");
    res.status(500).json({ error: "Failed to load billing status" });
  }
});

// POST /billing/sync — deterministic unlock after a purchase or restore.
// The client calls this immediately after RevenueCat reports a successful
// purchase so entitlement unlocks without waiting for the webhook. Verifies
// against RevenueCat's REST API directly (webhook is reconciliation).
router.post("/billing/sync", async (req: Request, res: Response) => {
  try {
    const userId = req.userId as string;
    const rc = await fetchRevenueCatEntitlement(userId);

    if (rc) {
      await setEntitlementFromRevenueCat(userId, {
        active: rc.active,
        expiresAt: rc.expiresAt,
        status: rc.active ? "active" : "inactive",
      });
    }

    const user = await getOrCreateUser(userId);
    res.json(await getEntitlementForUser(user));
  } catch (err) {
    req.log.error({ err }, "billing sync failed");
    res.status(500).json({ error: "Failed to sync subscription" });
  }
});

export default router;
