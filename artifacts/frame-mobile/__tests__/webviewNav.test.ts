import { describe, expect, it } from "vitest";
import { decideWebViewNav } from "../lib/webviewNav";

const origin = "https://frame.example.app";
describe("decideWebViewNav", () => {
  it("allows the app origin and about:blank", () => {
    expect(decideWebViewNav({ url: `${origin}/analyse?frameMobile=1`, isTopFrame: true }, origin)).toBe("allow");
    expect(decideWebViewNav({ url: "about:blank" }, origin)).toBe("allow");
  });
  it("never bounces an iframe (js.stripe.com) out to Safari", () => {
    const url = "https://js.stripe.com/v3/controller-with-preconnect-abc.html";
    expect(decideWebViewNav({ url, isTopFrame: false }, origin)).toBe("allow");
  });
  it("never opens a Stripe page even as a top-frame navigation", () => {
    expect(decideWebViewNav({ url: "https://js.stripe.com/v3/", isTopFrame: true }, origin)).toBe("block");
    expect(decideWebViewNav({ url: "https://checkout.stripe.com/c/pay/x" }, origin)).toBe("block");
  });
  it("opens ordinary top-frame https links externally, blocks other schemes", () => {
    expect(decideWebViewNav({ url: "https://example.org/terms", isTopFrame: true }, origin)).toBe("external");
    expect(decideWebViewNav({ url: "http://example.org", isTopFrame: true }, origin)).toBe("block");
    expect(decideWebViewNav({ url: "javascript:alert(1)", isTopFrame: true }, origin)).toBe("block");
  });
  it("does not treat a look-alike origin prefix as same-origin", () => {
    expect(decideWebViewNav({ url: `${origin}.evil.com/x`, isTopFrame: true }, origin)).toBe("external");
  });
});
