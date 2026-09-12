import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import {
  AI_CONSENT_VERSION,
  AI_CONSENT_DISCLOSURE,
  getAiConsent,
  hasCurrentAiConsent,
} from "../lib/aiConsent";

const router: IRouter = Router();

router.get("/ai-consent", async (req, res) => {
  const user = await getAiConsent(req.userId as string);
  const accepted = hasCurrentAiConsent(user?.version, user?.acceptedAt);
  res.json({
    accepted,
    version: AI_CONSENT_VERSION,
    acceptedAt: accepted ? user.acceptedAt : null,
    disclosure: AI_CONSENT_DISCLOSURE,
  });
});

router.patch("/ai-consent", async (req, res) => {
  const accepted = (req.body as { accepted?: unknown })?.accepted;
  if (accepted !== true) {
    res.status(400).json({
      error: "AI permission is required while a FRAME account is active",
      code: "AI_CONSENT_REQUIRED",
    });
    return;
  }
  const now = new Date();
  await db
    .update(usersTable)
    .set({
      aiAnalysisConsentVersion: AI_CONSENT_VERSION,
      aiAnalysisConsentAt: now,
    })
    .where(eq(usersTable.id, req.userId as string));
  res.json({
    accepted,
    version: AI_CONSENT_VERSION,
    acceptedAt: now,
    disclosure: AI_CONSENT_DISCLOSURE,
  });
});

export default router;