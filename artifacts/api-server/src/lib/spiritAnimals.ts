import Anthropic from "@anthropic-ai/sdk";
import type { Logger } from "pino";
import type { Fighter } from "@workspace/db";
import { ARCHETYPES, archetypeName, isArchetypeKey, type ArchetypeKey } from "@workspace/archetypes";

const baseURL = process.env["AI_INTEGRATIONS_ANTHROPIC_BASE_URL"];
const apiKey = process.env["AI_INTEGRATIONS_ANTHROPIC_API_KEY"];
if (!baseURL || !apiKey) {
  throw new Error("Anthropic env vars missing");
}
const client = new Anthropic({ baseURL, apiKey });

// The bestiary is the shared FRAME archetype mythology. The AI may only choose
// one of these keys; each maps to a pre-rendered emblem in the coach app
// (public/spirit/<key>.png).
const KEYS = ARCHETYPES.map((a) => a.key);

export type SpiritAnimalKey = ArchetypeKey;

export function isSpiritAnimalKey(v: string): v is SpiritAnimalKey {
  return isArchetypeKey(v);
}

export function spiritAnimalName(key: string): string {
  return archetypeName(key);
}

const SYSTEM = `You read a martial artist's self-description and assign them a spirit animal from a fixed bestiary, the way a sharp old coach would size up a new athlete in one glance.

Pick the ONE animal whose essence best matches how this person actually moves, thinks, and fights — weighing their personality description most heavily, then their art, level, goals, and weaknesses.

Then write a tagline: ONE short line, 6-12 words, that names what kind of fighter they are. It should land like a coach's read — specific, a little dry-humoured, never flattering, never robotic. NO emojis. Do not restate their age or belt. Do not say "you are a..." — just state the read.

Good taglines: "All forward gears, no reverse." / "Patient until it is suddenly over." / "Wins the war by never speeding up."
Bad taglines: "A 27 year old blue belt who likes BJJ." / "You are very strong and skilled!"

Call assign_spirit_animal exactly once. No prose.`;

const tools: Anthropic.Tool[] = [
  {
    name: "assign_spirit_animal",
    description: "Assign the athlete their spirit animal and a coach's-read tagline.",
    input_schema: {
      type: "object",
      properties: {
        animal: { type: "string", enum: [...KEYS] },
        tagline: { type: "string", description: "6-12 words, a coach's sharp read. No emojis." },
      },
      required: ["animal", "tagline"],
    },
  },
];

export async function deriveSpiritAnimal(
  fighter: Pick<
    Fighter,
    "name" | "age" | "art" | "level" | "trainingFrequency" | "goals" | "weaknesses" | "personality" | "competes"
  >,
  log: Logger,
): Promise<{ animal: SpiritAnimalKey; tagline: string } | null> {
  try {
    const bestiary = ARCHETYPES.map(
      (a) => `- ${a.key}: ${a.essence}. Under pressure: ${a.pressureSignature}`,
    ).join("\n");
    const userMessage = `BESTIARY (choose one key):
${bestiary}

ATHLETE:
art: ${fighter.art} | level: ${fighter.level} | trains: ${fighter.trainingFrequency} | competes: ${fighter.competes}
goals: ${fighter.goals || "(none stated)"}
weaknesses: ${fighter.weaknesses || "(none stated)"}
personality, in their own words: ${fighter.personality || "(none given)"}

Assign their spirit animal and tagline now.`;

    const response = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 512,
      system: SYSTEM,
      tools,
      tool_choice: { type: "tool", name: "assign_spirit_animal" },
      messages: [{ role: "user", content: userMessage }],
    });

    for (const block of response.content) {
      if (block.type !== "tool_use" || block.name !== "assign_spirit_animal") continue;
      const input = block.input as Record<string, unknown>;
      const animal = String(input["animal"] ?? "");
      const tagline = String(input["tagline"] ?? "").trim();
      if (!isSpiritAnimalKey(animal)) continue;
      return { animal, tagline };
    }
    return null;
  } catch (err) {
    log.error({ err }, "spirit animal derivation failed");
    return null;
  }
}
