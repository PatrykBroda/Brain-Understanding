import { Router, type IRouter } from "express";
import {
  db,
  fightersTable,
  calibrationsTable,
  athleteFactsTable,
  weeklyPlanItemCompletionsTable,
} from "@workspace/db";
import { and, asc, desc, eq, like } from "drizzle-orm";
import { getActiveFacts, addFact, resolveFact } from "../lib/factsService";
import {
  generateWeeklyPlan,
  getCurrentPlan,
  listCompletions,
  upsertPlan,
  recentChatSummary,
  isoMondayUTC,
} from "../lib/plannerService";
import { getOrCreateActiveConversation } from "./conversation";

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

    // Resolve any still-active planner-sourced pattern facts from the prior plan —
    // their item keys won't match the regenerated plan, so leaving them active would
    // keep them influencing future plans as ghost signals.
    const staleFacts = await db
      .select()
      .from(athleteFactsTable)
      .where(
        and(
          eq(athleteFactsTable.fighterId, fighter.id),
          eq(athleteFactsTable.status, "active"),
          like(athleteFactsTable.source, "planner:item:%"),
        ),
      );
    for (const f of staleFacts) {
      await resolveFact(fighter.id, f.id, "planner regenerated");
    }

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

  // Idempotency: only write a pattern fact when the completion row is *newly*
  // inserted. If it already existed, do nothing — otherwise repeated taps would
  // pollute the athlete model with duplicate fact rows.
  const inserted = await db
    .insert(weeklyPlanItemCompletionsTable)
    .values({ planId: plan.id, itemKey: key })
    .onConflictDoNothing()
    .returning({ id: weeklyPlanItemCompletionsTable.id });

  if (inserted.length > 0) {
    await addFact(fighter.id, {
      category: "pattern",
      topic: `planner: ${item.title}`.slice(0, 120),
      content: `Completed planner item (${item.category}) — ${item.detail}`.slice(0, 600),
      confidence: 2,
      source: `planner:item:${key}`,
    });
  }
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
  const removed = await db
    .delete(weeklyPlanItemCompletionsTable)
    .where(
      and(
        eq(weeklyPlanItemCompletionsTable.planId, plan.id),
        eq(weeklyPlanItemCompletionsTable.itemKey, key),
      ),
    )
    .returning({ id: weeklyPlanItemCompletionsTable.id });

  if (removed.length > 0) {
    // Resolve any active planner-sourced facts for this item so the toggle is reversible.
    const rows = await db
      .select()
      .from(athleteFactsTable)
      .where(
        and(
          eq(athleteFactsTable.fighterId, fighter.id),
          eq(athleteFactsTable.source, `planner:item:${key}`),
          eq(athleteFactsTable.status, "active"),
        ),
      );
    for (const f of rows) {
      await resolveFact(fighter.id, f.id, "planner item un-completed");
    }
  }
  res.json({ ok: true });
});

export default router;
