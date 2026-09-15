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