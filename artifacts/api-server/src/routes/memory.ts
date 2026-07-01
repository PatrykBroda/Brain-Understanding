import { Router, type IRouter } from "express";
import { getActiveFacts, applyConfirmation } from "../lib/factsService";
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

const CONFIRM_RESPONSES = ["yes", "mostly", "no"] as const;

router.post("/memory/fact/:id/confirm", async (req, res) => {
  const fighter = await getUserFighter(req);
  if (!fighter) {
    res.status(404).json({ error: "no fighter" });
    return;
  }
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "invalid id" });
    return;
  }
  const response = req.body?.response;
  if (!CONFIRM_RESPONSES.includes(response)) {
    res.status(400).json({ error: "invalid response" });
    return;
  }
  const fact = await applyConfirmation(fighter.id, id, response);
  res.json({ ok: true, fact });
});

export default router;
