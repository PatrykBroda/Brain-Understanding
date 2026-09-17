---
name: RevenueCat storefront price freshness
description: Why subscription cards must refresh StoreKit product metadata instead of trusting the product embedded in a cached RevenueCat offering.
---

Treat the RevenueCat offering as the authority for which product is available, but do not assume a fresh StoreKit product lookup is an authoritative localized price in TestFlight. Apple’s confirmation sheet is the only reliable transaction price in that environment.

**Why:** A TestFlight user continued to see `$4.99` on the in-app card while Apple’s confirmation sheet showed `24.99 zł`, even after calling RevenueCat `getProducts`. RevenueCat documents this as an Apple TestFlight/sandbox limitation: StoreKit metadata can return USD while the purchase sheet uses the correct local storefront.

**How to apply:** In beta-safe UI, avoid presenting the StoreKit metadata amount as guaranteed; direct users to Apple’s confirmation for the exact local price. Still refresh on open/foreground and immediately before purchase, log privacy-safe storefront/currency metadata, block on metadata changes, and verify product identity.