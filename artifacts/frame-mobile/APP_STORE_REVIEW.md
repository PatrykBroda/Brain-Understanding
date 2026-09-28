# FRAME App Review checklist

Use this checklist for the next iOS submission. Code changes alone cannot
submit Apple products or complete App Store Connect metadata.

## Billing contract

- Bundle identifier: `app.replit.frame`
- RevenueCat entitlement: `frame_plus`
- Mobile public key variable: `EXPO_PUBLIC_REVENUECAT_IOS_KEY`
- Source of plans: RevenueCat's current offering. The candidate paywall
  retrieves the standard new-subscriber price from Apple's App Store Connect
  territory price schedule on the server. **Still unverified in TestFlight**;
  see the price-blocker section below.
- Purchase provider: Apple In-App Purchase through `react-native-purchases`

Do not create replacement products just to clear a warning. First compare the
existing Apple product identifiers with the products attached to RevenueCat's
current offering.

## Subscription price blocker — do not resubmit unchanged

Apple rejected version 1.0 (72) under Guideline 3.1.2(c) because the
FRAME+ card says "Billing period: 1 month" but shows no amount. Pointing to
Apple's confirmation sheet does **not** satisfy the requirement to display the
subscription price inside the app before purchase. An earlier TestFlight build
displayed `$4.99` from RevenueCat/StoreKit while Apple's purchase sheet
displayed `24.99 zł`; reloading products did not correct it. Neither amount
should be hardcoded into the paywall.

The candidate implementation requires the server-only Replit Secret
`APP_STORE_CONNECT_PRIVATE_KEY` (the complete matching .p8 file). The
non-secret identifiers can be supplied as server settings
`APP_STORE_CONNECT_API_KEY_ID` and `APP_STORE_CONNECT_API_ISSUER_ID`
(the original secret names `APP_STORE_CONNECT_KEY_ID` and
`APP_STORE_CONNECT_ISSUER_ID` remain supported). The account
key must be allowed to read the app's subscription pricing. Without these,
or if the Apple API cannot identify a single current standard price for the
device's storefront, plans cannot be purchased; Restore remains available.
The client obtains the product identifier from RevenueCat's current offering,
uses StoreKit only for the device's storefront country, and rechecks Apple's
schedule immediately before opening the purchase sheet. No price or currency
is configured in code. Introductory/promotional pricing and eligibility are
not sourced by this endpoint; verify any active offer separately before
submitting, since the sheet can show a different first charge.

StoreKit reports three-letter storefront codes (for example `GBR` or `USA`);
the app and server now accept those, with two-letter codes retained for older
clients. The first TestFlight build with the new paywall reported `USA`, so its
two-letter-only validator hid every price before calling the Apple API. The
tester says that device's Media & Purchases account is UK. Do not override
`USA` with `GBR` or assume GBP: TestFlight purchases run in Apple's sandbox,
where a signed-in Sandbox Apple Account can have its own country/region.
Check App Store Connect > Users and Access > Sandbox > tester > Country or
Region. After changing it, sign out and back into the Sandbox account on the
iPhone as Apple instructs. Then capture a new build's storefront diagnostic
and compare its in-app amount with the Apple purchase sheet on that device.
https://developer.apple.com/documentation/storekit/storefront
https://developer.apple.com/help/app-store-connect/test-in-app-purchases/manage-sandbox-apple-account-settings/

RevenueCat documents that TestFlight's StoreKit product metadata can return
USD while Apple's purchase sheet correctly uses the local currency:
https://www.revenuecat.com/docs/test-and-launch/sandbox/apple-app-store
Apple's `SubscriptionStoreView` displays localized subscription prices, but
its product-ID initializer **also loads subscription data from the App Store**:
https://developer.apple.com/documentation/storekit/subscriptionstoreview
There is no evidence yet that this view receives a different, correct price
on the affected device. Replacing the card with it without an on-device
comparison would repeat the unverified-refresh mistake. This Linux workspace
cannot build/run SwiftUI on iOS or inspect the affected TestFlight storefront.

