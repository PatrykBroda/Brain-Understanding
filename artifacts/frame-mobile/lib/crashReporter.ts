import { Platform } from "react-native";
import Constants from "expo-constants";

import { APP_DOMAIN, resolveCrashUrl } from "./appDomain";
import type { ShownPriceReport } from "./applePrice";

const APP_VERSION = Constants.expoConfig?.version ?? "unknown";
const BUILD_VERSION = Constants.expoConfig?.ios?.buildNumber ?? null;

// Baseline for elapsed-time measurements: when this module was evaluated
// (≈ JS bundle start). Every probe reports ms since launch so slow phases
// show up directly in server logs.
const LAUNCH_TS = Date.now();

export function msSinceLaunch(): number {
  return Date.now() - LAUNCH_TS;
}

/**
 * Derives the crash-log URL from EXPO_PUBLIC_DOMAIN, or null when that secret
 * was not provisioned to the build. Works before setApiBase() is called
 * (pre-Clerk, pre-font). Uses globalThis.fetch (not expo/fetch) so it runs at
 * module level.
 *
 * There is deliberately no hardcoded fallback. The previous one pointed at the
 * Replit *dev workspace* domain while calling itself "production", so shipped
 * TestFlight builds posted their diagnostics to a dev host. A build with no
 * domain cannot reach the server at all — that is now surfaced by the blocking
 * startup screen in app/_layout.tsx, not papered over here.
 */
function getCrashUrl(): string | null {
  return resolveCrashUrl(APP_DOMAIN);
}

async function post(body: object): Promise<void> {
  const url = getCrashUrl();
  if (!url) return;
  try {
    await globalThis.fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    // best-effort — never throw from crash reporter
  }
}

/**
 * Report a React render crash caught by an ErrorBoundary.
 * Call from componentDidCatch.
 */
export function reportCrash(error: Error, context: string): void {
  void post({
    type: "crash",
    message: error.message,
    stack: error.stack ?? "",
    context,
    appVersion: APP_VERSION,
    platform: Platform.OS,
    ts: new Date().toISOString(),
  });
}

/**
 * Fire-and-forget startup probe — call once from the root layout on mount.
 * Lets us confirm the app is actually launching and where it got to.
 */
export function reportStartup(context: string): void {
  void post({
    type: "startup",
    context: `${context} | +${msSinceLaunch()}ms`,
    appVersion: APP_VERSION,
    platform: Platform.OS,
    ts: new Date().toISOString(),
  });
}

/**
 * Fire-and-forget layout probe — reports real on-device measured sizes so
 * rendering bugs (zero-height text, squashed rows) show up in server logs.
 */
export function reportLayout(context: string): void {
  void post({
    type: "layout",
    context: `${context} | +${msSinceLaunch()}ms`,
    appVersion: APP_VERSION,
    platform: Platform.OS,
    ts: new Date().toISOString(),
  });
}

export type BillingDiagnostic = {
  stage: "load" | "prepurchase" | "changed";
  packageIdentifier: string;
  productIdentifier: string;
  offeringPriceString: string;
  offeringCurrencyCode: string;
  storePriceString: string;
  storeCurrencyCode: string;
  storefrontCountryCode: string | null;
  storeKitMode: "STOREKIT_2";
  loadedAt: string;
};

/** Privacy-safe StoreKit metadata only: never include receipts or account IDs. */
export function reportBillingDiagnostic(diagnostic: BillingDiagnostic): void {
  void post({
    type: "billing",
    billing: diagnostic,
    appVersion: APP_VERSION,
    buildVersion: BUILD_VERSION,
    platform: Platform.OS,
    ts: new Date().toISOString(),
  });
}

/** What the paywall card showed. The server judges it and posts to Discord. */
export function reportPriceShown(price: ShownPriceReport): void {
  void post({
    type: "price",
    price,
    appVersion: APP_VERSION,
    buildVersion: BUILD_VERSION,
    platform: Platform.OS,
    ts: new Date().toISOString(),
  });
}
