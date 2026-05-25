import Anthropic from "@anthropic-ai/sdk";
import type { Logger } from "pino";
import type { AthleteFact, Fighter, FactCategory } from "@workspace/db";
import { FACT_CATEGORIES } from "@workspace/db";
import { addFact, getActiveFacts, resolveFact, supersedeFact } from "./factsService";

const baseURL = process.env["AI_INTEGRATIONS_ANTHROPIC_BASE_URL"];
const apiKey = process.env["AI_INTEGRATIONS_ANTHROPIC_API_KEY"];
if (!baseURL || !apiKey) {
  throw new Error("Anthropic env vars missing");
}
const client = new Anthropic({ baseURL, apiKey });

const SYSTEM = `You are the memory writer for a personal BJJ + nervous-system coaching system called Synochi. Your only job is to read the latest exchange between the athlete and the coach and update the athlete's long-term model.

Rules:
- Only record DURABLE observations — patterns, knowledge level, named weaknesses/strengths, stated preferences, events, goals, life context that affects training. Do NOT record one-off moods or single-session noise unless the athlete states it as a recurring thing.
- Prefer SUPERSEDING an existing fact over adding a near-duplicate. If the athlete refines or corrects an earlier observation, supersede it.
- RESOLVE a fact when it's clearly no longer true (a weakness has been closed, a goal hit, a context that has passed).
- Confidence: 1 = tentative single mention, 3 = evidenced, 5 = repeated/definitive.
- For technical_knowledge facts: topic = the position/concept (e.g. "half-guard pass", "deep half"). Content describes WHAT the athlete knows and at what level (foundational / working / advanced).
- Be terse. One sentence per fact. No padding.
- If nothing durable happened this turn, call no tools.

You have these tools: add_fact, supersede_fact, resolve_fact. Use them. Do not write prose.`;

const tools: Anthropic.Tool[] = [
  {
    name: "add_fact",
    description: "Record a new durable observation about the athlete.",
    input_schema: {
      type: "object",
      properties: {
        category: { type: "string", enum: [...FACT_CATEGORIES] },
        topic: { type: "string", description: "Short tag, e.g. 'half-guard pass', 'competition anxiety', 'left knee'." },
        content: { type: "string", description: "One sentence stating the observation." },
        confidence: { type: "integer", minimum: 1, maximum: 5 },
      },
      required: ["category", "topic", "content", "confidence"],
    },
  },
  {
    name: "supersede_fact",
    description: "Replace an existing fact with a refined or corrected version. Use the id from the current facts list.",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "integer" },
        replacement_content: { type: "string" },
        confidence: { type: "integer", minimum: 1, maximum: 5 },
        reason: { type: "string", description: "Why the previous fact no longer fits." },
      },
      required: ["id", "replacement_content", "confidence", "reason"],
    },
  },
  {
    name: "resolve_fact",
    description: "Mark a fact as no longer active (weakness closed, goal hit, context passed).",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "integer" },
        reason: { type: "string" },
      },
      required: ["id", "reason"],
    },
  },
];

function formatFacts(facts: AthleteFact[]): string {
  if (facts.length === 0) return "(no facts yet)";
  return facts
    .map(
      (f) =>
        `- id=${f.id} [${f.category}] topic="${f.topic}" conf=${f.confidence} :: ${f.content}`,
    )
    .join("\n");
}

export async function extractMemory(args: {
  fighter: Fighter;
  userText: string;
  assistantText: string;
  log: Logger;
}): Promise<void> {
  const { fighter, userText, assistantText, log } = args;
  try {
    const facts = await getActiveFacts(fighter.id);
    const userMessage = `Athlete profile baseline:
name=${fighter.name} | age=${fighter.age} | art=${fighter.art} | level=${fighter.level} | competes=${fighter.competes}
stated goals: ${fighter.goals || "(none)"}
stated weaknesses: ${fighter.weaknesses || "(none)"}

Current active facts (most recent first):
${formatFacts(facts)}

Latest exchange:
ATHLETE: ${userText}

COACH: ${assistantText}

Update the model. Call tools only. No prose.`;

    const response = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 8192,
      system: SYSTEM,
      tools,
      messages: [{ role: "user", content: userMessage }],
    });

    let added = 0;
    let superseded = 0;
    let resolved = 0;
    for (const block of response.content) {
      if (block.type !== "tool_use") continue;
      const input = block.input as Record<string, unknown>;
      try {
        if (block.name === "add_fact") {
          const cat = input["category"];
          if (typeof cat !== "string" || !(FACT_CATEGORIES as readonly string[]).includes(cat)) continue;
          await addFact(fighter.id, {
            category: cat as FactCategory,
            topic: String(input["topic"] ?? ""),
            content: String(input["content"] ?? ""),
            confidence: Number(input["confidence"] ?? 3),
            source: "chat",
          });
          added++;
        } else if (block.name === "supersede_fact") {
          await supersedeFact(fighter.id, Number(input["id"]), {
            content: String(input["replacement_content"] ?? ""),
            confidence: Number(input["confidence"] ?? 3),
            reason: String(input["reason"] ?? ""),
            source: "chat",
          });
          superseded++;
        } else if (block.name === "resolve_fact") {
          await resolveFact(fighter.id, Number(input["id"]), String(input["reason"] ?? ""));
          resolved++;
        }
      } catch (err) {
        log.warn({ err, tool: block.name }, "memory tool call failed");
      }
    }
    if (added + superseded + resolved > 0) {
      log.info({ added, superseded, resolved }, "memory updated");
    }
  } catch (err) {
    log.error({ err }, "memory extraction failed");
  }
}