**Release gate:** The server-only API key has been authorized and the
Apple price lookup returned a PLN price for the Polish territory and the
subscription in RevenueCat's current offering. This verifies the server
path only. Test a native candidate on the same Polish storefront; the
in-app amount has **not** been compared with an iOS purchase sheet.
Record the current StoreKit country code, product currency and price from
the privacy-safe billing diagnostics; capture the amount visible *inside*
the app before tapping Buy and the amount on Apple's confirmation sheet.
Repeat after a clean install and verify the Apple ID's Media & Purchases
country. If using `SubscriptionStoreView`, verify its visible amount
independently; do not infer correctness merely because its purchase succeeds.
Check at least one other storefront if available. Keep the existing
RevenueCat offering/product/entitlement and confirm purchase, restore,
auto-renewal wording and both legal links still work. **Do not resubmit**
with either an unpriced card or a price known to disagree with Apple's sheet.
If the native view also shows the wrong amount, report the TestFlight
metadata mismatch to Apple Developer Support with the build, storefront,
product identifier, and redacted screenshots; do not substitute a guessed
regional price.

**App Review response, only after a verified correction:** “Thank you for
the Guideline 3.1.2(c) feedback. In build [BUILD], open Profile > FRAME+.
Before initiating an Apple purchase, the plan displays its title,
subscription length, localized [PRICE]/[PERIOD] and included services.
Privacy Policy and Terms of Use links are on the same screen. We verified
the displayed amount against Apple's confirmation sheet on [DEVICE,
STOREFRONT]. The attached recording shows the price before purchase and
the matching Apple sheet.” Replace the brackets with observed facts; do
not send this response for the current unpriced build.

**Recording checklist:** show the new build/version, open Profile > FRAME+,
pause on the in-app amount and period with included services visible, open
Privacy and Terms links, then return and open Apple's purchase sheet to
show the same local amount without confirming a charge. Repeat the
purchase/restore check separately with a sandbox tester.

## RevenueCat and App Store Connect

- Confirm the iOS app uses bundle ID `app.replit.frame`.
- Confirm App Store Connect credentials are valid.
- Import the intended Apple auto-renewable subscription products.
- Attach every product to a package in the current offering and to the
  `frame_plus` entitlement.
- Confirm the production public SDK key is the value supplied to
  `EXPO_PUBLIC_REVENUECAT_IOS_KEY` during the production EAS build.
- Product expected for the FRAME+ monthly package; verify its attachment in
  RevenueCat and App Store Connect before submission:
  `com.frame.mobile.frameplus.monthly`.
- Complete subscription group, duration, availability, pricing, tax category,
  and every required localization.
- Upload an App Review screenshot showing the FRAME+ paywall and plans.
- Resolve every **Missing Metadata** warning and confirm Agreements, Tax and
  Banking has no blocking action.
- Select the subscription products for the new app version and submit them
  with the new production binary.

## TestFlight build record

Record the actual values after the build is created and distributed. These
placeholders are intentionally not a claim that a build has been uploaded:

- App Store version: `1.0.4`
- iOS build number: `[RECORD BUILD NUMBER]`
- TestFlight upload status: `NOT UPLOADED — publish with Expo Launch, then record the upload date`
- TestFlight processing status: `[RECORD STATUS]`
- Review device(s): `[RECORD iPhone/iPad models and iOS versions]`

The production profile keeps `autoIncrement: true`, so Expo Launch will assign
a new iOS build number. Do not replace the build-number placeholder until the
new build appears in App Store Connect.

## AI data disclosure

- Privacy policy URL: use the production URL ending in `/api/privacy`.
- Support URL: use the production URL ending in `/api/support`.
- Public support email: `harrystephenrob@gmail.com`.
- Terms/EULA URL: use the production URL ending in `/api/terms`.
- In App Privacy, disclose the exact categories in `AI_DATA_FLOW.md`: chat
  messages/conversation context; training and session data, movement signals,
  scores, session type and clip duration; relevant athlete profile/context;
  images or videos attached to chat; selected session-analysis video stills;
  and other user-provided information needed for the feature.
