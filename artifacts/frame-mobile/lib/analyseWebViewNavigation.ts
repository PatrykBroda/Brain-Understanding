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
