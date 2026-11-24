/**
 * Navigation policy for the Analyse WebView (onShouldStartLoadWithRequest).
 *
 * iOS calls that hook for SUB-FRAME loads (iframes) too. The old policy
 * treated every off-origin https URL as "open in Safari", so an embedded
 * iframe (e.g. https://js.stripe.com/.../controller-with-preconnect.html)
 * was thrown out to the browser as a blank white page with a Stripe box,
 * and the analysis never ran. Only genuine top-frame navigations (the user
 * tapping a link) may leave the app; iframes load in place.
 */
export type WebViewNavDecision = "allow" | "block" | "external";

export interface WebViewNavRequest {
  url: string;
  /** iOS only; undefined on Android (treated as top-frame, as before). */
  isTopFrame?: boolean;
}

/** Payment-provider hosts are never opened as a bounce-out page. */
const NEVER_EXTERNAL_HOSTS = [/(^|\.)stripe\.com$/i, /(^|\.)stripe\.network$/i];

export function decideWebViewNav(request: WebViewNavRequest, origin: string | null): WebViewNavDecision {
  const { url } = request;
  if (url === "about:blank" || url.startsWith("about:srcdoc") || url.startsWith("blob:") || url.startsWith("data:")) return "allow";
  if (origin && (url === origin || url.startsWith(`${origin}/`))) return "allow";
  // Sub-frames (iframes, payment/consent widgets) always load inside the page.
  if (request.isTopFrame === false) return "allow";
  if (!url.startsWith("https://")) return "block";
  let host = "";
  try {
    host = new URL(url).hostname;
  } catch {
    return "block";
  }
  if (NEVER_EXTERNAL_HOSTS.some((re) => re.test(host))) return "block";
  return "external";
}
