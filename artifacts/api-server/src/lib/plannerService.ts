import Anthropic from "@anthropic-ai/sdk";
import {
  db,
  weeklyPlansTable,
  weeklyPlanItemCompletionsTable,
  PLAN_CATEGORIES,
  type PlanItem,
  type PlanCategory,
  type WeeklyPlan,
  type Fighter,
  type AthleteFact,
  type Calibration,
} from "@workspace/db";
import { and, asc, desc, eq, gt } from "drizzle-orm";
import { COACH_SYSTEM_PROMPT_STATIC, buildDynamicContext } from "./synochi";
import { openai, OPENAI_COACH_MODEL } from "./openaiClient";
import { selectRelevantNodes } from "./vaultRetrieval";

const anthropicBaseURL = process.env["AI_INTEGRATIONS_ANTHROPIC_BASE_URL"];
const anthropicKey = process.env["AI_INTEGRATIONS_ANTHROPIC_API_KEY"];
if (!anthropicBaseURL || !anthropicKey) {
  throw new Error("Anthropic env not set");
}
const anthropic = new Anthropic({ baseURL: anthropicBaseURL, apiKey: anthropicKey });

export function isoMondayUTC(d: Date = new Date()): Date {
  const out = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dow = out.getUTCDay(); // 0=Sun..6=Sat
  const back = dow === 0 ? 6 : dow - 1;
  out.setUTCDate(out.getUTCDate() - back);
  return out;
}

const PLANNER_INSTRUCTIONS = `You are FRAME's weekly planner. Generate a restrained, honest 5-7 item plan for the next 7 days based on the athlete's accumulated model, recent calibrations, and conversation signals.

HARD RULES:
- Categories: fix, train, technique, regulate, goal_step. Mix is fine, but cover at least 3 different categories.
- EVERY item MUST cite at least one real source: a fact id from the model above, or a calibration key from the recent calibrations. No inventing. No generic advice. If you cannot tie an item to a recorded signal, do NOT include it.
- 5 items minimum, 7 maximum. Each item is one concrete action for THIS week, not aspirational long-term goals.
- title: short imperative, max 60 chars. Lowercase except proper nouns. No emojis.
- detail: 1-3 sentences, the actual protocol/constraint/cue. Direct, structural. No padding.
- sourceLabel: a 4-12 word human-readable phrase describing why this item exists — e.g. "fragments under top pressure (pattern)" or "calibration: pre-roll arousal".
- No streaks, no points, no congratulations, no motivational language. Restraint over engagement.
- The rationale field: 2-3 sentences naming the through-line of the week. What is this week ABOUT for this athlete, given the signals you can see.
`;

function uniqueKey(idx: number, title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return `${idx + 1}-${slug || "item"}`;
}

type RawItem = {
  category?: unknown;
  title?: unknown;
  detail?: unknown;
  sourceFactIds?: unknown;
  sourceCalibrationKeys?: unknown;
  sourceLabel?: unknown;
};
type RawPlan = { rationale?: unknown; items?: unknown };

