import { describe, expect, it } from "vitest";
import { classifyAnalyseNavigation } from "../lib/analyseWebViewNavigation";

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
