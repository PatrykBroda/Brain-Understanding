/**
 * Thin wrapper around react-native-purchases (RevenueCat) for FRAME+.
 *
 * Payments are Apple In-App Purchase. RevenueCat is the client SDK + the
 * server-side entitlement source of truth (its webhook updates the API's
 * users cache). The RevenueCat app user id is set to our own auth user id so
 * webhook events map straight back to the account.
 *
 * Native-only: the SDK has no web implementation, so every export is a safe
 * no-op on web (the app also builds for web via `expo export -p web`).
 */
import { Platform } from "react-native";
import Purchases, {
  LOG_LEVEL,
  type CustomerInfo,
  type PurchasesPackage,
} from "react-native-purchases";

/** Must match the entitlement identifier configured in the RevenueCat dashboard. */
export const FRAME_PLUS_ENTITLEMENT_ID = "frame_plus";

const IOS_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY ?? "";

let configured = false;

export function isPurchasesSupported(): boolean {
  return Platform.OS === "ios" || Platform.OS === "android";
}

/** Configure the SDK once, keyed to the signed-in user id (or anonymous). */
export function configurePurchases(appUserId: string | null): void {
  if (!isPurchasesSupported() || configured) return;
  if (!IOS_API_KEY) {
    console.warn("EXPO_PUBLIC_REVENUECAT_IOS_KEY not set — purchases disabled");
    return;
  }
  Purchases.setLogLevel(LOG_LEVEL.WARN);
  Purchases.configure({
    apiKey: IOS_API_KEY,
    appUserID: appUserId ?? undefined,
  });
  configured = true;
}

/** Align the RevenueCat identity with the signed-in user (call on auth change). */
export async function syncPurchasesUser(appUserId: string | null): Promise<void> {
  if (!isPurchasesSupported() || !configured) return;
  try {
    if (appUserId) {
      await Purchases.logIn(appUserId);
    } else {
      await Purchases.logOut();
    }
  } catch (err) {
    // logOut throws for an already-anonymous user — harmless.
    console.warn("Purchases identity sync failed", err);
  }
}

/** The purchasable packages from the current RevenueCat offering. */
export async function getFramePlusPackages(): Promise<PurchasesPackage[]> {
  if (!isPurchasesSupported()) return [];
  const offerings = await Purchases.getOfferings();
  return offerings.current?.availablePackages ?? [];
}

export function hasFramePlus(info: CustomerInfo | null | undefined): boolean {
  return !!info?.entitlements.active[FRAME_PLUS_ENTITLEMENT_ID];
}

export async function purchasePackage(
  pkg: PurchasesPackage,
): Promise<CustomerInfo> {
  const { customerInfo } = await Purchases.purchasePackage(pkg);
  return customerInfo;
}

export async function restorePurchases(): Promise<CustomerInfo> {
  return Purchases.restorePurchases();
}

export type { CustomerInfo, PurchasesPackage };
