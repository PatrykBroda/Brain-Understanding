import { logger } from "./logger";

/**
 * The entitlement identifier configured in the RevenueCat dashboard. Attach
 * the FRAME+ subscription products to an entitlement with exactly this id.
 */
export const FRAME_PLUS_ENTITLEMENT_ID = "frame_plus";

export interface RevenueCatEvent {
  type: string;
  app_user_id?: string;
  original_app_user_id?: string;
  aliases?: string[];
  entitlement_ids?: string[] | null;
  expiration_at_ms?: number | null;
  product_id?: string;
}

/**
 * Verify the shared Authorization header set on the webhook in the RevenueCat
 * dashboard (Project → Integrations → Webhooks → Authorization header value).
 * RevenueCat authenticates webhooks with this header rather than a body
 * signature, so this can run after the JSON body parser.
 */
export function verifyWebhookAuth(header: string | undefined): boolean {
  const expected = process.env["REVENUECAT_WEBHOOK_AUTH"];
  if (!expected) {
    logger.error("REVENUECAT_WEBHOOK_AUTH not set — rejecting webhook");
    return false;
  }
  return header === expected;
}

/**
 * Reduce a RevenueCat webhook event to an entitlement decision for the
 * frame_plus entitlement. EXPIRATION / pause revoke; every other event grants
 * while the entitlement carries a future expiration.
 */
export function eventToEntitlement(ev: RevenueCatEvent): {
  userId: string | null;
  active: boolean;
  expiresAt: Date | null;
  status: string;
} {
  const userId = ev.app_user_id || ev.original_app_user_id || null;
  const expiresAt =
    typeof ev.expiration_at_ms === "number"
      ? new Date(ev.expiration_at_ms)
      : null;

  // Some event types omit entitlement_ids; when present, only act on ours.
  const mentionsFramePlus =
    !ev.entitlement_ids || ev.entitlement_ids.length === 0
      ? true
      : ev.entitlement_ids.includes(FRAME_PLUS_ENTITLEMENT_ID);

  const revokeTypes = new Set(["EXPIRATION", "SUBSCRIPTION_PAUSED"]);
  if (revokeTypes.has(ev.type)) {
    return {
      userId,
      active: false,
      expiresAt: null,
      status: ev.type.toLowerCase(),
    };
  }

  const active =
    mentionsFramePlus && !!expiresAt && expiresAt.getTime() > Date.now();
  return { userId, active, expiresAt, status: ev.type.toLowerCase() };
}

/**
 * Read the current frame_plus entitlement for a user straight from
 * RevenueCat's REST API. Used by /billing/sync as the deterministic unlock
 * path right after a purchase, so entitlement does not wait on the webhook.
 */
export async function fetchRevenueCatEntitlement(
  appUserId: string,
): Promise<{ active: boolean; expiresAt: Date | null } | null> {
  const key = process.env["REVENUECAT_SECRET_KEY"];
  if (!key) {
    logger.warn("REVENUECAT_SECRET_KEY not set — cannot reconcile");
    return null;
  }

  try {
    const resp = await fetch(
      `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(appUserId)}`,
      {
        headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (!resp.ok) {
      logger.warn({ status: resp.status }, "RevenueCat subscriber fetch failed");
      return null;
    }
    const data = (await resp.json()) as {
      subscriber?: {
        entitlements?: Record<string, { expires_date?: string | null }>;
      };
    };
    const ent = data.subscriber?.entitlements?.[FRAME_PLUS_ENTITLEMENT_ID];
    if (!ent) return { active: false, expiresAt: null };
    const expiresAt = ent.expires_date ? new Date(ent.expires_date) : null;
    // A null expiry means a non-expiring entitlement (e.g. lifetime); treat as active.
    const active = !expiresAt || expiresAt.getTime() > Date.now();
    return { active, expiresAt };
  } catch (err) {
    logger.warn({ err }, "RevenueCat subscriber fetch errored");
    return null;
  }
}
