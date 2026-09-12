import { Router, type IRouter } from "express";
import { AI_CONSENT_DISCLOSURE, AI_CONSENT_VERSION } from "../lib/aiConsent";

const router: IRouter = Router();
const pageStyle = `body{max-width:760px;margin:0 auto;padding:40px 22px;background:#080808;color:#ddd;font:16px/1.65 system-ui,sans-serif}h1,h2{color:#fff}a{color:#c69a53}.meta{color:#888}`;

router.get("/privacy", (_req, res) => {
  res.type("html").send(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>FRAME Privacy Policy</title>
<style>${pageStyle}</style></head>
 <body><h1>FRAME Privacy Policy</h1><p class="meta">Effective 12 September 2026 · AI disclosure version ${AI_CONSENT_VERSION}</p>
 <h2>Information we collect</h2>
 <p>We collect information you submit directly, including account details, athlete profile and context, training and session data, chat messages, check-ins, uploaded images or video, selected video stills, and other information you provide. We also collect service records such as consent choices, feature use, device/request information, and generated reports or athlete-model entries. We receive this information through account forms, chat and reflection forms, uploads, analysis requests, and normal operation of the service.</p>
 <h2>How we use information</h2>
 <p>We use information to provide and secure FRAME, maintain your account, save your training history, answer requests, generate requested coaching and performance insights, create plans, maintain your athlete model, improve reliability, and respond to support requests. We do not sell your information or use your training and conversation data for advertising.</p>
  <h2>AI features and providers</h2>
  <p>Authenticated use of FRAME requires your separate, explicit acceptance of the current AI disclosure. Until you accept the current disclosure, FRAME pauses authenticated features and sends nothing to Anthropic's Claude service or OpenAI. The consent screen identifies the providers and data categories for the current disclosure. After acceptance, FRAME sends the minimum relevant context for the feature you request to Anthropic/Claude and/or OpenAI. The provider depends on the selected feature and provider setting. AI processing can include:</p>
 <ul>${AI_CONSENT_DISCLOSURE.sharedData.map((x) => `<li>${x}</li>`).join("")}</ul>
 <p>For video analysis, FRAME sends selected still frames and derived movement information where applicable, not the raw video file. FRAME does not send your email address or account ID to an AI provider as model context. Providers process requests under their own service terms and data-processing commitments.</p>
 <h2>Retention and deletion</h2>
 <p>FRAME retains account information, conversations, training and session records, generated reports, selected keyframes, and athlete-model data while needed to provide the service and until you delete the relevant data or your account, subject to backups, security, legal, and dispute-resolution requirements. AI providers retain submitted content according to their applicable terms and processing commitments. Account deletion removes your FRAME profile and stored training data in accordance with our deletion process.</p>
  <h2>Your choices</h2><p>You may decline the current AI disclosure before signup, in which case FRAME does not create an account. AI permission is required while a FRAME account is active and cannot be withdrawn separately from the account. If you no longer agree, you can sign out or permanently delete your account. An older account with absent or stale permission remains paused until the current disclosure is accepted; the authentication routes, this policy and the Terms, consent status and acceptance, sign-out, and permanent account deletion remain reachable. You can delete submitted content and your account as the available product controls allow. You are responsible for ensuring you have permission to submit another person's image, video, or information.</p>
<h2>Contact</h2><p>For privacy questions, use the support contact shown on FRAME's App Store listing.</p>
</body></html>`);
});

router.get("/terms", (_req, res) => {
  res.type("html").send(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>FRAME Terms of Service</title><style>${pageStyle}</style></head>
 <body><h1>FRAME Terms of Service</h1><p class="meta">Effective 12 September 2026</p>
<h2>Using FRAME</h2><p>FRAME provides training reflection, coaching and performance-analysis tools. It is not medical advice, diagnosis, treatment, or a substitute for qualified coaching or healthcare.</p>
<h2>Your account</h2><p>You are responsible for information and footage you submit, for keeping your account secure, and for having the right to upload footage containing other people.</p>
 <h2>AI features and consent</h2><p>Authenticated use of FRAME requires acceptance of the current AI disclosure before FRAME can provide authenticated features. FRAME does not create a new account when the signup disclosure is declined. The disclosure covers relevant chat messages, training and session data, athlete profile or context, uploaded images or selected video stills where applicable, and other information you provide. Depending on the feature and your provider setting, processing is performed by Anthropic's Claude service and/or OpenAI. AI permission is required while an account is active and cannot be withdrawn separately; users who no longer agree may sign out or permanently delete their account. An older account with absent or stale permission remains behind the disclosure gate until acceptance.</p>
<h2>Acceptable use</h2><p>Do not use FRAME unlawfully, interfere with the service, attempt unauthorized access, or upload content that violates another person's rights.</p>
<h2>Contact</h2><p>For terms or support questions, use the support contact shown on FRAME's App Store listing.</p>
</body></html>`);
});

export default router;