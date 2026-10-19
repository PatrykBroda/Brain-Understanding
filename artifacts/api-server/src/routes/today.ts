import { Router, type IRouter } from "express";
import { getUserFighter } from "../middlewares/authMiddleware";
import { effectiveTimeZone, rememberTimezone, todayFor } from "../middlewares/timezone";
import { getDailyView } from "../lib/dailyContext";

const router: IRouter = Router();

// The athlete's day: State, Today's Focus and readiness for the current local
// date, with an honest disclosure when FRAME holds nothing new today.
// Safe to call on every screen focus: it only writes when something changed.
router.get("/today", async (req, res) => {
  const fighter = await getUserFighter(req);
  if (!fighter) {
    res.status(404).json({ error: "no fighter — complete onboarding first" });
    return;
  }
  await rememberTimezone(req, fighter);
  try {
    const view = await getDailyView(fighter, {
      today: todayFor(req, fighter.timezone),
      tz: effectiveTimeZone(req, fighter.timezone),
      now: req.frameNow,
    });
    res.set("Cache-Control", "no-store");
    res.json(view);
  } catch (err) {
    req.log.error({ err }, "today view failed");
    res.status(500).json({ error: "Could not build today's view. Try again." });
  }
});

export default router;
