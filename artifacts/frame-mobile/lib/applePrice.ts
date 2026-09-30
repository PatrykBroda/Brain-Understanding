import { apiGet } from "./api";
import type { FreshPurchasesPackage } from "./storeProductRefresh";

export type VerifiedPackage = FreshPurchasesPackage & {
  applePrice: {
    productId: string;
    territory: string;
    currencyCode: string;
    localizedPrice: string;
    /** Absent from servers older than the price audit. */
    amount?: number;
  };
};

export type ShownPriceReport = {
  stage: "shown" | "prepurchase";
  productIdentifier: string;
  storefrontCountryCode: string | null;
  displayedTerritory: string;
  displayedCurrencyCode: string;
  displayedPrice: string;
  displayedAmount: number | null;
  storePriceString: string;
  storeCurrencyCode: string;
};

/** What the card renders for this package, next to StoreKit's own view, so
 * the server can audit it (lib/priceAudit on the API) and post a verdict. */
export function toShownPriceReport(
  stage: ShownPriceReport["stage"],
  pkg: VerifiedPackage,
): ShownPriceReport {
  return {
    stage,
    productIdentifier: pkg.product.identifier,
    storefrontCountryCode: pkg.storeContext.storefrontCountryCode,
    displayedTerritory: pkg.applePrice.territory,
    displayedCurrencyCode: pkg.applePrice.currencyCode,
    displayedPrice: pkg.applePrice.localizedPrice,
    displayedAmount: typeof pkg.applePrice.amount === "number" ? pkg.applePrice.amount : null,
    storePriceString: pkg.product.priceString,
    storeCurrencyCode: pkg.product.currencyCode,
  };
}

/** Apple Connect's scheduled new-subscriber price, not StoreKit's potentially
 * USD TestFlight product metadata. Never fall back to a StoreKit amount. */
export async function verifyApplePrice(pkg: FreshPurchasesPackage): Promise<VerifiedPackage> {
  const countryCode = pkg.storeContext.storefrontCountryCode;
  // StoreKit returns ISO 3166-1 alpha-3 (e.g. GBR, USA). Older SDKs may
  // supply alpha-2; the API validates both against Apple's territory list.
  if (!countryCode || !/^[A-Z]{2,3}$/.test(countryCode)) {
    throw new Error("Your App Store country could not be identified.");
  }
  const price = await apiGet<VerifiedPackage["applePrice"]>(
    `/billing/apple-price?productId=${encodeURIComponent(pkg.product.identifier)}&countryCode=${encodeURIComponent(countryCode)}`,
  );
  if (price.productId !== pkg.product.identifier ||
      price.territory !== countryCode ||
      !/^[A-Z]{3}$/.test(price.currencyCode) ||
      typeof price.localizedPrice !== "string" ||
      !price.localizedPrice.trim()) {
    throw new Error("Apple's subscription price could not be verified.");
  }
  return { ...pkg, applePrice: price };
}

export function didVerifiedPriceChange(before: VerifiedPackage, after: VerifiedPackage): boolean {
  return before.product.identifier !== after.product.identifier ||
    before.product.subscriptionPeriod !== after.product.subscriptionPeriod ||
    before.storeContext.storefrontCountryCode !== after.storeContext.storefrontCountryCode ||
    before.applePrice.localizedPrice !== after.applePrice.localizedPrice ||
    before.applePrice.currencyCode !== after.applePrice.currencyCode;
}