import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import {
  verifyWebhookAuth,
  eventToEntitlement,
  type RevenueCatEvent,
} from "./lib/revenuecat";
import { setEntitlementFromRevenueCat } from "./lib/subscriptionService";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

app.use(cors({ credentials: true, origin: true }));
app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ extended: true, limit: "20mb" }));

// RevenueCat subscription webhook — public (RevenueCat has no session) and
// authenticated by the shared Authorization header configured in the
// dashboard. RevenueCat uses a header rather than a body signature, so this
// runs after express.json(). Keeps the users entitlement cache in sync on
// purchase / renewal / expiration.
app.post("/api/revenuecat/webhook", async (req, res) => {
  if (!verifyWebhookAuth(req.headers["authorization"])) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    const event = (req.body as { event?: RevenueCatEvent } | undefined)?.event;
    if (!event || typeof event.type !== "string") {
      res.status(400).json({ error: "Missing event" });
      return;
    }
    const decision = eventToEntitlement(event);
    if (decision.userId) {
      await setEntitlementFromRevenueCat(decision.userId, {
        active: decision.active,
        expiresAt: decision.expiresAt,
        status: decision.status,
      });
    }
    res.status(200).json({ received: true });
  } catch (err) {
    // 500 so RevenueCat retries delivery.
    req.log.error({ err }, "revenuecat webhook processing failed");
    res.status(500).json({ error: "Webhook processing failed" });
  }
});

app.use("/api", router);

export default app;
