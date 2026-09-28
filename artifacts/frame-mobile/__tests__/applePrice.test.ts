import { beforeEach, describe, expect, it, vi } from "vitest";
import { didVerifiedPriceChange, verifyApplePrice, type VerifiedPackage } from "../lib/applePrice";
import type { FreshPurchasesPackage } from "../lib/storeProductRefresh";

const mocks = vi.hoisted(() => ({ apiGet: vi.fn() }));
vi.mock("../lib/api", () => ({ apiGet: mocks.apiGet }));

const pkg = {
  identifier: "$rc_monthly",
  product: {
    identifier: "com.frame.mobile.frameplus.monthly",
    subscriptionPeriod: "P1M",
    priceString: "$4.99",
    currencyCode: "USD",
  },
  storeContext: { storefrontCountryCode: "PL" },
} as FreshPurchasesPackage;

const applePrice = {
  productId: pkg.product.identifier,
  territory: "PL",
  currencyCode: "PLN",
  localizedPrice: "24,99 zł",
};

beforeEach(() => vi.resetAllMocks());

describe("paywall Apple price verification", () => {
  it("uses the current offering product and storefront, not StoreKit's USD price", async () => {
    mocks.apiGet.mockResolvedValue(applePrice);
    const verified = await verifyApplePrice(pkg);
    expect(mocks.apiGet).toHaveBeenCalledWith(
      "/billing/apple-price?productId=com.frame.mobile.frameplus.monthly&countryCode=PL",
    );
    expect(verified.applePrice).toEqual(applePrice);
    expect(verified.product.priceString).toBe("$4.99");
  });

  it("blocks an unknown storefront without calling the API", async () => {
    await expect(verifyApplePrice({
      ...pkg,
      storeContext: { ...pkg.storeContext, storefrontCountryCode: null },
    })).rejects.toThrow("App Store country");
    expect(mocks.apiGet).not.toHaveBeenCalled();
  });

  it.each([
    { ...applePrice, productId: "another.product" },
    { ...applePrice, territory: "US" },
    { ...applePrice, currencyCode: "not-a-currency" },
    { ...applePrice, localizedPrice: "" },
  ])("rejects price data that does not match the displayed plan", async (response) => {
    mocks.apiGet.mockResolvedValue(response);
    await expect(verifyApplePrice(pkg)).rejects.toThrow("could not be verified");
  });

  it("blocks purchase when Apple cannot verify the price", async () => {
    mocks.apiGet.mockRejectedValue(new Error("The current App Store price is unavailable."));
    await expect(verifyApplePrice(pkg)).rejects.toThrow("unavailable");
  });

  it("requires another tap when the checked price changes, not when USD metadata changes", () => {
    const before = { ...pkg, applePrice } as VerifiedPackage;
    const after = { ...before, product: { ...before.product, priceString: "$5.99" } };
    expect(didVerifiedPriceChange(before, after)).toBe(false);
    expect(didVerifiedPriceChange(before, {
      ...after,
      applePrice: { ...applePrice, localizedPrice: "29,99 zł" },
    })).toBe(true);
    expect(didVerifiedPriceChange(before, {
      ...after,
      storeContext: { ...pkg.storeContext, storefrontCountryCode: "DE" },
    })).toBe(true);
  });
});