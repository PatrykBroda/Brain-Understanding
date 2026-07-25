import { Platform } from "react-native";

const APP_VERSION = "1.0.1";

/**
 * Derives the crash-log URL directly from the build-time env var so this works
 * even before setApiBase() is called (i.e. before Clerk and fonts load).
 * Uses globalThis.fetch (not expo/fetch) so it runs at module level.
 */
function getCrashUrl(): string {
  const domain = process.env.EXPO_PUBLIC_DOMAIN ?? "";
  if (!domain) return "";
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
    context,
    appVersion: APP_VERSION,
    platform: Platform.OS,
    ts: new Date().toISOString(),
  });
}
