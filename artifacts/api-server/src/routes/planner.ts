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
  hasProfileSignals,
  weekStartForLocalDate,
} from "../lib/plannerService";
import { getOrCreateActiveConversation } from "./conversation";
import { getEntitlementForUserId } from "../lib/subscriptionService";
import type { PlanItem } from "@workspace/db";
import { getUserFighter } from "../middlewares/authMiddleware";
import { hasAiConsentForUser, requireAiConsent } from "../lib/aiConsent";
import { describeProviderError, isRetryableProviderError } from "../lib/aiRetry";
import { rememberTimezone, todayFor } from "../middlewares/timezone";

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

/**
 * Why a generation did not produce a plan, in a form the apps can show and act on.
 * `retryable` tells the UI whether a "Try again" button makes sense.
 */
export type MissionErrorCode =
  | "AI_CONSENT_REQUIRED"
  | "NO_SIGNALS"
  | "NO_FIGHTER"
  | "AI_BUSY"
  | "GENERATION_TIMEOUT"
  | "GENERATION_INVALID"
  | "GENERATION_FAILED";

type GenResult =
  | { ok: true; plan: WeeklyPlan }
  | { ok: false; status: number; error: string; code: MissionErrorCode; retryable: boolean };

const MESSAGES: Record<MissionErrorCode, string> = {
  AI_CONSENT_REQUIRED: "AI consent is required before using this feature.",
  NO_SIGNALS: "FRAME has nothing to build a mission from yet. Tell your coach about your training, or finish your profile, then try again.",
  NO_FIGHTER: "Finish setting up your profile first.",
  AI_BUSY: "FRAME is busy right now. Your mission was not built. Try again in a minute.",
  GENERATION_TIMEOUT: "Building your mission took too long. Nothing was lost. Try again.",
  GENERATION_INVALID: "FRAME couldn't build a mission it trusts from what it holds on you. Try again, or tell your coach more first.",
  GENERATION_FAILED: "Your mission couldn't be built. Try again in a moment.",
};

function fail(code: MissionErrorCode, status: number, retryable: boolean): GenResult {
  return { ok: false, status, error: MESSAGES[code], code, retryable };
}

function failBody(r: Extract<GenResult, { ok: false }>) {
  return { error: r.error, code: r.code, retryable: r.retryable };
}

// A second tap while a plan is being built joins the first generation instead of
// starting another (the old behaviour: "Generate" did nothing, so people tapped again).
const inFlight = new Map<number, Promise<GenResult>>();

async function signalsFor(fighterId: number) {
  const facts = await getActiveFacts(fighterId);
  const calibrations = await db
    .select()
    .from(calibrationsTable)
    .where(eq(calibrationsTable.fighterId, fighterId))
    .orderBy(desc(calibrationsTable.createdAt))
    .limit(12);
  return { facts, calibrations };
}

async function generate(fighterId: number, req: Request, fresh: boolean, weekStart: Date): Promise<GenResult> {
  // Defense in depth for callers other than the HTTP handlers.
  if (!req.userId || !(await hasAiConsentForUser(req.userId))) {
    return fail("AI_CONSENT_REQUIRED", 403, false);
  }
  const fighter = (
    await db.select().from(fightersTable).where(eq(fightersTable.id, fighterId)).limit(1)
  )[0];
  if (!fighter) return fail("NO_FIGHTER", 400, false);

  const { facts, calibrations } = await signalsFor(fighter.id);
  if (facts.length === 0 && calibrations.length === 0 && !hasProfileSignals(fighter)) {
    return fail("NO_SIGNALS", 409, false);
  }

  const conversation = await getOrCreateActiveConversation(fighter.id);
  const recentChat = await recentChatSummary(conversation.id);
  const chosen = conversation.aiProvider === "openai" ? "openai" : "claude";

  const attempt = (provider: "claude" | "openai") =>
    generateWeeklyPlan({
      userId: req.userId as string,
      fighter,
      facts,
      calibrations,
      provider,
      recentChat,
    });

  try {
    let provider: "claude" | "openai" = chosen;
    let generated;
    try {
      generated = await attempt(provider);
    } catch (err) {
      // The chosen provider is busy or down: build the mission with the other one.
      if (!isRetryableProviderError(err)) throw err;
      req.log.warn({ err, from: provider }, "planner: provider failed, falling back");
      provider = provider === "claude" ? "openai" : "claude";
      generated = await attempt(provider);
    }

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
      items: generated.items,
      rationale: generated.rationale,
      weekStart,
    });
    return { ok: true, plan };
  } catch (err) {
    if (typeof err === "object" && err !== null && "code" in err && err.code === "AI_CONSENT_REQUIRED") {
      return fail("AI_CONSENT_REQUIRED", 403, false);
    }
    const info = describeProviderError(err);
    req.log.error({ err, kind: info.kind, status: info.status }, "planner generation failed");
    if (info.kind === "timeout") return fail("GENERATION_TIMEOUT", 504, true);
    if (info.kind === "rate_limit" || info.kind === "overloaded") return fail("AI_BUSY", 503, true);
    if (err instanceof Error && /validation failed twice/.test(err.message)) return fail("GENERATION_INVALID", 502, true);
    return fail("GENERATION_FAILED", 500, true);
  }
}

