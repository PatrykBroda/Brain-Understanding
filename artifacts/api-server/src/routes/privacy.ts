import { Router, type IRouter } from "express";
import { AI_CONSENT_DISCLOSURE, AI_CONSENT_VERSION } from "../lib/aiConsent";

const router: IRouter = Router();
const pageStyle = `body{max-width:760px;margin:0 auto;padding:40px 22px;background:#080808;color:#ddd;font:16px/1.65 system-ui,sans-serif}h1,h2{color:#fff}a{color:#c69a53}.meta{color:#888}`;

router.get("/privacy", (_req, res) => {
  res.type("html").send(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>FRAME Privacy Policy</title>
<style>${pageStyle}</style></head>
 <body><h1>FRAME Privacy Policy</h1><p class="meta">Effective 16 September 2026 · AI disclosure version ${AI_CONSENT_VERSION}</p>
 <h2>Information we collect</h2>
 <p>We collect information you submit directly, including account details, athlete profile and context, training and session data, chat messages, check-ins, images or videos attached to chat, profile images, selected session-analysis video stills, and other information you provide. We also collect service records such as consent choices, feature use, generated reports or athlete-model entries, and reliability reports. Reliability reports may include an error message or stack, startup or layout context, app version, platform, request information, and timestamp. We receive this information through account forms, chat and reflection forms, uploads, analysis requests, and normal operation of the service.</p>
 <h2>How we use information</h2>
 <p>We use information to provide and secure FRAME, maintain your account, save your training history, answer requests, generate requested coaching and performance insights, create plans, maintain your athlete model, improve reliability, and respond to support requests. We do not sell your information or use your training and conversation data for advertising.</p>
  <h2>AI features and providers</h2>
  <p>Authenticated use of FRAME requires your separate, explicit acceptance of the current AI disclosure. Until you accept the current disclosure, FRAME pauses authenticated features and sends nothing to the listed AI providers or routing infrastructure. The consent screen identifies Anthropic's Claude service, OpenAI, Replit's AI integration routing infrastructure, and the data categories for the current disclosure. After acceptance, FRAME sends the minimum relevant context for the feature you request to Anthropic/Claude and/or OpenAI. Requests may be routed through Replit's AI integration infrastructure. The provider depends on the selected feature and provider setting. AI processing can include:</p>
 <ul>${AI_CONSENT_DISCLOSURE.sharedData.map((x) => `<li>${x}</li>`).join("")}</ul>
 <p>Chat attachments are uploaded to FRAME and retained with the conversation. When you send a message, an attached image or video may be sent to the configured AI provider where applicable. For session analysis, FRAME sends selected still frames and derived movement information where available, not the raw source clip. FRAME does not send your email address or account ID to an AI provider as model context. Providers process requests under their own service terms and data-processing commitments.</p>
 <h2>Subscriptions and payments</h2>
 <p>Apple processes App Store purchases and payment information. FRAME uses RevenueCat to operate subscription access and entitlement status. FRAME supplies RevenueCat with a FRAME account identifier and receives subscription product, entitlement, status, and expiry information; FRAME does not receive your full payment-card details. Apple and RevenueCat retain transaction and subscription records under their own policies and legal obligations.</p>
 <h2>Retention and deletion</h2>
 <p>FRAME retains account information, conversations, raw chat attachments, profile images, training and session records, generated reports, selected keyframes, analysis metrics, and athlete-model data while needed to provide the service and until you delete the relevant data or your account, subject to limited backups, security, legal, fraud-prevention, and dispute-resolution requirements. Stored files are restricted to the account owner and authorized service operators. AI providers retain submitted content according to their applicable terms and processing commitments. Account deletion removes the active FRAME account and its stored profile, conversations, attachments, analyses, and training data; queued file removal is retried if immediate deletion fails. Apple, RevenueCat, and other processors may retain transaction or request records where required by their policies or law.</p>
  <h2>Your choices</h2><p>You may decline the current AI disclosure before signup, in which case FRAME does not create an account. You may later withdraw AI permission from Profile. Withdrawal pauses normal authenticated FRAME use and future AI requests until you review and accept the current disclosure again; it does not delete existing account data. While paused, consent controls, this policy and the Terms, support, sign-out, and permanent account deletion remain reachable. You can delete submitted content and your account as the available product controls allow. Deleting a FRAME account does not cancel an App Store subscription; subscriptions are managed separately in Apple account settings. You are responsible for ensuring you have permission to submit another person's image, video, or information.</p>
 <h2>Contact</h2><p>For privacy questions and account help, visit <a href="./support">FRAME Support</a> or email <a href="mailto:harrystephenrob@gmail.com">harrystephenrob@gmail.com</a>.</p>
</body></html>`);
});

router.get("/terms", (_req, res) => {
  res.type("html").send(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>FRAME Terms of Service</title><style>${pageStyle}</style></head>
 <body><h1>FRAME Terms of Service</h1><p class="meta">Effective 16 September 2026</p>
<h2>Using FRAME</h2><p>FRAME provides training reflection, coaching and performance-analysis tools. It is not medical advice, diagnosis, treatment, or a substitute for qualified coaching or healthcare.</p>
<h2>Your account</h2><p>You are responsible for information and footage you submit, for keeping your account secure, and for having the right to upload footage containing other people.</p>
 <h2>AI features and consent</h2><p>Authenticated use of FRAME requires acceptance of the current AI disclosure before FRAME can provide authenticated features. FRAME does not create a new account when the signup disclosure is declined. The disclosure covers relevant chat messages, training and session data, athlete profile or context, chat attachments or selected session-analysis video stills where applicable, and other information you provide. Depending on the feature and your provider setting, processing is performed by Anthropic's Claude service and/or OpenAI, potentially through Replit's AI integration infrastructure. You may withdraw AI permission from Profile. Withdrawal pauses normal authenticated use and future AI requests until the current disclosure is accepted again; consent controls, legal pages, support, sign-out, and permanent account deletion remain available.</p>
<h2>Acceptable use</h2><p>Do not use FRAME unlawfully, interfere with the service, attempt unauthorized access, or upload content that violates another person's rights.</p>
<h2>Subscriptions</h2><p>Auto-renewing subscriptions are purchased and managed through Apple. Deleting your FRAME account does not cancel an App Store subscription. Manage or cancel it separately in your Apple account settings.</p>
<h2>Contact</h2><p>For terms or product questions, visit <a href="./support">FRAME Support</a> or email <a href="mailto:harrystephenrob@gmail.com">harrystephenrob@gmail.com</a>.</p>
</body></html>`);
});

router.get("/support", (_req, res) => {
  res.type("html").send(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>FRAME Support</title><style>${pageStyle}</style></head>
<body><h1>FRAME Support</h1><p class="meta">Help with your account, privacy, and FRAME+ subscription</p>
<h2>Account help</h2><p>You can sign out or permanently delete your account from Profile. Account deletion removes your active FRAME profile, conversations, attachments, analyses, and training data. If the app cannot load your AI permission state, the recovery screen still provides Sign Out and Delete Account controls.</p>
<h2>FRAME+ subscriptions</h2><p>Purchases and renewals are managed by Apple. Restore Purchases is available on the FRAME+ screen and in Profile. To change or cancel a subscription, open your Apple account subscription settings.</p>
<h2>Privacy and terms</h2><p><a href="./privacy">Privacy Policy</a> · <a href="./terms">Terms of Use</a></p>
<h2>Contact FRAME</h2><p>Email <a href="mailto:harrystephenrob@gmail.com?subject=FRAME%20Support">harrystephenrob@gmail.com</a>. Include your app version, iOS version, and a short description of what happened. Never include your password.</p>
</body></html>`);
});

export default router;