- Identify **Anthropic (Claude)** and **OpenAI** as the possible third-party AI
  processors in the privacy policy and review notes. Requests may be routed
  through Replit's AI integration infrastructure.
- Confirm policy, privacy labels, permission sheet, and actual payload use the
  same server-provided categories. Photo-library permission is not AI consent.
- Have the product owner or legal reviewer approve final policy wording and
  provider retention/processing statements before submission.

## App Privacy answer worksheet

Reconcile these rows against the exact App Store Connect questionnaire shown
for the submitted version. This is an engineering inventory, not legal advice.
FRAME does not use these categories for cross-app tracking or advertising.

| Apple data type | FRAME example | Purpose | Linked to account |
| --- | --- | --- | --- |
| Contact Info — Email Address | Sign-up and sign-in email | App functionality, account management | Yes |
| User Content — Photos or Videos | Chat attachments, profile image, selected analysis stills | App functionality | Yes |
| User Content — Other User Content | Chat, goals, reflections, uploaded context | App functionality | Yes |
| Health & Fitness — Fitness | Training sessions, check-ins, readiness and performance observations | App functionality | Yes |
| Purchases — Purchase History | Product, entitlement, subscription status and expiry from Apple/RevenueCat | App functionality | Yes |
| Identifiers — User ID | FRAME account ID; RevenueCat app user ID | App functionality, account/subscription linking | Yes |
| Usage Data — Product Interaction | Feature use and consent choices | App functionality, reliability | Yes |
| Diagnostics — Crash Data | Error/stack, startup or layout context, app version, platform and timestamp | Analytics, app reliability | May be |

Confirm that:

- **Tracking** is answered **No** unless the production app adds cross-company
  tracking behavior not represented in this repository.
- Payment-card details are processed by Apple and are not received by FRAME.
- Anthropic, OpenAI, Replit AI integration infrastructure, RevenueCat, and
  Apple are reflected wherever App Store Connect asks about third-party
  processing.
- Raw chat attachments are stored by FRAME and may be sent with the selected
  chat message; raw source clips selected for session analysis are not included
  in the `/analysis` request.

## Physical-device review navigation

Install the recorded TestFlight build and use an Apple Sandbox tester:

1. From Sign Up, accept the Terms and Privacy Policy and continue to the
   separate **AI Data & Privacy** sheet. Capture the sheet before account
   creation.
2. Verify the sheet names Anthropic (Claude), OpenAI, and Replit AI integration
   infrastructure for routing; says nothing goes to them before agreement; and
   lists chat images/videos separately from selected session-analysis stills.
3. Tap **Go Back**. Confirm no account is created and no AI request starts.
4. Open the sheet again, select the acknowledgement, tap **Agree & Continue**,
   and complete onboarding.
5. Open **Chat** and **Weekly Mission**. Confirm each works only
   after current consent and that provider-boundary checks do not duplicate a
   pending message, attachment, or plan request. Mobile footage analysis is
   intentionally hidden until its separately tracked implementation is complete.
6. Open **Profile** from the bottom navigation > **AI Coaching & Privacy**.
   Open **Privacy Policy**, then choose **Withdraw AI Permission**. Confirm a
   full-screen consent gate appears and future AI/authenticated use remains
   paused.
7. From the gate, open Privacy and Terms, then verify **Sign Out** and
   **Delete Account** remain reachable. Accept the disclosure again and confirm
   normal authenticated use resumes.
8. Sign out and sign back in as needed. Confirm a withdrawn or
   stale-consent account remains at the consent gate until the current
   disclosure is accepted, while consent GET/PATCH and account deletion remain
   reachable.
