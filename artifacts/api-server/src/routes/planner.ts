import { Router, type IRouter } from "express";
import {
  db,
  fightersTable,
  calibrationsTable,
} from "@workspace/db";
import { asc, desc, eq } from "drizzle-orm";
import { getActiveFacts } from "../lib/factsService";
import {
  generateWeeklyPlan,
  getCurrentPlan,
  listCompletions,
  upsertPlan,
  setCompletion,
  recentChatSummary,
  isoMondayUTC,
} from "../lib/plannerService";
import { getOrCreateActiveConversation } from "./conversation";
import { addFact, resolveFact } from "../lib/factsService";
import { db as _db } from "@workspace/db";

const router: IRouter = Router();

async function loadFighter() {
  const [fighter] = await db.select().from(fightersTable).orderBy(asc(fightersTable.id)).limit(1);
  return fighter ?? null;
}

router.get("/planner/current", async (_req, res) => {
  const fighter = await loadFighter();
  if (!fighter) {
    res.json({ plan: null, completions: [], weekStart: isoMondayUTC().toISOString() });
    return;
  }
  const plan = await getCurrentPlan(fighter.id);
  const completions = plan ? await listCompletions(plan.id) : [];
  res.json({
    plan,
    completions: completions.map((c) => c.itemKey),
    weekStart: isoMondayUTC().toISOString(),
  });
});

router.post("/planner/regenerate", async (req, res) => {
  const fighter = await loadFighter();
  if (!fighter) {
    res.status(400).json({ error: "no fighter" });
    return;
  }
  const facts = await getActiveFacts(fighter.id);
  const calibrations = await db
    .select()
    .from(calibrationsTable)
    .where(eq(calibrationsTable.fighterId, fighter.id))
    .orderBy(desc(calibrationsTable.createdAt))
    .limit(12);

  if (facts.length === 0 && calibrations.length === 0) {
    res.status(409).json({
      error: "no recorded signals yet — train and talk to the coach so the model has something to plan from",
    });
    return;
  }

  const conversation = await getOrCreateActiveConversation(fighter.id);
  const recentChat = await recentChatSummary(conversation.id);
  const provider = conversation.aiProvider === "openai" ? "openai" : "claude";

  try {
    const { items, rationale } = await generateWeeklyPlan({
      fighter,
      facts,
      calibrations,
      provider,
      recentChat,
    });
    const plan = await upsertPlan({
      fighterId: fighter.id,
      provider,
      items,
      rationale,
    });
    res.json({ plan, completions: [], weekStart: isoMondayUTC().toISOString() });
  } catch (err) {
    req.log.error({ err }, "planner generation failed");
    res.status(500).json({ error: err instanceof Error ? err.message : "planner failed" });
  }
});

router.post("/planner/items/:key/complete", async (req, res) => {
  const fighter = await loadFighter();
  if (!fighter) {
    res.status(400).json({ error: "no fighter" });
    return;
  }
  const plan = await getCurrentPlan(fighter.id);
  if (!plan) {
    res.status(404).json({ error: "no current plan" });
    return;
  }
  const key = req.params.key;
  const item = plan.items.find((i) => i.key === key);
  if (!item) {
    res.status(404).json({ error: "item not in current plan" });
    return;
  }
  await setCompletion(plan.id, key, true);
  await addFact(fighter.id, {
    category: "pattern",
    topic: `planner: ${item.title}`.slice(0, 120),
    content: `Completed planner item (${item.category}) — ${item.detail}`.slice(0, 600),
    confidence: 2,
    source: `planner:item:${key}`,
  });
  res.json({ ok: true });
});

router.delete("/planner/items/:key/complete", async (req, res) => {
  const fighter = await loadFighter();
  if (!fighter) {
    res.status(400).json({ error: "no fighter" });
    return;
  }
  const plan = await getCurrentPlan(fighter.id);
  if (!plan) {
    res.status(404).json({ error: "no current plan" });
    return;
  }
  const key = req.params.key;
  await setCompletion(plan.id, key, false);
  // Best-effort: resolve any planner-sourced facts for this item so the toggle is reversible.
  const { athleteFactsTable } = await import("@workspace/db");
  const { and: _and, eq: _eq } = await import("drizzle-orm");
  const rows = await _db
    .select()
    .from(athleteFactsTable)
    .where(_and(_eq(athleteFactsTable.fighterId, fighter.id), _eq(athleteFactsTable.source, `planner:item:${key}`)));
  for (const f of rows) {
    if (f.status === "active") {
      await resolveFact(fighter.id, f.id, "planner item un-completed");
    }
  }
  res.json({ ok: true });
});

export default router;