function runGeneration(fighterId: number, req: Request, fresh: boolean, weekStart: Date): Promise<GenResult> {
  const running = inFlight.get(fighterId);
  if (running) return running;
  const p = generate(fighterId, req, fresh, weekStart).finally(() => inFlight.delete(fighterId));
  inFlight.set(fighterId, p);
  return p;
}

function weekFor(req: Request, tz: string | null | undefined): Date {
  return weekStartForLocalDate(todayFor(req, tz));
}

// Reading the mission NEVER builds one. (It used to generate inline on first read; with
// a slow provider that left the screen on a spinner with no way out.) Building is an
// explicit action: POST /planner/generate.
router.get("/planner/current", async (req, res) => {
  const fighter = await getUserFighter(req);
  if (!fighter) {
    res.json({ plan: null, completions: [], weekStart: weekStartForLocalDate(todayFor(req, null)).toISOString(), canGenerate: false, generating: false });
    return;
  }
  await rememberTimezone(req, fighter);
  const weekStart = weekFor(req, fighter.timezone);
  const plan = await getCurrentPlan(fighter.id, weekStart);
  const completions = plan ? await listCompletions(plan.id) : [];
  const entitlement = await getEntitlementForUserId(req.userId as string);
  const isFree = entitlement.plan === "free";
  const { facts, calibrations } = await signalsFor(fighter.id);
  const canGenerate = facts.length > 0 || calibrations.length > 0 || hasProfileSignals(fighter);
  res.set("Cache-Control", "no-store");
  res.json({
    plan: plan && isFree ? previewPlan(plan) : plan,
    completions: completions.map((c) => c.itemKey),
    weekStart: weekStart.toISOString(),
    canGenerate,
    generating: inFlight.has(fighter.id),
    ...(isFree && plan ? { preview: true } : {}),
  });
});

async function handleGenerate(req: Request, res: import("express").Response) {
  const fighter = await getUserFighter(req);
  if (!fighter) {
    res.status(400).json({ error: MESSAGES.NO_FIGHTER, code: "NO_FIGHTER", retryable: false });
    return;
  }
  if (!(await requireAiConsent(req, res))) return;
  await rememberTimezone(req, fighter);
  const weekStart = weekFor(req, fighter.timezone);
  const existing = await getCurrentPlan(fighter.id, weekStart);
  const entitlement = await getEntitlementForUserId(req.userId as string);
  // Building the first mission of a week is free; replacing one is FRAME+.
  if (existing && entitlement.plan === "free") {
    res.status(402).json({
      error: "Regenerating the weekly mission is a FRAME+ feature.",
      code: "FRAME_PLUS_REQUIRED",
      feature: "weekly_mission",
    });
    return;
  }
  const result = await runGeneration(fighter.id, req, existing != null, weekStart);
  if (!result.ok) {
    res.status(result.status).json(failBody(result));
    return;
  }
  const completions = await listCompletions(result.plan.id);
  res.json({
    plan: entitlement.plan === "free" ? previewPlan(result.plan) : result.plan,
    completions: completions.map((c) => c.itemKey),
    weekStart: weekStart.toISOString(),
    canGenerate: true,
    generating: false,
    ...(entitlement.plan === "free" ? { preview: true } : {}),
  });
}

router.post("/planner/generate", (req, res) => handleGenerate(req, res));
// Older app builds call this for both "Generate" and "Regenerate".
router.post("/planner/regenerate", (req, res) => handleGenerate(req, res));

router.post("/planner/items/:key/complete", async (req, res) => {
  const fighter = await getUserFighter(req);
  if (!fighter) {
    res.status(400).json({ error: "no fighter" });
    return;
  }
  const plan = await getCurrentPlan(fighter.id, weekFor(req, fighter.timezone));
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
  const plan = await getCurrentPlan(fighter.id, weekFor(req, fighter.timezone));
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
