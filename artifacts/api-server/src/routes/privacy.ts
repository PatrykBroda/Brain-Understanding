import { Router, type IRouter } from "express";
import { AI_ANALYSIS_DISCLOSURE } from "../lib/aiConsent";

const router: IRouter = Router();

router.get("/privacy", (_req, res) => {
  res.type("html").send(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>FRAME Privacy Policy</title>
<style>body{max-width:760px;margin:0 auto;padding:40px 22px;background:#080808;color:#ddd;font:16px/1.65 system-ui,sans-serif}h1,h2{color:#fff}a{color:#c69a53}.meta{color:#888}</style></head>
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

export default router;