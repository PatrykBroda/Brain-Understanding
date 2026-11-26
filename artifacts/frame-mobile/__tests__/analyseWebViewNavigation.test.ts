import { describe, expect, it } from "vitest";
import { ANALYSE_LOAD_TIMEOUT_MS, ANALYSE_READY_MESSAGE, classifyAnalyseNavigation, isWrongAnalysePage } from "../lib/analyseWebViewNavigation";

const origin = "https://brain-understanding.replit.app";

describe("Analyse WebView navigation", () => {
  it("keeps third-party iframes inside the WebView", () => {
    expect(
      classifyAnalyseNavigation(
        {
          url: "https://js.stripe.com/v3/m-outer.html#url=https%3A%2F%2Fbrain-understanding.replit.app%2Fmobile%2Fanalyse",
          isTopFrame: false,
        },
        origin,
      ),
    ).toEqual({ action: "allow" });
  });

  it("blocks Stripe's device-check page if iOS reports it as a popup", () => {
    expect(
      classifyAnalyseNavigation(
        {
          url: "https://js.stripe.com/v3/m-outer-0edadf75b42c6ef7240c043f3272f3f9.html#url=https%3A%2F%2Fbrain-understanding.replit.app%2Fmobile%2Fanalyse%3FframeMobile%3D1",
          isTopFrame: true,
        },
        origin,
      ),
    ).toEqual({ action: "block" });
  });

  it("opens a top-level external link outside the app", () => {
    const url = "https://example.com/help";
    expect(classifyAnalyseNavigation({ url, isTopFrame: true }, origin)).toEqual({
      action: "openExternal",
      url,
    });
  });

  it("keeps same-origin routes and blank frames embedded", () => {
    expect(
      classifyAnalyseNavigation(
        { url: `${origin}/analyse?frameMobile=1`, isTopFrame: true },
        origin,
      ),
    ).toEqual({ action: "allow" });
    expect(classifyAnalyseNavigation({ url: "about:blank", isTopFrame: false }, origin)).toEqual({
      action: "allow",
    });
  });

  it("blocks non-HTTPS top-level navigation", () => {
    expect(classifyAnalyseNavigation({ url: "javascript:alert(1)", isTopFrame: true }, origin)).toEqual({
      action: "block",
    });
  });
});

describe("Analyse WebView wrong-page guard", () => {
  it("flags the app's own Expo web build (what a deploy without the coach serves for /analyse)", () => {
    expect(isWrongAnalysePage(`${origin}/mobile/analyse?frameMobile=1`, origin)).toBe(true);
    expect(isWrongAnalysePage(`${origin}/mobile`, origin)).toBe(true);
    expect(isWrongAnalysePage(`${origin}/mobile/`, origin)).toBe(true);
  });

  it("accepts the coach Analyse page and off-site frames", () => {
    expect(isWrongAnalysePage(`${origin}/analyse?frameMobile=1`, origin)).toBe(false);
    expect(isWrongAnalysePage(`${origin}/mobileish`, origin)).toBe(false);
    expect(isWrongAnalysePage("https://js.stripe.com/v3/m-outer.html", origin)).toBe(false);
    expect(isWrongAnalysePage(`${origin}/mobile/analyse`, null)).toBe(false);
  });

  it("has a ready message and a bounded load timeout", () => {
    expect(ANALYSE_READY_MESSAGE).toBe("frame-analyse-ready");
    expect(ANALYSE_LOAD_TIMEOUT_MS).toBeGreaterThan(10000);
    expect(ANALYSE_LOAD_TIMEOUT_MS).toBeLessThanOrEqual(60000);
  });
});
