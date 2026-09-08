import { Router, type IRouter } from "express";
import { AI_ANALYSIS_DISCLOSURE } from "../lib/aiConsent";

const router: IRouter = Router();
const pageStyle = `body{max-width:760px;margin:0 auto;padding:40px 22px;background:#080808;color:#ddd;font:16px/1.65 system-ui,sans-serif}h1,h2{color:#fff}a{color:#c69a53}.meta{color:#888}`;

router.get("/privacy", (_req, res) => {
  res.type("html").send(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>FRAME Privacy Policy</title>
<style>${pageStyle}</style></head>
<body><h1>FRAME Privacy Policy</h1><p class="meta">Effective 8 September 2026</p>
<h2>AI-powered analysis</h2>
<p>FRAME uses ${AI_ANALYSIS_DISCLOSURE.provider}'s ${AI_ANALYSIS_DISCLOSURE.service} service ${AI_ANALYSIS_DISCLOSURE.purpose}. We send only after you give explicit permission in the app.</p>
<p>We may send:</p><ul>${AI_ANALYSIS_DISCLOSURE.sharedData.map((x) => `<li>${x}</li>`).join("")}</ul>
<p>We do not send:</p><ul>${AI_ANALYSIS_DISCLOSURE.notShared.map((x) => `<li>${x}</li>`).join("")}</ul>
<p>Data is sent securely from FRAME's server to Anthropic for processing. FRAME stores your resulting analysis and any selected keyframes in your account until you delete the analysis or your account. Anthropic processes submitted data under its service terms and data-processing commitments; FRAME does not use this data for advertising.</p>
<h2>Your choices</h2><p>You can decline and continue using the rest of FRAME. You can review or withdraw AI-analysis permission from Profile at any time. Withdrawal blocks future AI analysis; it does not delete existing reports or unrelated account data. Deleting your account permanently removes your FRAME profile and stored training data.</p>
<h2>Contact</h2><p>For privacy questions, use the support contact shown on FRAME's App Store listing.</p>
</body></html>`);
});

router.get("/terms", (_req, res) => {
  res.type("html").send(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>FRAME Terms of Service</title><style>${pageStyle}</style></head>
<body><h1>FRAME Terms of Service</h1><p class="meta">Effective 8 September 2026</p>
<h2>Using FRAME</h2><p>FRAME provides training reflection, coaching and performance-analysis tools. It is not medical advice, diagnosis, treatment, or a substitute for qualified coaching or healthcare.</p>
<h2>Your account</h2><p>You are responsible for information and footage you submit, for keeping your account secure, and for having the right to upload footage containing other people.</p>
<h2>AI features</h2><p>AI-powered analysis requires a separate, optional permission before analysis data is shared with Anthropic. You may decline that permission and still create and use your FRAME account.</p>
<h2>Acceptable use</h2><p>Do not use FRAME unlawfully, interfere with the service, attempt unauthorized access, or upload content that violates another person's rights.</p>
<h2>Contact</h2><p>For terms or support questions, use the support contact shown on FRAME's App Store listing.</p>
</body></html>`);
});

export default router;