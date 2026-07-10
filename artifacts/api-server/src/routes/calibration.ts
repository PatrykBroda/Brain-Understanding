import { Router, type IRouter } from "express";
import { db, calibrationsTable } from "@workspace/db";
import { desc, eq } from "drizzle-orm";
import { CALIBRATION_BANK, pickNextQuestion, answerToSignal } from "../lib/calibrationBank";
import { addFact, confirmFact, findActiveFactByTopic } from "../lib/factsService";
import { getUserFighter } from "../middlewares/authMiddleware";

const router: IRouter = Router();

router.get("/calibration/next", async (req, res) => {
  const fighter = await getUserFighter(req);
  if (!fighter) {
    res.json({ question: null });
    return;
  }
  const recent = await db
    .select({ promptKey: calibrationsTable.promptKey })
    .from(calibrationsTable)
    .where(eq(calibrationsTable.fighterId, fighter.id))
    .orderBy(desc(calibrationsTable.createdAt))
    .limit(4);
  const askedKeys = recent.map((r) => r.promptKey);
  const question = pickNextQuestion(askedKeys);
  res.json({ question });
});

router.post("/calibration/answer", async (req, res) => {
  const body = req.body as { key?: unknown; answer?: unknown };
  if (typeof body.key !== "string" || typeof body.answer !== "string") {
    res.status(400).json({ error: "key and answer required" });
    return;
  }
  const question = CALIBRATION_BANK.find((q) => q.key === body.key);
  if (!question) {
    res.status(400).json({ error: "unknown question key" });
    return;
  }
  if (!question.options.includes(body.answer)) {
    res.status(400).json({ error: "answer not in options" });
    return;
  }
  const fighter = await getUserFighter(req);
  if (!fighter) {
    res.status(400).json({ error: "no fighter" });
    return;
  }
  await db.insert(calibrationsTable).values({
    fighterId: fighter.id,
    promptKey: question.key,
    promptText: question.prompt,
    answer: body.answer,
  });
  const signalText = answerToSignal(question, body.answer);
  if (signalText) {
    // Calibration topics are deterministic (topic == question key), so a
    // repeat answer strengthens the existing observation instead of piling
    // up duplicates. The refined content reflects the latest answer.
    const existing = await findActiveFactByTopic(fighter.id, question.key, "pattern");
    if (existing) {
      await confirmFact(
        fighter.id,
        existing.id,
        { type: "calibration", ref: `calibration:${question.key}` },
        signalText,
      );
    } else {
      await addFact(fighter.id, {
        category: "pattern",
        topic: question.key,
        content: signalText,
        source: { type: "calibration", ref: `calibration:${question.key}` },
        athleteStated: true,
      });
    }
  }
  res.json({ ok: true });
});

export default router;
