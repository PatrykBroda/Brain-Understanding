import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  auditCharged,
  auditShown,
  judgeCharged,
  judgeShown,
  resetPriceAudit,
  shouldNotify,
  shownFor,
  type ShownPrice,
} from "../lib/priceAudit";

const shown = (over: Partial<ShownPrice> = {}): ShownPrice => ({
  stage: "shown",
  productIdentifier: "com.frame.mobile.frameplus.monthly",
  storefrontCountryCode: "GBR",
  displayedTerritory: "GBR",
  displayedCurrencyCode: "GBP",
  displayedPrice: "£4.99",
  displayedAmount: 4.99,
  storePriceString: "£4.99",
  storeCurrencyCode: "GBP",
  ...over,
});

describe("paywall price audit", () => {
  beforeEach(() => {
    resetPriceAudit();
    vi.unstubAllEnvs();
  });

  it("calls a card that agrees with StoreKit a match", () => {
    const v = judgeShown(shown(), { appVersion: "1.2.0", buildVersion: "41" });
    expect(v.ok).toBe(true);
    expect(v.text).toContain("MATCH");
    expect(v.text).toContain("build 1.2.0 (41)");
  });

  it("flags the reported case: USA storefront card while StoreKit bills GBP", () => {
    const v = judgeShown(shown({
      storefrontCountryCode: "USA", displayedTerritory: "USA",
      displayedCurrencyCode: "USD", displayedPrice: "$4.99",
    }));
    expect(v.ok).toBe(false);
    expect(v.text).toContain("MISMATCH");
    expect(v.text).toContain("device storefront USA");
  });

  it("judges the real charge against what the card showed", () => {
    const usCard = shown({ displayedCurrencyCode: "USD", displayedPrice: "$4.99", storefrontCountryCode: "USA" });
    const charge = { type: "INITIAL_PURCHASE", productId: usCard.productIdentifier, currency: "GBP", amount: 4.99, countryCode: "GB", environment: "SANDBOX" };
    const wrong = judgeCharged(charge, usCard);
    expect(wrong.ok).toBe(false);
    expect(wrong.text).toContain("WRONG PRICE");
    expect(judgeCharged(charge, shown()).ok).toBe(true);
    expect(judgeCharged({ ...charge, amount: 5.99 }, shown()).ok).toBe(false);
    expect(judgeCharged(charge, null).text).toContain("no paywall price");
  });

  it("remembers the last shown price for 30 minutes only", () => {
    const t0 = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(t0);
    auditShown(shown());
    expect(shownFor(shown().productIdentifier, t0 + 60_000)?.displayedPrice).toBe("£4.99");
    expect(shownFor(shown().productIdentifier, t0 + 31 * 60_000)).toBeNull();
    vi.restoreAllMocks();
  });

  it("dedupes repeat paywall opens but not purchases", async () => {
    vi.stubEnv("PRICE_AUDIT_URL", "https://dnz.test/api/frame-price-audit");
    vi.stubEnv("PRICE_AUDIT_TOKEN", "sink-token");
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    auditShown(shown());
    auditShown(shown());
    auditShown(shown({ stage: "prepurchase" }));
    auditCharged({ type: "INITIAL_PURCHASE", productId: shown().productIdentifier, currency: "GBP", amount: 4.99, countryCode: "GB", environment: "SANDBOX" });
    await new Promise((r) => setTimeout(r, 0));
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const [, init] = fetchMock.mock.calls[2] as unknown as [string, RequestInit];
    const body = JSON.parse(String(init.body));
    expect(body.text).toContain("CORRECT");
    expect(body.ok).toBe(true);
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer sink-token");
    vi.unstubAllGlobals();
  });

  it("dedupe window expires", () => {
    expect(shouldNotify("k", 0)).toBe(true);
    expect(shouldNotify("k", 1000)).toBe(false);
    expect(shouldNotify("k", 16 * 60_000)).toBe(true);
  });
});