function validateAndNormalise(
  raw: RawPlan,
  validFactIds: Set<number>,
  validCalibrationKeys: Set<string>,
): { items: PlanItem[]; rationale: string } | { error: string } {
  if (!raw || typeof raw !== "object") return { error: "no plan object" };
  const rationale = typeof raw.rationale === "string" ? raw.rationale.trim() : "";
  if (!Array.isArray(raw.items)) return { error: "items not an array" };
  const items: PlanItem[] = [];
  const MAX = 7;
  for (let i = 0; i < raw.items.length && items.length < MAX; i++) {
    const it = raw.items[i] as RawItem;
    const cat = it.category;
    if (typeof cat !== "string" || !PLAN_CATEGORIES.includes(cat as PlanCategory)) {
      return { error: `item ${i}: invalid category ${String(cat)}` };
    }
    const title = typeof it.title === "string" ? it.title.trim() : "";
    const detail = typeof it.detail === "string" ? it.detail.trim() : "";
    if (!title || !detail) return { error: `item ${i}: missing title/detail` };
    const factIds = Array.isArray(it.sourceFactIds)
      ? it.sourceFactIds
          .filter((n): n is number => typeof n === "number" && validFactIds.has(n))
      : [];
    const calKeys = Array.isArray(it.sourceCalibrationKeys)
      ? it.sourceCalibrationKeys
          .filter((s): s is string => typeof s === "string" && validCalibrationKeys.has(s))
      : [];
    if (factIds.length === 0 && calKeys.length === 0) {
      return { error: `item ${i} ("${title}"): no valid source fact id or calibration key` };
    }
    const sourceLabel = typeof it.sourceLabel === "string" && it.sourceLabel.trim()
      ? it.sourceLabel.trim().slice(0, 120)
      : factIds.length
        ? `fact #${factIds[0]}`
        : `calibration: ${calKeys[0]}`;
    items.push({
      key: uniqueKey(items.length, title),
      category: cat as PlanCategory,
      title: title.slice(0, 80),
      detail: detail.slice(0, 480),
      sourceFactIds: factIds,
      sourceCalibrationKeys: calKeys,
      sourceLabel,
    });
  }
  if (items.length < 5) return { error: `only ${items.length} items, need 5-7` };
  const categoriesSeen = new Set<PlanCategory>(items.map((i) => i.category));
  if (categoriesSeen.size < 3) {
    return { error: `only ${categoriesSeen.size} distinct categories in persisted items, need 3+` };
  }
  return { items, rationale };
}

const PLAN_TOOL: Anthropic.Tool = {
  name: "emit_weekly_plan",
  description: "Emit the weekly plan. Every item must be anchored in a real source (fact id or calibration key).",
  input_schema: {
    type: "object" as const,
    properties: {
      rationale: { type: "string" },
      items: {
        type: "array",
        items: {
          type: "object",
          properties: {
            category: { type: "string", enum: [...PLAN_CATEGORIES] },
            title: { type: "string" },
            detail: { type: "string" },
            sourceFactIds: { type: "array", items: { type: "integer" } },
            sourceCalibrationKeys: { type: "array", items: { type: "string" } },
            sourceLabel: { type: "string" },
          },
          required: ["category", "title", "detail", "sourceFactIds", "sourceCalibrationKeys", "sourceLabel"],
        },
      },
    },
    required: ["rationale", "items"],
  },
};

async function callClaude(systemStatic: string, dynamic: string): Promise<RawPlan> {
  const resp = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2500,
    system: [
      { type: "text", text: systemStatic, cache_control: { type: "ephemeral" } },
      { type: "text", text: dynamic },
    ],
    tools: [PLAN_TOOL],
    tool_choice: { type: "tool", name: "emit_weekly_plan" },
    messages: [{ role: "user", content: "Generate this week's plan now. Use the emit_weekly_plan tool." }],
  });
  for (const block of resp.content) {
    if (block.type === "tool_use" && block.name === "emit_weekly_plan") {
      return block.input as RawPlan;
    }
  }
  throw new Error("claude returned no tool_use");
}

async function callOpenAI(systemStatic: string, dynamic: string): Promise<RawPlan> {
  const completion = await openai.chat.completions.create({
    model: OPENAI_COACH_MODEL,
    max_completion_tokens: 2500,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: systemStatic },
      { role: "system", content: dynamic },
      {
        role: "user",
        content:
          'Generate this week\'s plan now. Respond ONLY with a JSON object matching: { "rationale": string, "items": [ { "category": "fix|train|technique|regulate|goal_step", "title": string, "detail": string, "sourceFactIds": number[], "sourceCalibrationKeys": string[], "sourceLabel": string } ] }',
      },
    ],
  });
  const text = completion.choices[0]?.message?.content ?? "{}";
  return JSON.parse(text) as RawPlan;
}

