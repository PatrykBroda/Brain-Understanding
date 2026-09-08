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

## AI data disclosure

- Privacy policy URL: use the production URL ending in `/api/privacy`.
- In App Privacy, disclose the data categories that match `AI_DATA_FLOW.md`.
  This includes user content (selected video stills and analysis focus),
  fitness/performance data (movement signals and scores), and other relevant
  athlete-profile content used to provide app functionality.
- Identify Anthropic/Claude as the third-party AI processor in the privacy
  policy and review notes.
- Confirm the policy, privacy labels, consent screen, and actual payload all
  use the same data categories. Photo-library permission is not AI consent.
- Have the product owner or legal reviewer approve the final policy wording and
  Anthropic retention/processing statement before submission.

## Physical-device verification

Install the new build through TestFlight and use an Apple Sandbox tester:

1. With a fresh account, open Analyse and start a report. Capture the AI
   permission sheet before any report begins.
2. Tap **Not now** and confirm the app remains usable and no analysis starts.
3. Start again, tap **Agree & Analyse**, and confirm the report completes.
4. Open Profile, open **Privacy Policy**, then withdraw AI permission. Confirm
   the next analysis asks again.
5. Open FRAME+ and confirm plans and localized prices appear.
6. Complete a purchase and confirm FRAME+ unlocks.
7. Sign out/reinstall as needed, use **Restore Purchases**, and confirm access
   returns.
8. Open Profile, tap **Delete Account**, capture both confirmation prompts, and
   complete deletion.
9. Confirm the app returns to Sign In and the deleted credentials no longer
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
>
> Before the first AI-powered analysis, FRAME presents a dedicated permission
> sheet naming Anthropic/Claude and listing the exact data sent and not sent.
> Choosing Not now leaves the app usable and sends no analysis request. Choosing
> Agree & Analyse records versioned consent before the analysis begins. Users
> can review the privacy policy and withdraw permission from Profile. FRAME
> sends selected still frames (not the raw video), movement signals and scores,
> session details, requested focus, and minimized relevant performance context.
> It does not send the user's email, account ID, full name, gym, biography,
> height or weight to Anthropic.