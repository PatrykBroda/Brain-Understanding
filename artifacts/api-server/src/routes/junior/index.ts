import { Router, type IRouter } from "express";
import { juniorEnabled } from "../../lib/junior/entitlement";
import identityRouter from "./identity";
import familiesRouter from "./families";
import gymRouter from "./gym";
import loopRouter from "./loop";
import parentRouter from "./parent";
import recordsRouter from "./records";

/**
 * /api/junior/* — the Junior Portal pilot. Dark unless JUNIOR_PORTAL_ENABLED is set on the server.
 * Mounted BEFORE requireCurrentAiConsent: parents and coaches do not use the AI coach, so they must
 * not be forced through AI consent. Nothing here calls ensureFighter / getUserFighter.
 */
const router: IRouter = Router();

router.get("/junior/config", (_req, res) => {
  res.json({ enabled: juniorEnabled() });
});

const inner: IRouter = Router();
inner.use(identityRouter);
inner.use(familiesRouter);
inner.use(gymRouter);
inner.use(loopRouter);
inner.use(parentRouter);
inner.use(recordsRouter);

router.use("/junior", (req, res, next) => {
  if (!juniorEnabled()) {
    res.status(404).json({ error: "Not found", code: "NOT_FOUND" });
    return;
  }
  next();
}, inner);

export default router;
