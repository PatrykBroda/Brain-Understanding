import { ALL_LEVELS, FREQUENCIES, LEGACY_SPORTS, SPORTS, sportLabelFor } from "./options";

// Maps every spelling an older build (or a hand-edited row) may hold onto the
// canonical set in options.ts. Anything unrecognised is returned UNCHANGED:
// "MMA (Wrestling-heavy)" in `art` or a free-text level is a legitimate value,
// not something to overwrite.

const squash = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9+]+/g, " ")
    .trim();

const SPORT_ALIASES: Record<string, string> = {
  "bjj grappling": "bjj",
  "brazilian jiu jitsu": "bjj",
  "jiu jitsu": "bjj",
  jiujitsu: "bjj",
  "mixed martial arts": "mma",
  muaythai: "muay_thai",
  "kick boxing": "kickboxing",
  "tae kwon do": "taekwondo",
};

const SPORT_LOOKUP = new Map<string, string>();
for (const s of [...SPORTS, ...LEGACY_SPORTS]) {
  SPORT_LOOKUP.set(squash(s.key), s.key);
  SPORT_LOOKUP.set(squash(s.label), s.key);
}
for (const [alias, key] of Object.entries(SPORT_ALIASES)) SPORT_LOOKUP.set(alias, key);

/** A sport key for any spelling of a sport ("BJJ / Grappling" -> "bjj"), or null when unknown. */
export function sportKeyFrom(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  return SPORT_LOOKUP.get(squash(raw)) ?? null;
}

/** primarySport: always the lowercase key. Unknown values pass through trimmed. */
export function normalisePrimarySport(raw: string): string {
  return sportKeyFrom(raw) ?? raw.trim();
}

/** art: a plain sport name becomes its canonical label ("bjj" -> "BJJ"); styled values like "MMA (Wrestling-heavy)" are kept. */
export function normaliseArt(raw: string): string {
  const key = sportKeyFrom(raw);
  return (key && sportLabelFor(key)) || raw.trim();
}

const LEVEL_ALIASES: Record<string, string> = {
  "no rank other": "No belt / other",
  "no belt": "No belt / other",
  amateur: "Amateur Competitor",
  pro: "Professional",
};
const LEVEL_LOOKUP = new Map<string, string>();
for (const l of ALL_LEVELS) LEVEL_LOOKUP.set(squash(l), l);
for (const [alias, level] of Object.entries(LEVEL_ALIASES)) LEVEL_LOOKUP.set(alias, level);

/** level: fixes case/spacing variants ("beginner", "Amateur competitor"); anything else is kept. */
export function normaliseLevel(raw: string): string {
  return LEVEL_LOOKUP.get(squash(raw)) ?? raw.trim();
}

const FREQUENCY_LOOKUP = new Map<string, string>();
for (const f of FREQUENCIES) FREQUENCY_LOOKUP.set(squash(f), f);
// Mobile used "1-2" / "3-4" / "5+" (shown as "x / week"). "5+" had no upper bound; 5-6x is the closest bucket.
const FREQUENCY_ALIASES: Record<string, string> = {
  "1 2": FREQUENCIES[0],
  "1 2x": FREQUENCIES[0],
  "1 2 week": FREQUENCIES[0],
  "1 2 times week": FREQUENCIES[0],
  "3 4": FREQUENCIES[1],
  "3 4x": FREQUENCIES[1],
  "3 4 week": FREQUENCIES[1],
  "3 4 times week": FREQUENCIES[1],
  "5+": FREQUENCIES[2],
  "5+ week": FREQUENCIES[2],
  "5": FREQUENCIES[2],
  "5 6": FREQUENCIES[2],
  "5 6x": FREQUENCIES[2],
  "5 6 week": FREQUENCIES[2],
  daily: FREQUENCIES[3],
  "daily pro": FREQUENCIES[3],
};
for (const [alias, f] of Object.entries(FREQUENCY_ALIASES)) FREQUENCY_LOOKUP.set(alias, f);

/** trainingFrequency: "3-4" / "5+ / week" / "3-4x / week" all become the canonical string. */
export function normaliseFrequency(raw: string): string {
  return FREQUENCY_LOOKUP.get(squash(raw)) ?? raw.trim();
}

export type FighterAnswers = {
  art?: string;
  primarySport?: string;
  level?: string;
  trainingFrequency?: string;
};

/** Normalise whichever of the four answer fields are present. Pure; never adds a missing field. */
export function normaliseFighterAnswers<T extends FighterAnswers>(input: T): T {
  const out: T = { ...input };
  if (typeof out.primarySport === "string") out.primarySport = normalisePrimarySport(out.primarySport);
  if (typeof out.art === "string") out.art = normaliseArt(out.art);
  if (typeof out.level === "string") out.level = normaliseLevel(out.level);
  if (typeof out.trainingFrequency === "string") out.trainingFrequency = normaliseFrequency(out.trainingFrequency);
  return out;
}
