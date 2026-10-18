import { Router, type IRouter } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { buildFunnel, isApp, isClientStep, isEventType } from "@workspace/onboarding";
import { loadFunnelRows, recordOnboardingEvent } from "../lib/onboardingEvents";
import { rateLimitCheck, type RateBucket } from "./auth";

const router: IRouter = Router();

/** Per person: a real onboarding emits ~20 events, so 120 a minute is far above honest use. */
export const EVENT_MAX_PER_WINDOW = 120;
export const EVENT_WINDOW_MS = 60 * 1000;
export const _eventStore = new Map<string, RateBucket>();

// POST /api/onboarding/event  { app, step, event }
// Fire-and-forget funnel tracking. The client ignores every failure, and so
// does onboarding: a storage problem answers 202 {recorded:false}, never 5xx.
router.post("/onboarding/event", async (req, res) => {
  const userId = req.userId!;
  const { app, step, event } = (req.body ?? {}) as Record<string, unknown>;

  if (!isApp(app) || !isEventType(event) || typeof step !== "string" || !isClientStep(app, step)) {
    res.status(400).json({ error: "invalid onboarding event" });
    return;
  }
  if (!rateLimitCheck(userId, EVENT_MAX_PER_WINDOW, EVENT_WINDOW_MS, _eventStore)) {
    res.set("Retry-After", "60").status(429).json({ error: "Too many requests." });
    return;
  }

  const recorded = await recordOnboardingEvent(userId, app, step, event, req.log);
  res.status(recorded ? 200 : 202).json({ recorded });
});

// GET /api/admin/onboarding-funnel  (admin accounts only)
// Where people quit: per app, distinct people who reached each step and how
// many stopped there. Same numbers as scripts `onboarding-funnel`.
router.get("/admin/onboarding-funnel", async (req, res) => {
  try {
    const [user] = await db
      .select({ isAdmin: usersTable.isAdmin })
      .from(usersTable)
      .where(eq(usersTable.id, req.userId!))
      .limit(1);
    if (!user?.isAdmin) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const funnel = buildFunnel(await loadFunnelRows());
    res.json({ generatedAt: new Date().toISOString(), funnel });
  } catch (err) {
    req.log.error({ err }, "onboarding funnel failed");
    res.status(500).json({ error: "Could not read the funnel" });
  }
});

export default router;
