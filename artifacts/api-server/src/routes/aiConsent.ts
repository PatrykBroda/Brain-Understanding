import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import {
  AI_ANALYSIS_CONSENT_VERSION,
  AI_ANALYSIS_DISCLOSURE,
  hasCurrentAiConsent,
} from "../lib/aiConsent";

const router: IRouter = Router();

router.get("/ai-consent", async (req, res) => {
  const [user] = await db
    .select({
      version: usersTable.aiAnalysisConsentVersion,
      acceptedAt: usersTable.aiAnalysisConsentAt,
    })
    .from(usersTable)
    .where(eq(usersTable.id, req.userId as string))
    .limit(1);
  const accepted = hasCurrentAiConsent(user?.version, user?.acceptedAt);
  res.json({
    accepted,
    version: AI_ANALYSIS_CONSENT_VERSION,
    acceptedAt: accepted ? user.acceptedAt : null,
    disclosure: AI_ANALYSIS_DISCLOSURE,
  });
});

router.patch("/ai-consent", async (req, res) => {
  const accepted = (req.body as { accepted?: unknown })?.accepted === true;
  const now = accepted ? new Date() : null;
  await db
    .update(usersTable)
    .set({
      aiAnalysisConsentVersion: accepted ? AI_ANALYSIS_CONSENT_VERSION : null,
      aiAnalysisConsentAt: now,
    })
    .where(eq(usersTable.id, req.userId as string));
  res.json({
    accepted,
    version: AI_ANALYSIS_CONSENT_VERSION,
    acceptedAt: now,
    disclosure: AI_ANALYSIS_DISCLOSURE,
  });
});

export default router;