export async function generateWeeklyPlan(args: {
  fighter: Fighter;
  facts: AthleteFact[];
  calibrations: Calibration[];
  provider: "claude" | "openai";
  recentChat: string;
}): Promise<{ items: PlanItem[]; rationale: string }> {
  const { fighter, facts, calibrations, provider, recentChat } = args;
  const deepNodes = selectRelevantNodes(
    `${fighter.goals ?? ""}\n${fighter.weaknesses ?? ""}\n${recentChat}`,
    4,
  );
  const dynamic =
    buildDynamicContext(fighter, facts, calibrations, deepNodes) +
    "\n\n" +
    PLANNER_INSTRUCTIONS +
    (recentChat
      ? `\n\n# Recent chat signal (most recent first, truncated)\n\n${recentChat.slice(0, 4000)}`
      : "");

  const validFactIds = new Set(facts.map((f) => f.id));
  const validCalibrationKeys = new Set(calibrations.map((c) => c.promptKey));

  for (let attempt = 0; attempt < 2; attempt++) {
    const raw =
      provider === "openai"
        ? await callOpenAI(COACH_SYSTEM_PROMPT_STATIC, dynamic)
        : await callClaude(COACH_SYSTEM_PROMPT_STATIC, dynamic);
    const result = validateAndNormalise(raw, validFactIds, validCalibrationKeys);
    if ("items" in result) return result;
    if (attempt === 1) {
      throw new Error(`planner validation failed twice: ${result.error}`);
    }
  }
  throw new Error("planner unreachable");
}

export async function getCurrentPlan(fighterId: number): Promise<WeeklyPlan | null> {
  const weekStart = isoMondayUTC();
  const [plan] = await db
    .select()
    .from(weeklyPlansTable)
    .where(and(eq(weeklyPlansTable.fighterId, fighterId), eq(weeklyPlansTable.weekStart, weekStart)))
    .limit(1);
  return plan ?? null;
}

export async function listCompletions(planId: number) {
  return db
    .select()
    .from(weeklyPlanItemCompletionsTable)
    .where(eq(weeklyPlanItemCompletionsTable.planId, planId))
    .orderBy(asc(weeklyPlanItemCompletionsTable.completedAt));
}

export async function upsertPlan(args: {
  fighterId: number;
  provider: "claude" | "openai";
  items: PlanItem[];
  rationale: string;
}): Promise<WeeklyPlan> {
  const weekStart = isoMondayUTC();
  return await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(weeklyPlansTable)
      .values({
        fighterId: args.fighterId,
        weekStart,
        aiProvider: args.provider,
        items: args.items,
        rationale: args.rationale,
      })
      .onConflictDoUpdate({
        target: [weeklyPlansTable.fighterId, weeklyPlansTable.weekStart],
        set: {
          items: args.items,
          rationale: args.rationale,
          aiProvider: args.provider,
        },
      })
      .returning();
    // wipe completions (item keys may not match) atomically with the upsert
    await tx
      .delete(weeklyPlanItemCompletionsTable)
      .where(eq(weeklyPlanItemCompletionsTable.planId, row!.id));
    return row!;
  });
}

export async function setCompletion(planId: number, itemKey: string, done: boolean) {
  if (done) {
    await db
      .insert(weeklyPlanItemCompletionsTable)
      .values({ planId, itemKey })
      .onConflictDoNothing();
  } else {
    await db
      .delete(weeklyPlanItemCompletionsTable)
      .where(
        and(
          eq(weeklyPlanItemCompletionsTable.planId, planId),
          eq(weeklyPlanItemCompletionsTable.itemKey, itemKey),
        ),
      );
  }
}

export async function recentChatSummary(conversationId: number): Promise<string> {
  const { messagesTable } = await import("@workspace/db");
  const rows = await db
    .select()
    .from(messagesTable)
    .where(
      and(
        eq(messagesTable.conversationId, conversationId),
        gt(messagesTable.createdAt, new Date(Date.now() - 14 * 24 * 60 * 60 * 1000)),
      ),
    )
    .orderBy(desc(messagesTable.createdAt))
    .limit(24);
  return rows
    .reverse()
    .map((m) => `[${m.role}] ${m.content}`)
    .join("\n\n");
}
