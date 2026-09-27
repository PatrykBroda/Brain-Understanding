import { apiGet } from "./api";
import type { FreshPurchasesPackage } from "./storeProductRefresh";

export type VerifiedPackage = FreshPurchasesPackage & {
  applePrice: {
    productId: string;
    territory: string;
    currencyCode: string;
    localizedPrice: string;
  };
};

/** Apple Connect's scheduled new-subscriber price, not StoreKit's potentially
 * USD TestFlight product metadata. Never fall back to a StoreKit amount. */
export async function verifyApplePrice(pkg: FreshPurchasesPackage): Promise<VerifiedPackage> {
  const countryCode = pkg.storeContext.storefrontCountryCode;
  if (!countryCode || !/^[A-Z]{2}$/.test(countryCode)) {
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