import { Platform } from "react-native";

const APP_VERSION = "1.0.3";

// Baseline for elapsed-time measurements: when this module was evaluated
// (≈ JS bundle start). Every probe reports ms since launch so slow phases
// show up directly in server logs.
const LAUNCH_TS = Date.now();

export function msSinceLaunch(): number {
  return Date.now() - LAUNCH_TS;
}

// Hardcoded production domain as fallback so logs always reach the server
// even if the EXPO_PUBLIC_DOMAIN EAS secret wasn't provisioned.
const FALLBACK_DOMAIN = "6b386eea-50e2-4d17-95f3-b6714c4e8099-00-nzahz4fd7fpp.riker.replit.dev";

/**
 * Derives the crash-log URL from env var, falling back to the hardcoded
 * production domain. Works before setApiBase() is called (pre-Clerk, pre-font).
 * Uses globalThis.fetch (not expo/fetch) so it runs at module level.
 */
function getCrashUrl(): string {
  const domain = process.env.EXPO_PUBLIC_DOMAIN ?? FALLBACK_DOMAIN;
  return `https://${domain}/api/crash-log`;
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
