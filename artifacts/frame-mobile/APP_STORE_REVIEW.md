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
- Verified RevenueCat product currently attached to the FRAME+ monthly package:
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
- In App Privacy, disclose the exact categories in `AI_DATA_FLOW.md`: chat
  messages/conversation context; training and session data, movement signals,
  scores, session type and clip duration; relevant athlete profile/context;
  uploaded images or selected video stills; and other user-provided
  information needed for the feature.
- Identify **Anthropic (Claude)** and **OpenAI** as the possible third-party AI
  processors in the privacy policy and review notes.
- Confirm policy, privacy labels, permission sheet, and actual payload use the
  same server-provided categories. Photo-library permission is not AI consent.
- Have the product owner or legal reviewer approve final policy wording and
  provider retention/processing statements before submission.

## Physical-device review navigation

Install the recorded TestFlight build and use an Apple Sandbox tester:

1. With a fresh account, open **Chat** from the bottom navigation (or Profile >
   **Continue Calibration**), enter a message, and tap send. Capture the
   permission sheet before the first AI request.
2. Verify the sheet names Anthropic (Claude) and OpenAI, says nothing goes to
   either before agreement, and lists the exact server-provided categories.
3. Tap **Not now**. Confirm the message and any attachments remain available,
   no coaching request starts, and non-AI navigation remains usable.
4. Send again, tap **Agree & Continue**, and confirm the same pending message
   and attachments are sent once (not duplicated).
5. Open **Analyse** from the bottom navigation and start a report. Confirm the
   same consent contract gates analysis and the report completes after
   acceptance. Declining leaves other features usable.
6. Open **Weekly Mission** and choose Generate or Regenerate. Confirm the same
   permission sheet appears before generation for an account without current
   consent, and that accepting resumes generation exactly once.
7. Open **Profile** from the bottom navigation > **AI Coaching & Privacy**.
   Open **Privacy Policy**, then choose **Withdraw AI Permission**. Confirm a
   later Chat send, Analyse submission, or Weekly Mission generation asks for
   consent again.
8. Open **Profile** > **FRAME+** and confirm plans and localized prices appear.
9. Complete a purchase and confirm FRAME+ unlocks.
10. Sign out/reinstall as needed, use **Restore Purchases**, and confirm access
   returns.
11. Open **Profile** > **Delete Account**, capture both confirmation prompts,
    complete deletion, and confirm return to Sign In.

Test on an iPhone and an iPad-sized review device. Record the exact TestFlight
version/build above; do not describe the binary as uploaded until that is true.

## Suggested App Review notes

Replace bracketed values with the recorded App Store Connect identifiers:

> FRAME+ subscriptions are available from Profile > FRAME+ and from locked
> premium features. The submitted product is
> `com.frame.mobile.frameplus.monthly`. It is attached to the current RevenueCat
> offering and the `frame_plus` entitlement. They were tested using Apple
> Sandbox in TestFlight version `[VERSION]`, build `[BUILD]`. Restore Purchases
> is available on both the FRAME+ screen and Profile.
>
> Before the first AI-powered Chat, Analyse, or Weekly Mission request, FRAME
> presents a dedicated permission sheet naming Anthropic (Claude) and OpenAI
> and listing the exact server-provided data categories. Choosing Not now
> leaves the pending input and non-AI features usable and sends no AI request.
> Choosing Agree & Continue records versioned consent before the pending
> request continues exactly once. Users can review the privacy policy and
> withdraw permission from Profile. The server rechecks the same current
> consent immediately before chat, analysis, planning, and consent-dependent
> memory provider calls.
>
> Permanent account deletion is available at Profile > Delete Account. The
> attached physical-device recording shows sign-in, navigation to the option,
> both confirmations, permanent deletion, and return to Sign In.