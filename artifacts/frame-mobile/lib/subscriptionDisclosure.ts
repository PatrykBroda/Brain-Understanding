/** Convert an App Store ISO-8601 subscription period into review-friendly copy. */
export function formatSubscriptionPeriod(period: string | null | undefined): string | null {
  if (!period) return null;
  const match = /^P(?:(\d+)Y)?(?:(\d+)M)?(?:(\d+)W)?(?:(\d+)D)?$/.exec(period);
  if (!match) return null;

  const units = [
    { count: Number(match[1] ?? 0), unit: "year" },
    { count: Number(match[2] ?? 0), unit: "month" },
    { count: Number(match[3] ?? 0), unit: "week" },
    { count: Number(match[4] ?? 0), unit: "day" },
  ].filter(({ count }) => count > 0);

  if (units.length !== 1) return null;
  const [{ count, unit }] = units;
  return `${count} ${unit}${count === 1 ? "" : "s"}`;
}

type SubscriptionPackageMetadata = {
  product: {
    productCategory: string | null;
    productType: string;
    subscriptionPeriod: string | null;
  };
};

/**
 * Store product titles are merchant-authored metadata and can contain stale
 * prices or currencies. Keep the in-app plan label price-free.
 */
export function getSubscriptionPlanLabel(_storeProductTitle: string): string {
  return "FRAME+";
}

/** Billing length from authoritative App Store metadata for auto-renewing plans. */
export function getSubscriptionPeriodLabel(
  pkg: SubscriptionPackageMetadata,
): string | null {
  if (
    pkg.product.productCategory !== "SUBSCRIPTION" ||
    !["AUTO_RENEWABLE_SUBSCRIPTION", "UNKNOWN"].includes(pkg.product.productType)
  ) {
    return null;
  }
  return formatSubscriptionPeriod(pkg.product.subscriptionPeriod);
}

const SINGLE_PERIOD_CADENCE: Readonly<Record<string, string>> = {
  "1 day": "daily",
  "1 week": "weekly",
  "1 month": "monthly",
  "1 year": "yearly",
};

/** Concise purchase-card copy using the App Store's localized price. */
export function formatSubscriptionRenewal(
  localizedPrice: string,
  period: string,
): string {
  const cadence = SINGLE_PERIOD_CADENCE[period] ?? `every ${period}`;
  const pricePeriod = period.startsWith("1 ") ? period.slice(2) : period;
  return `${localizedPrice}/${pricePeriod} · Auto-renews ${cadence} until cancelled`;
}
