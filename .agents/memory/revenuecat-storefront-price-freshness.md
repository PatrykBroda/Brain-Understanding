---
name: RevenueCat storefront price freshness
description: Why TestFlight subscription metadata may disagree with Apple's sheet, and why hiding the price is not an App Review-compliant workaround.
---

StoreKit's storefront country uses ISO 3166-1 **alpha-3** (`GBR`, `USA`), unlike many country APIs that expect alpha-2. TestFlight purchases use Apple's sandbox, where a Sandbox Apple Account's region can differ from the production Media & Purchases account.

**Why:** A UK Media & Purchases account's TestFlight build reported `USA` and USD product metadata; an alpha-2-only check hid every plan before it could request an Apple price. Replacing `USA` with `GBR` based on the device's location or production account would be an unjustified currency override.

**How to apply:** Validate actual StoreKit alpha-3 codes against Apple's territory list. When the reported TestFlight storefront disagrees with the expected account, inspect the signed-in Sandbox Apple Account's country in App Store Connect, sign out and back in after changing it, and compare the in-app price with the purchase sheet on that same account.

Treat the RevenueCat offering as the authority for which product is available, but do not assume a fresh StoreKit product lookup is an authoritative localized price in TestFlight. Apple's confirmation sheet can be the only reliable transaction price there, but App Review requires a price **in the app before purchase**.

**Why:** A TestFlight user continued to see `$4.99` on the in-app card while Apple’s confirmation sheet showed `24.99 zł`, even after calling RevenueCat `getProducts`. RevenueCat documents this as an Apple TestFlight/sandbox limitation. Removing the number avoided a false price but Apple subsequently rejected the resulting no-price card under Guideline 3.1.2(c).

**How to apply:** Neither an unpriced card nor an amount known to disagree with Apple’s sheet is an acceptable release fix. Validate any alternative (including Apple's SubscriptionStoreView, which also loads product data from the App Store) against the affected physical TestFlight storefront before adopting it. Keep privacy-safe diagnostics and product-identity checks; do not infer success from a web build, sandbox mock, or purchase completing.