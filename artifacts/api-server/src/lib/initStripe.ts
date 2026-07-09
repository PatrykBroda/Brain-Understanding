import { runMigrations } from "stripe-replit-sync";
import { getStripeSync } from "./stripeClient";
import { logger } from "./logger";

/**
 * Fire-and-forget Stripe bootstrap: schema migrations, managed webhook
 * registration, and a data backfill. Deliberately NOT awaited before
 * listen() — boot must stay instant (see boot-reliability constraint).
 * Failures degrade billing but never take the server down.
 */
export async function initStripe(): Promise<void> {
  const databaseUrl = process.env["DATABASE_URL"];
  if (!databaseUrl) {
    logger.warn("initStripe skipped: DATABASE_URL not set");
    return;
  }

  try {
    await runMigrations({ databaseUrl });
    logger.info("Stripe schema ready");

    const stripeSync = await getStripeSync();

    const domain = process.env["REPLIT_DOMAINS"]?.split(",")[0];
    if (domain) {
      const webhook = await stripeSync.findOrCreateManagedWebhook(
        `https://${domain}/api/stripe/webhook`,
      );
      logger.info(
        { url: webhook?.url ?? "setup complete" },
        "Stripe managed webhook configured",
      );
    } else {
      logger.warn("initStripe: REPLIT_DOMAINS not set, skipping webhook setup");
    }

    stripeSync
      // NB: without `{ object: "all" }` the library's switch matches nothing
      // and silently syncs zero entities.
      .syncBackfill({ object: "all" })
      .then(() => logger.info("Stripe data backfill complete"))
      .catch((err) => logger.error({ err }, "Stripe data backfill failed"));
  } catch (err) {
    logger.error(
      { err },
      "Stripe init failed — billing degraded, server still serving",
    );
  }
}