9. Open **Profile** > **FRAME+** after accepting the current disclosure and
   confirm plans and localized prices appear.
10. Complete a purchase and confirm FRAME+ unlocks.
11. Sign out/reinstall as needed, use **Restore Purchases**, and confirm access
    returns.
12. Open **Manage Subscription** and confirm Apple account subscription
    settings open.
13. Open **Profile** > **Delete Account**, capture both confirmation prompts,
    complete deletion, and confirm return to Sign In even when consent is
    declined or withdrawn.

Test on an iPhone and an iPad-sized review device. Record the exact TestFlight
version/build above; do not describe the binary as uploaded until that is true.

## Suggested App Review notes

Replace bracketed values with the recorded App Store Connect identifiers:

> Reviewer account: credentials are supplied only in App Store Connect's
> Review Information fields, not in source code or this document. A new account
> can also be created in-app by accepting the Terms, Privacy Policy, and
> separate AI Data & Privacy disclosure, then completing onboarding.
>
> FRAME+ subscriptions are available from Profile > FRAME+ and from locked
> premium features. The submitted product is
> `com.frame.mobile.frameplus.monthly`. It is attached to the current RevenueCat
> offering and the `frame_plus` entitlement. They were tested using Apple
> Sandbox in TestFlight version `[VERSION]`, build `[BUILD]`. Restore Purchases
> is available on both the FRAME+ screen and Profile.
>
> Before authenticated FRAME use and before the first AI-powered Chat or Weekly
> Mission use, FRAME presents a dedicated permission sheet naming
> Anthropic (Claude), OpenAI, and Replit AI integration infrastructure for
> routing, and listing the exact server-provided data categories. Going back
> during signup creates no account and sends no AI
> request. Authentication, legal pages, consent GET/PATCH,
> sign-out, and permanent account deletion remain reachable. Choosing Agree &
> Continue records versioned consent before authenticated use resumes. Users
> can review the privacy policy and withdraw permission from Profile; a
> declined, withdrawn, or stale account sees the gate again. The server
> rechecks the same current consent immediately before chat, analysis,
> planning, and consent-dependent memory provider calls.
>
> Permanent account deletion is available at Profile > Delete Account. The
> attached physical-device recording shows sign-in, navigation to the option,
> both confirmations, permanent deletion, and return to Sign In.
>
> FRAME provides performance coaching and training reflection. It is not
> medical advice, diagnosis, treatment, or a substitute for qualified coaching
> or healthcare.

## Final owner-only submission gate

Do not submit until every box below is confirmed against the actual processed
TestFlight build:

- [ ] Reviewer credentials or fresh-account instructions work from a clean install
- [ ] Bundle ID, version, and auto-incremented build match App Store Connect
- [ ] Production RevenueCat key is embedded and the current offering loads
- [ ] In-app price and per-period amount are visible before purchase and match Apple's sheet on the affected storefront
- [ ] Sandbox purchase activates `frame_plus`
- [ ] Restore Purchases restores the same entitlement after reinstall/sign-in
- [ ] Manage Subscription opens Apple's subscription settings
- [ ] Subscription product is selected with the submitted app version
- [ ] Subscription group, duration, localization, price, availability, tax category, and review screenshot are complete
- [ ] Agreements, Tax and Banking has no blocking action
- [ ] Privacy, Terms/EULA, and Support URLs load publicly without authentication
- [ ] Support email link opens a new message to `harrystephenrob@gmail.com`
- [ ] App Privacy answers match the worksheet and `AI_DATA_FLOW.md`
- [ ] Photo-library, microphone, and speech-recognition prompts appear only when invoked and match their shipped purpose strings
- [ ] Sign-up, onboarding, consent withdrawal/reacceptance, sign-out, and permanent deletion complete on the submitted build
- [ ] App description and screenshots do not claim raw-footage analysis; the mobile Analyse tab remains hidden until that separately tracked feature is shipped
- [ ] iPhone and iPad-compatibility presentation are readable on the exact recorded devices