import { Router, type IRouter } from "express";
import { getActiveFacts } from "../lib/factsService";
import { getUserFighter } from "../middlewares/authMiddleware";

const router: IRouter = Router();

router.get("/memory", async (req, res) => {
  const fighter = await getUserFighter(req);
  if (!fighter) {
    res.json({ facts: [], count: 0 });
    return;
  }
  const facts = await getActiveFacts(fighter.id);
  res.json({ facts, count: facts.length });
});

export default router;
