import Anthropic from "@anthropic-ai/sdk";
import type { Logger } from "pino";
import type { AthleteFact, Fighter, FactCategory } from "@workspace/db";
import { FACT_CATEGORIES } from "@workspace/db";
import { ONTOLOGY_KEYS } from "@workspace/ontology";
import {
  addFact,
  confirmFact,
  getActiveFacts,
  resolveFact,
  supersedeFact,
} from "./factsService";

const baseURL = process.env["AI_INTEGRATIONS_ANTHROPIC_BASE_URL"];
const apiKey = process.env["AI_INTEGRATIONS_ANTHROPIC_API_KEY"];
if (!baseURL || !apiKey) {
  throw new Error("Anthropic env vars missing");
}
const client = new Anthropic({ baseURL, apiKey });

const SYSTEM = `You are the memory writer for a personal BJJ + nervous-system coaching system called Synochi. Your only job is to read the latest exchange between the athlete and the coach and update the athlete's long-term model.

Rules:
- Only record DURABLE observations — patterns, knowledge level, named weaknesses/strengths, stated preferences, events, goals, life context that affects training. Do NOT record one-off moods or single-session noise unless the athlete states it as a recurring thing.
- If this exchange provides NEW INDEPENDENT EVIDENCE for an observation that ALREADY EXISTS in the facts list, call confirm_fact with its id — do NOT add a near-duplicate. Only confirm when it is the SAME observation, not merely the same topic. This is how the model's confidence grows.
- SUPERSEDE an existing fact only when the athlete corrects it — the old wording was wrong or outdated.
- RESOLVE a fact when it's clearly no longer true (a weakness has been closed, a goal hit, a context that has passed).
- You never assign confidence. The system derives it from evidence: how many independent sightings, from how many different sources, and whether the athlete confirmed it.
- Set athlete_stated=true only when the athlete asserts the observation about themselves in their own words; leave it false for your inferences.
- When the observation clearly fits one of the ontology domains, set subcategory; otherwise omit it.
- For technical_knowledge facts: topic = the position/concept (e.g. "half-guard pass", "deep half"). Content describes WHAT the athlete knows and at what level (foundational / working / advanced).
- Be terse. One sentence per fact. No padding.
- If nothing durable happened this turn, call no tools.

You have these tools: add_fact, confirm_fact, supersede_fact, resolve_fact. Use them. Do not write prose.`;

const tools: Anthropic.Tool[] = [
  {
    name: "add_fact",
    description: "Record a NEW durable observation about the athlete (no existing fact covers it).",
    input_schema: {
      type: "object",
      properties: {
        category: { type: "string", enum: [...FACT_CATEGORIES] },
        topic: { type: "string", description: "Short tag, e.g. 'half-guard pass', 'competition anxiety', 'left knee'." },
        content: { type: "string", description: "One sentence stating the observation." },
        athlete_stated: {
          type: "boolean",
          description: "true ONLY if the athlete asserted this about themselves in their own words.",
        },
        subcategory: {
          type: "string",
          enum: [...ONTOLOGY_KEYS],
          description: "Ontology domain key when the observation clearly fits one. Omit otherwise.",
        },
      },
      required: ["category", "topic", "content"],
    },
  },
  {
    name: "confirm_fact",
    description:
      "This exchange provides new independent evidence for an EXISTING fact (same observation, use the id from the facts list). Strengthens it instead of duplicating.",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "integer" },
        refined_content: {
          type: "string",
          description: "Optional: better wording for the SAME observation. Omit to keep current wording.",
        },
      },
      required: ["id"],
    },
  },
  {
    name: "supersede_fact",
    description: "Replace an existing fact ONLY when it was wrong or outdated and the athlete corrected it. Use the id from the current facts list.",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "integer" },
        replacement_content: { type: "string" },
        reason: { type: "string", description: "Why the previous fact no longer fits." },
      },
      required: ["id", "replacement_content", "reason"],
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
        `- id=${f.id} [${f.category}${f.subcategory ? ` · ${f.subcategory}` : ""}] topic="${f.topic}" conf=${f.confidence} evidence=${f.evidenceCount} :: ${f.content}`,
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
    let confirmed = 0;
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
            source: { type: "chat" },
            subcategory: typeof input["subcategory"] === "string" ? input["subcategory"] : null,
            athleteStated: input["athlete_stated"] === true,
          });
          added++;
        } else if (block.name === "confirm_fact") {
          const refined = input["refined_content"];
          await confirmFact(
            fighter.id,
            Number(input["id"]),
            { type: "chat" },
            typeof refined === "string" ? refined : undefined,
          );
          confirmed++;
        } else if (block.name === "supersede_fact") {
          await supersedeFact(fighter.id, Number(input["id"]), {
            content: String(input["replacement_content"] ?? ""),
            reason: String(input["reason"] ?? ""),
            source: { type: "chat" },
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
    if (added + confirmed + superseded + resolved > 0) {
      log.info({ added, confirmed, superseded, resolved }, "memory updated");
    }
  } catch (err) {
    log.error({ err }, "memory extraction failed");
  }
}
