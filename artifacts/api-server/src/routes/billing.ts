import { Router, type IRouter, type Request, type Response } from "express";
import {
  getOrCreateUser,
  getEntitlementForUser,
  setEntitlementFromRevenueCat,
} from "../lib/subscriptionService";
import { fetchRevenueCatEntitlement } from "../lib/revenuecat";

const router: IRouter = Router();

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
