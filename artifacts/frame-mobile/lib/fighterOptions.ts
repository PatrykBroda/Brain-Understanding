import {
  FREQUENCIES,
  LEGACY_SPORTS as SHARED_LEGACY_SPORTS,
  SPORTS as SHARED_SPORTS,
  levelsForSport as sharedLevelsForSport,
} from "@workspace/onboarding";

export type FighterOption = { key: string; label: string };

// The values themselves (sport keys, level strings, frequencies) live in
// @workspace/onboarding so this app and the coach web store identical strings.
export const SPORTS: FighterOption[] = SHARED_SPORTS.map((s) => ({ key: s.key, label: s.label }));

export const LEGACY_SPORTS: FighterOption[] = SHARED_LEGACY_SPORTS.map((s) => ({ key: s.key, label: s.label }));

export const FREQUENCY_OPTIONS: FighterOption[] = FREQUENCIES.map((f) => ({ key: f, label: f }));

// What the chip says. The stored value stays the shared string.
const LEVEL_LABELS: Record<string, string> = {
  "Amateur Competitor": "Amateur competitor",
};

export function isBjjSport(sport: string | null | undefined): boolean {
  return sport?.trim().toLowerCase() === "bjj";
}

export function levelsForSport(sport: string | null | undefined): FighterOption[] {
  const judo = sport?.trim().toLowerCase() === "judo";
  return sharedLevelsForSport(sport).map((key) => ({
    key,
    label: judo && key === "No belt / other" ? "No rank / other" : (LEVEL_LABELS[key] ?? key),
  }));
}

export function levelLabelForSport(sport: string | null | undefined): string {
  if (isBjjSport(sport)) return "BJJ BELT";
  if (sport?.trim().toLowerCase() === "judo") return "RANK";
  return "EXPERIENCE LEVEL";
}

export function defaultLevelForSport(sport: string | null | undefined): string {
  return levelsForSport(sport)[0].key;
}

/** Noun for the level question in "Choose your ___ to continue." */
export function levelNounForSport(sport: string | null | undefined): string {
  if (isBjjSport(sport)) return "belt";
  if (sport?.trim().toLowerCase() === "judo") return "rank";
  return "experience level";
}
