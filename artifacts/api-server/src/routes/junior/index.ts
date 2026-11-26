import { Router, type IRouter } from "express";
import { juniorEnabled } from "../../lib/junior/entitlement";
import identityRouter from "./identity";
import familiesRouter from "./families";
import gymRouter from "./gym";
import loopRouter from "./loop";
import parentRouter from "./parent";
import recordsRouter from "./records";
import entitlementsRouter from "./entitlements";
import joinRouter from "./join";
import accountsRouter, { publicRouter as juniorPublicInner } from "./accounts";
import performanceRouter from "./performance";

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
inner.use(entitlementsRouter);
inner.use(joinRouter);
inner.use(accountsRouter);
inner.use(performanceRouter);

router.use("/junior", (req, res, next) => {
  if (!juniorEnabled()) {
    res.status(404).json({ error: "Not found", code: "NOT_FOUND" });
    return;
  }
  next();
}, inner);

/** Reachable WITHOUT a login (a junior finishing setup from the parent's code). Same dark flag. Mounted before requireAuth. */
export const juniorPublicRouter: IRouter = Router();
juniorPublicRouter.use("/junior/junior-setup", (_req, res, next) => {
  if (!juniorEnabled()) {
    res.status(404).json({ error: "Not found", code: "NOT_FOUND" });
    return;
  }
  next();
});
juniorPublicRouter.use("/junior", juniorPublicInner);

export default router;
