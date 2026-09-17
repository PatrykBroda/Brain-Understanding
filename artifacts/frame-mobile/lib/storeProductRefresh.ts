import type {
  PurchasesPackage,
  PurchasesStoreProduct,
} from "react-native-purchases";

export type FreshPurchasesPackage = Omit<PurchasesPackage, "product"> & {
  readonly product: PurchasesStoreProduct;
  readonly storeContext: StoreProductContext;
};

type ProductIdentity = {
  readonly identifier: string;
};

type PriceIdentity = ProductIdentity & {
  readonly priceString: string;
  readonly currencyCode: string;
};

export type StoreProductContext = {
  readonly storefrontCountryCode: string | null;
  readonly loadedAt: string;
  readonly offeringPriceString: string;
  readonly offeringCurrencyCode: string;
};

export function shouldRefreshStoreProducts(appState: string): boolean {
  return appState === "active";
}

/**
 * Keep RevenueCat's offering/package context, but replace its potentially
 * cached product metadata with the latest product returned by StoreKit.
 */
export function attachFreshStoreProducts<
  TPackage extends { readonly product: ProductIdentity },
  TProduct extends ProductIdentity,
>(
  packages: readonly TPackage[],
  freshProducts: readonly TProduct[],
): Array<Omit<TPackage, "product"> & { readonly product: TProduct }> {
  const productsById = new Map(
    freshProducts.map((product) => [product.identifier, product]),
  );

  return packages.map((pkg) => {
    const freshProduct = productsById.get(pkg.product.identifier);
    if (!freshProduct) {
      throw new Error(
        `Current App Store pricing is unavailable for ${pkg.product.identifier}.`,
      );
    }
    return { ...pkg, product: freshProduct };
  });
}

export function assertPurchasedProductMatches(
  displayedProductId: string,
  purchasedProductId: string,
): void {
  if (displayedProductId !== purchasedProductId) {
    throw new Error(
      "The purchased App Store product did not match the price shown.",
    );
  }
}

export function didStoreProductChange(
  displayedProduct: PriceIdentity,
  refreshedProduct: PriceIdentity,
  displayedStorefrontCountryCode: string | null,
  refreshedStorefrontCountryCode: string | null,
): boolean {
  return (
    displayedProduct.identifier !== refreshedProduct.identifier ||
    displayedProduct.priceString !== refreshedProduct.priceString ||
    displayedProduct.currencyCode !== refreshedProduct.currencyCode ||
    displayedStorefrontCountryCode !== refreshedStorefrontCountryCode
  );
}