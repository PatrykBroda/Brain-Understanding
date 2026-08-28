# FRAME App Review checklist

Use this checklist for the next iOS submission. Code changes alone cannot submit
Apple products or complete App Store Connect metadata.

## Billing contract

- Bundle identifier: `app.replit.frame`
- RevenueCat entitlement: `frame_plus`
- Mobile public key variable: `EXPO_PUBLIC_REVENUECAT_IOS_KEY`
- Source of plans and localized prices: RevenueCat's current offering
- Purchase provider: Apple In-App Purchase through `react-native-purchases`

Do not create replacement products just to clear a warning. First compare the
existing Apple product identifiers with the products attached to RevenueCat's
current offering.

## RevenueCat

- Confirm the iOS app uses bundle ID `app.replit.frame`.
- Confirm App Store Connect credentials are valid.
- Import the intended Apple auto-renewable subscription products.
- Attach every product to a package in the current offering.
- Attach every intended product to the `frame_plus` entitlement.
- Confirm the production public SDK key is the value supplied to
  `EXPO_PUBLIC_REVENUECAT_IOS_KEY` during the production EAS build.

## App Store Connect

Verified RevenueCat product currently attached to the FRAME+ monthly package:

- `com.frame.mobile.frameplus.monthly`

For every subscription shown in FRAME:

- Put it in the correct subscription group.
- Complete duration, availability, pricing and tax category.
- Complete every required localization (display name and description).
- Upload an App Review screenshot that shows the FRAME+ paywall and its plans.
- Resolve every **Missing Metadata** warning.
- Confirm Agreements, Tax and Banking has no blocking action.
- Select the subscription products for the new app version and submit them for
  review together with a new production binary.

## Physical-device verification

Install the new build through TestFlight and use an Apple Sandbox tester:

1. Open FRAME+ and confirm plans and localized prices appear.
2. Complete a purchase and confirm FRAME+ unlocks.
3. Sign out/reinstall as needed, use **Restore Purchases**, and confirm access
   returns.
4. Open Profile, tap **Delete Account**, capture both confirmation prompts, and
   complete deletion.
5. Confirm the app returns to Sign In and the deleted credentials no longer
   work.

Test on an iPhone and an iPad-sized review device.

## Suggested App Review notes

Replace the bracketed values with the exact identifiers from App Store Connect:

> FRAME+ subscriptions are available from Profile > FRAME+ and from locked
> premium features. The submitted product is
> `com.frame.mobile.frameplus.monthly`. It is attached to the current RevenueCat offering
> and the `frame_plus` entitlement. They were tested using Apple Sandbox in this
> build. Restore Purchases is available on both the FRAME+ screen and Profile.
>
> Permanent account deletion is available at Profile > Delete Account. The
> attached physical-device recording shows sign-in, navigation to the option,
> both confirmations, permanent deletion, and return to Sign In.