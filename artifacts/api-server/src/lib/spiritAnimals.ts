import Anthropic from "@anthropic-ai/sdk";
import type { Logger } from "pino";
import type { Fighter } from "@workspace/db";

const baseURL = process.env["AI_INTEGRATIONS_ANTHROPIC_BASE_URL"];
const apiKey = process.env["AI_INTEGRATIONS_ANTHROPIC_API_KEY"];
if (!baseURL || !apiKey) {
  throw new Error("Anthropic env vars missing");
}
const client = new Anthropic({ baseURL, apiKey });

// Curated bestiary. The AI may only choose one of these keys; each maps to a
// pre-rendered emblem in the coach app (public/spirit/<key>.png).
export const SPIRIT_ANIMALS = [
  { key: "wolf", name: "Wolf", essence: "relentless pressure, chains attacks, never lets the pace drop" },
  { key: "falcon", name: "Falcon", essence: "precise and fast, strikes from sharp angles, hunts openings" },
  { key: "bear", name: "Bear", essence: "heavy and immovable, smothering top pressure, grinds people down" },
  { key: "cobra", name: "Cobra", essence: "patient and baiting, sits still then explodes into the finish" },
  { key: "panther", name: "Panther", essence: "silent, fluid, deceptive — ambushes and slips frames" },
  { key: "ox", name: "Ox", essence: "endurance and forward walk, outlasts and breaks the will" },
  { key: "shark", name: "Shark", essence: "constant forward pressure, smells fatigue and swarms it" },
  { key: "eagle", name: "Eagle", essence: "vision and control, manages range and distance, sees two moves ahead" },
  { key: "mantis", name: "Mantis", essence: "technical trap-setter, builds frames and angles, springs the snare" },
  { key: "ram", name: "Ram", essence: "head-on collision, pure will, walks through the storm" },
] as const;

export type SpiritAnimalKey = (typeof SPIRIT_ANIMALS)[number]["key"];
const KEYS = SPIRIT_ANIMALS.map((a) => a.key);

export function isSpiritAnimalKey(v: string): v is SpiritAnimalKey {
  return (KEYS as string[]).includes(v);
}

export function spiritAnimalName(key: string): string {
  return SPIRIT_ANIMALS.find((a) => a.key === key)?.name ?? "";
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
    const bestiary = SPIRIT_ANIMALS.map((a) => `- ${a.key}: ${a.essence}`).join("\n");
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
