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
import { getSubscriptionPeriodLabel } from "./subscriptionDisclosure";

/** Must match the entitlement identifier configured in the RevenueCat dashboard. */
export const FRAME_PLUS_ENTITLEMENT_ID = "frame_plus";

const IOS_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY ?? "";

let configured = false;

export function isPurchasesSupported(): boolean {
  return (Platform.OS === "ios" || Platform.OS === "android") && Boolean(IOS_API_KEY);
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
  if (!configured) {
    throw new Error("Subscriptions are not configured in this build.");
  }
  const offerings = await Purchases.getOfferings();
  if (!offerings.current) {
    throw new Error("No current subscription offering is configured.");
  }
  if (offerings.current.availablePackages.length === 0) {
    throw new Error("The current subscription offering has no available plans.");
  }
  const packages = offerings.current.availablePackages.filter((pkg) => {
    const hasPeriod = getSubscriptionPeriodLabel(pkg) !== null;
    if (!hasPeriod) {
      console.warn(
        `Ignoring subscription package ${pkg.identifier}: no valid billing period was returned by the App Store.`,
      );
    }
    return hasPeriod;
  });
  if (packages.length === 0) {
    throw new Error("Subscription periods could not be loaded from the App Store.");
  }
  return packages;
}

export function hasFramePlus(info: CustomerInfo | null | undefined): boolean {
  return !!info?.entitlements.active[FRAME_PLUS_ENTITLEMENT_ID];
}

export async function purchasePackage(
  pkg: PurchasesPackage,
): Promise<CustomerInfo> {
  if (!configured) {
    throw new Error("Subscriptions are not configured in this build.");
  }
  const { customerInfo } = await Purchases.purchasePackage(pkg);
  return customerInfo;
}

export async function restorePurchases(): Promise<CustomerInfo> {
  if (!configured) {
    throw new Error("Subscriptions are not configured in this build.");
  }
  return Purchases.restorePurchases();
}

export type { CustomerInfo, PurchasesPackage };
export {
  formatSubscriptionRenewal,
  getSubscriptionPeriodLabel,
  getSubscriptionPlanLabel,
} from "./subscriptionDisclosure";
