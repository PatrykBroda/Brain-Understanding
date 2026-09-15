# FRAME App Review checklist

Use this checklist for the next iOS submission. Code changes alone cannot
submit Apple products or complete App Store Connect metadata.

## Billing contract

- Bundle identifier: `app.replit.frame`
- RevenueCat entitlement: `frame_plus`
- Mobile public key variable: `EXPO_PUBLIC_REVENUECAT_IOS_KEY`
- Source of plans and localized prices: RevenueCat's current offering
- Purchase provider: Apple In-App Purchase through `react-native-purchases`

Do not create replacement products just to clear a warning. First compare the
existing Apple product identifiers with the products attached to RevenueCat's
current offering.

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
2. Verify the sheet names Anthropic (Claude) and OpenAI, says nothing goes to
   either before agreement, and lists chat images/videos separately from
   selected session-analysis stills.
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
> Anthropic (Claude) and OpenAI and listing the exact server-provided data
> categories. Going back during signup creates no account and sends no AI
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
- [ ] Sandbox purchase activates `frame_plus`
- [ ] Restore Purchases restores the same entitlement after reinstall/sign-in
- [ ] Manage Subscription opens Apple's subscription settings
- [ ] Subscription product is selected with the submitted app version
- [ ] Subscription group, duration, localization, price, availability, tax category, and review screenshot are complete
- [ ] Agreements, Tax and Banking has no blocking action
- [ ] Privacy, Terms/EULA, and Support URLs load publicly without authentication
- [ ] App Privacy answers match the worksheet and `AI_DATA_FLOW.md`
- [ ] Photo-library, microphone, and speech-recognition prompts appear only when invoked and match their shipped purpose strings
- [ ] Sign-up, onboarding, consent withdrawal/reacceptance, sign-out, and permanent deletion complete on the submitted build
- [ ] App description and screenshots do not claim raw-footage analysis; the mobile Analyse tab remains hidden until that separately tracked feature is shipped
- [ ] iPhone and iPad-compatibility presentation are readable on the exact recorded devices