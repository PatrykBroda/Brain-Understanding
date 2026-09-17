---
name: RevenueCat storefront price freshness
description: Why subscription cards must refresh StoreKit product metadata instead of trusting the product embedded in a cached RevenueCat offering.
---

Treat the RevenueCat offering as the authority for which product is available, but treat a fresh StoreKit product lookup as the authority for the displayed localized price. Purchase the same refreshed product object whose price was shown.

**Why:** A TestFlight user saw `$4.99` on the in-app card while Apple’s confirmation sheet showed `24.99 zł` for the same product. The product metadata embedded in the offering was stale for the active storefront even though Apple’s purchase sheet was current.

**How to apply:** Refresh store products when opening a subscription screen and whenever the app returns to the foreground. Clear displayed prices while refreshing, fail closed if an offered product is missing from the fresh response, and verify the purchased product identifier matches the displayed one.