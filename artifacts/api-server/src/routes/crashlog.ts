import { Router, type IRouter } from "express";
import { z } from "zod";
import { auditShown, notifyPriceAudit } from "../lib/priceAudit";

const CrashPayload = z
  .object({
    type: z.enum(["crash", "startup", "layout", "billing", "price"]).default("crash"),
    message: z.string().optional(),
    stack: z.string().optional(),
    context: z.string().optional(),
    appVersion: z.string().optional(),
    buildVersion: z.string().nullable().optional(),
    platform: z.string().optional(),
    ts: z.string().optional(),
    billing: z
      .object({
        stage: z.enum(["load", "prepurchase", "changed"]),
        packageIdentifier: z.string(),
        productIdentifier: z.string(),
        offeringPriceString: z.string(),
        offeringCurrencyCode: z.string(),
        storePriceString: z.string(),
        storeCurrencyCode: z.string(),
        storefrontCountryCode: z.string().nullable(),
        storeKitMode: z.literal("STOREKIT_2"),
        loadedAt: z.string(),
      })
      .optional(),
    // What the paywall card actually rendered, next to StoreKit's view of the
    // same product. Audited and posted to Discord by lib/priceAudit.
    price: z
      .object({
        stage: z.enum(["shown", "prepurchase"]),
        productIdentifier: z.string().max(150),
        storefrontCountryCode: z.string().max(3).nullable(),
        displayedTerritory: z.string().max(3),
        displayedCurrencyCode: z.string().max(3),
        displayedPrice: z.string().max(40),
        displayedAmount: z.number().nullable(),
        storePriceString: z.string().max(40),
        storeCurrencyCode: z.string().max(3),
      })
      .optional(),
  })
  .superRefine((data, context) => {
    if (data.type === "billing" && !data.billing) {
      context.addIssue({
        code: "custom",
        message: "billing metadata is required",
        path: ["billing"],
      });
    }
    if (data.type === "price" && !data.price) {
      context.addIssue({
        code: "custom",
        message: "price metadata is required",
        path: ["price"],
      });
    }
  });

const router: IRouter = Router();

router.post("/crash-log", (req, res) => {
  const parsed = CrashPayload.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid payload" });
    return;
  }
  const data = parsed.data;
  if (data.type === "price" && data.price) {
    const verdict = auditShown(data.price, {
      appVersion: data.appVersion,
      buildVersion: data.buildVersion,
    });
    req.log.info(
      { type: "mobile_price", ok: verdict.ok, price: data.price, appVersion: data.appVersion, buildVersion: data.buildVersion },
      "MOBILE PRICE SHOWN",
    );
  } else if (data.type === "billing") {
    req.log.info(
      {
        type: "mobile_billing",
        appVersion: data.appVersion,
        buildVersion: data.buildVersion,
        platform: data.platform,
        billing: data.billing,
        ts: data.ts,
      },
      "MOBILE BILLING DIAGNOSTIC",
    );
  } else if (data.type === "layout") {
    req.log.info(
      {
        type: "mobile_layout",
        appVersion: data.appVersion,
        platform: data.platform,
        context: data.context,
        ts: data.ts,
      },
      `MOBILE LAYOUT PROBE — ${data.context ?? "(no context)"}`
    );
  } else if (data.type === "startup") {
    req.log.info(
      {
        type: "mobile_startup",
        appVersion: data.appVersion,
        platform: data.platform,
        context: data.context,
        ts: data.ts,
      },
      "MOBILE STARTUP PROBE"
    );
  } else {
    req.log.error(
      {
        type: "mobile_crash",
        appVersion: data.appVersion,
        platform: data.platform,
        context: data.context,
        message: data.message,
        stack: data.stack,
        ts: data.ts,
      },
      `MOBILE CRASH — ${data.context ?? "unknown"}: ${data.message ?? "(no message)"}`
    );
    // A paywall that failed to load a price is the other half of the audit:
    // the card showed nothing, so say why.
    if (data.context?.startsWith("paywall-")) {
      void notifyPriceAudit(
        `🚫 FRAME+ paywall showed no price (${data.context}${data.appVersion ? ` · build ${data.appVersion}` : ""}): ${(data.message ?? "no message").slice(0, 300)}`,
      );
    }
  }
  res.json({ ok: true });
});

export default router;
