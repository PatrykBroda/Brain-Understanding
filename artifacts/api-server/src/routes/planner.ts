import { Router, type IRouter, type Request } from "express";
import {
  db,
  fightersTable,
  calibrationsTable,
  athleteFactsTable,
  weeklyPlanItemCompletionsTable,
  type WeeklyPlan,
} from "@workspace/db";
import { and, desc, eq, like } from "drizzle-orm";
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
import { getEntitlementForClerkUser } from "../lib/subscriptionService";
import type { PlanItem } from "@workspace/db";
import { getUserFighter } from "../middlewares/authMiddleware";

// Free tier sees a mission preview: the first item in full, the rest as
// title+category stubs. Shape stays PlanItem-compatible so clients don't break.
function previewPlan(plan: WeeklyPlan): WeeklyPlan {
  const items = plan.items.map((item, i): PlanItem & { locked?: boolean } =>
    i === 0
      ? { ...item, locked: false }
      : {
          key: item.key,
          category: item.category,
          title: item.title,
          detail: "",
          suggestedDays: "",
          sourceFactIds: [],
          sourceCalibrationKeys: [],
          sourceLabel: "",
          locked: true,
        },
  );
  return { ...plan, items };
}

const router: IRouter = Router();

type GenResult =
  | { ok: true; plan: WeeklyPlan }
  | { ok: false; status: number; error: string };

async function runGeneration(
  fighterId: number,
  req: Request,
  fresh: boolean,
): Promise<GenResult> {
  const fighter = (
    await db.select().from(fightersTable).where(eq(fightersTable.id, fighterId)).limit(1)
  )[0];
  if (!fighter) return { ok: false, status: 400, error: "no fighter" };

  const facts = await getActiveFacts(fighter.id);
  const calibrations = await db
    .select()
    .from(calibrationsTable)
    .where(eq(calibrationsTable.fighterId, fighter.id))
    .orderBy(desc(calibrationsTable.createdAt))
    .limit(12);

  if (facts.length === 0 && calibrations.length === 0) {
    return {
      ok: false,
      status: 409,
      error:
        "no recorded signals yet — train and talk to the coach so the model has something to plan from",
    };
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

    if (fresh) {
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
    }

    const plan = await upsertPlan({
      fighterId: fighter.id,
      provider,
      items,
      rationale,
    });
    return { ok: true, plan };
  } catch (err) {
    req.log.error({ err }, "planner generation failed");
    return {
      ok: false,
      status: 500,
      error: err instanceof Error ? err.message : "planner failed",
    };
  }
}

router.get("/planner/current", async (req, res) => {
  const fighter = await getUserFighter(req);
  if (!fighter) {
    res.json({ plan: null, completions: [], weekStart: isoMondayUTC().toISOString() });
    return;
  }
  let plan = await getCurrentPlan(fighter.id);
  if (!plan) {
    // First-hit generation: build this week's plan if signals exist. If no signals
    // yet, return null plan so the UI can render the honest empty state instead
    // of a 409 — GET should be safe.
    const result = await runGeneration(fighter.id, req, false);
    if (result.ok) {
      plan = result.plan;
    } else if (result.status !== 409) {
      res.status(result.status).json({ error: result.error });
      return;
    }
  }
  const completions = plan ? await listCompletions(plan.id) : [];
  const entitlement = await getEntitlementForClerkUser(req.clerkUserId as string);
  const isFree = entitlement.plan === "free";
  res.json({
    plan: plan && isFree ? previewPlan(plan) : plan,
    completions: completions.map((c) => c.itemKey),
    weekStart: isoMondayUTC().toISOString(),
    ...(isFree && plan ? { preview: true } : {}),
  });
});

router.post("/planner/regenerate", async (req, res) => {
  const fighter = await getUserFighter(req);
  if (!fighter) {
    res.status(400).json({ error: "no fighter" });
    return;
  }
  const entitlement = await getEntitlementForClerkUser(req.clerkUserId as string);
  if (entitlement.plan === "free") {
    res.status(402).json({
      error: "Regenerating the weekly mission is a FRAME+ feature.",
      code: "FRAME_PLUS_REQUIRED",
      feature: "weekly_mission",
    });
    return;
  }
  const result = await runGeneration(fighter.id, req, true);
  if (!result.ok) {
    res.status(result.status).json({ error: result.error });
    return;
  }
  res.json({ plan: result.plan, completions: [], weekStart: isoMondayUTC().toISOString() });
});

router.post("/planner/items/:key/complete", async (req, res) => {
  const fighter = await getUserFighter(req);
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
      source: { type: "planner", ref: `planner:item:${key}` },
    });
  }
  res.json({ ok: true });
});

router.delete("/planner/items/:key/complete", async (req, res) => {
  const fighter = await getUserFighter(req);
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
