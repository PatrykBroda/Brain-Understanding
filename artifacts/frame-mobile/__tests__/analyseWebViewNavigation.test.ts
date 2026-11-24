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
