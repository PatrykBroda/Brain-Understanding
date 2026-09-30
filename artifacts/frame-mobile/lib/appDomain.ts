/**
 * Single source of truth for the API host.
 *
 * Why this module exists: `EXPO_PUBLIC_DOMAIN` is inlined at build time, and
 * `eas.json` only *forwards* it (`"EXPO_PUBLIC_DOMAIN": "$EXPO_PUBLIC_DOMAIN"`)
 * — it does not define it. If the EAS secret is missing, the variable is an
 * empty string in the shipped bundle. Before this module, that failure was
 * silent: `setApiBase()` was never called, `_base` stayed `""`, every request
 * went to a relative path, `/billing/apple-price` failed, and the paywall
 * rendered with no amount — which is exactly the Guideline 3.1.2(c) rejection.
 * The required Privacy / Terms links became `openURL("/privacy")` and did
 * nothing. Nothing crashed and nothing was logged.
 *
 * So: resolution lives here, it is pure and unit-tested, and a missing domain
 * is a loud, visible failure at startup instead of an unpriced paywall.
 *
 * Deliberately free of react-native imports so it can be tested directly.
 */

/**
 * Strips whatever shape the domain arrives in down to a bare host.
 * Replit hands these out variously as `host`, `https://host` and `host/`.
 */
export function normaliseDomain(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/+$/, "")
    .trim();
}

export type ApiBaseInput = {
  /** Value of EXPO_PUBLIC_DOMAIN as seen by the bundle. */
  domain: string | null | undefined;
  /** `window.location.origin` on web; null/undefined on native. */
  windowOrigin?: string | null;
};

/**
 * Returns the absolute API base, or `null` when it cannot be determined.
 *
 * Returning `null` rather than `""` is the point: `""` silently produces
 * working-looking relative URLs, `null` forces every caller to handle the
 * failure.
 */
export function resolveApiBase({ domain, windowOrigin }: ApiBaseInput): string | null {
  if (windowOrigin) return `${windowOrigin.replace(/\/+$/, "")}/api`;
  const host = normaliseDomain(domain);
  return host ? `https://${host}/api` : null;
}

/** Crash/diagnostic endpoint, or `null` when there is no domain to reach. */
export function resolveCrashUrl(domain: string | null | undefined): string | null {
  const host = normaliseDomain(domain);
  return host ? `https://${host}/api/crash-log` : null;
}

/** The domain this bundle was built with. Empty string means "not provisioned". */
export const APP_DOMAIN = normaliseDomain(process.env.EXPO_PUBLIC_DOMAIN);
