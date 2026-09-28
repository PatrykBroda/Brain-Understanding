import {
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  configure: vi.fn(),
  getOfferings: vi.fn(),
  getProducts: vi.fn(),
  getStorefront: vi.fn(),
  purchaseStoreProduct: vi.fn(),
  reportBillingDiagnostic: vi.fn(),
  setLogLevel: vi.fn(),
}));

vi.mock("../lib/api", () => ({
  apiGet: mocks.apiGet,
}));

vi.mock("react-native", () => ({
  Platform: { OS: "ios" },
}));

vi.mock("react-native-purchases", () => ({
  default: {
    configure: mocks.configure,
    getOfferings: mocks.getOfferings,
    getProducts: mocks.getProducts,
    getStorefront: mocks.getStorefront,
    purchaseStoreProduct: mocks.purchaseStoreProduct,
    setLogLevel: mocks.setLogLevel,
  },
  LOG_LEVEL: { WARN: "WARN" },
  STOREKIT_VERSION: { STOREKIT_2: "STOREKIT_2" },
}));

vi.mock("../lib/crashReporter", () => ({
  reportBillingDiagnostic: mocks.reportBillingDiagnostic,
}));

type PurchasesModule = typeof import("../lib/purchases");
let purchases: PurchasesModule;
let applePrice: typeof import("../lib/applePrice");

const offeredProduct = {
  identifier: "app.replit.frame.monthly",
  title: "FRAME+",
  priceString: "$4.99",
  currencyCode: "USD",
  productCategory: "SUBSCRIPTION",
  productType: "AUTO_RENEWABLE_SUBSCRIPTION",
  subscriptionPeriod: "P1M",
};

const freshProduct = {
  ...offeredProduct,
  priceString: "24,99 zł",
  currencyCode: "PLN",
};

const offeredPackage = {
  identifier: "$rc_monthly",
  packageType: "MONTHLY",
  product: offeredProduct,
  offeringIdentifier: "default",
  presentedOfferingContext: { offeringIdentifier: "default" },
  webCheckoutUrl: null,
};

beforeAll(async () => {
  vi.stubEnv("EXPO_PUBLIC_REVENUECAT_IOS_KEY", "test_revenuecat_key");
  purchases = await import("../lib/purchases");
  applePrice = await import("../lib/applePrice");
  purchases.configurePurchases("test-user");
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getOfferings.mockResolvedValue({
    current: { availablePackages: [offeredPackage] },
  });
  mocks.getProducts.mockResolvedValue([freshProduct]);
  mocks.getStorefront.mockResolvedValue({ countryCode: "PL" });
});

describe("RevenueCat StoreKit contract", () => {
  it("loads a GBR plan, verifies Apple's price twice, and ignores stale USD product metadata", async () => {
    mocks.getStorefront.mockResolvedValue({ countryCode: "GBR" });
    mocks.getProducts.mockResolvedValue([offeredProduct]);
    const ukPrice = {
      productId: offeredProduct.identifier,
      territory: "GBR",
      currencyCode: "GBP",
      localizedPrice: "£7.99",
    };
    mocks.apiGet.mockResolvedValue(ukPrice);

    const [offeringPackage] = await purchases.getFramePlusPackages();
    const displayed = await applePrice.verifyApplePrice(offeringPackage);
    const prepared = await purchases.preparePackageForPurchase(displayed);
    const checked = await applePrice.verifyApplePrice(prepared.pkg);

    expect(prepared.status).toBe("ready");
    expect(mocks.apiGet).toHaveBeenCalledTimes(2);
    expect(mocks.apiGet).toHaveBeenCalledWith(
      `/billing/apple-price?productId=${offeredProduct.identifier}&countryCode=GBR`,
    );
    expect(displayed.applePrice).toEqual(ukPrice);
    expect(checked.product.currencyCode).toBe("USD");
    expect(applePrice.didVerifiedPriceChange(displayed, checked)).toBe(false);
    expect(mocks.purchaseStoreProduct).not.toHaveBeenCalled();
  });

  it("loads the offered product from StoreKit and records its storefront", async () => {
    const [pkg] = await purchases.getFramePlusPackages();

    expect(mocks.getOfferings).toHaveBeenCalledOnce();
    expect(mocks.getProducts).toHaveBeenCalledWith([
      "app.replit.frame.monthly",
    ]);
    expect(mocks.getStorefront).toHaveBeenCalledOnce();
    expect(pkg.product).toBe(freshProduct);
    expect(pkg.storeContext).toMatchObject({
      storefrontCountryCode: "PL",
      offeringPriceString: "$4.99",
      offeringCurrencyCode: "USD",
    });
    expect(mocks.reportBillingDiagnostic).toHaveBeenCalledWith(
      expect.objectContaining({
        stage: "load",
        storefrontCountryCode: "PL",
        storePriceString: "24,99 zł",
        storeCurrencyCode: "PLN",
      }),
    );
  });

  it("blocks checkout when StoreKit changes the displayed price or storefront", async () => {
    const [pkg] = await purchases.getFramePlusPackages();
    mocks.getProducts.mockResolvedValue([
      {
        ...freshProduct,
        priceString: "€5.99",
        currencyCode: "EUR",
      },
    ]);
    mocks.getStorefront.mockResolvedValue({ countryCode: "DE" });

    const result = await purchases.preparePackageForPurchase(pkg);

    expect(result.status).toBe("changed");
    expect(result.pkg.product.priceString).toBe("€5.99");
    expect(mocks.purchaseStoreProduct).not.toHaveBeenCalled();
    expect(mocks.reportBillingDiagnostic).toHaveBeenCalledWith(
      expect.objectContaining({ stage: "changed" }),
    );
  });

  it("purchases only the product that passed the immediate recheck", async () => {
    const [pkg] = await purchases.getFramePlusPackages();
    const preparation = await purchases.preparePackageForPurchase(pkg);
    expect(preparation.status).toBe("ready");
    mocks.purchaseStoreProduct.mockResolvedValue({
      productIdentifier: freshProduct.identifier,
      customerInfo: { entitlements: { active: {} } },
    });

    if (preparation.status !== "ready") {
      throw new Error("Expected the unchanged StoreKit product to be ready.");
    }
    await purchases.purchasePackage(preparation.pkg);

    expect(mocks.purchaseStoreProduct).toHaveBeenCalledWith(freshProduct);
  });
});