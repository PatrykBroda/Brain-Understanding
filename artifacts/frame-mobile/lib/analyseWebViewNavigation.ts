export type AnalyseNavigationRequest = {
  url: string;
  isTopFrame: boolean;
};

export type AnalyseNavigationDecision =
  | { action: "allow" }
  | { action: "block" }
  | { action: "openExternal"; url: string };

function isStripeDeviceCheckUrl(url: string): boolean {
  return /^https:\/\/js\.stripe\.com\/v3\/m-outer(?:-[a-z0-9]+)?\.html(?:[?#]|$)/i.test(url);
}

/**
 * Keep embedded third-party documents (for example Stripe's hidden fraud-check
 * iframe) inside the WebView. Never open that internal page as a browser window.
 * Only other top-level off-site links should leave the app.
 */
export function classifyAnalyseNavigation(
  request: AnalyseNavigationRequest,
  origin: string | null,
): AnalyseNavigationDecision {
  if (isStripeDeviceCheckUrl(request.url)) {
    return request.isTopFrame ? { action: "block" } : { action: "allow" };
  }
  if (!request.isTopFrame || request.url === "about:blank") {
    return { action: "allow" };
  }
  if (origin && request.url.startsWith(`${origin}/`)) {
    return { action: "allow" };
  }
  if (request.url.startsWith("https://")) {
    return { action: "openExternal", url: request.url };
  }
  return { action: "block" };
}

/** Posted by the coach's Analyse page (window.ReactNativeWebView.postMessage) once it has mounted. */
export const ANALYSE_READY_MESSAGE = "frame-analyse-ready";

/** How long the WebView may take to report ready before the app shows "Can't load analyse" + retry. */
export const ANALYSE_LOAD_TIMEOUT_MS = 30000;

/**
 * True when the WebView is sitting on the wrong site: the app's own Expo web build (under /mobile/)
 * instead of the coach's Analyse page. That is what a deployment with no coach web app serves for
 * /analyse (SPA fallback), and it shows an endless "Loading" screen inside the WebView.
 */
export function isWrongAnalysePage(url: string, origin: string | null): boolean {
  if (!origin || !url.startsWith(`${origin}/`)) return false;
  const path = url.slice(origin.length);
  return path === "/mobile" || path.startsWith("/mobile/") || path.startsWith("/mobile?");
}
