export type FighterOption = { key: string; label: string };

export const SPORTS: FighterOption[] = [
  { key: "bjj", label: "BJJ" },
  { key: "mma", label: "MMA" },
  { key: "boxing", label: "Boxing" },
  { key: "muay_thai", label: "Muay Thai" },
  { key: "kickboxing", label: "Kickboxing" },
  { key: "wrestling", label: "Wrestling" },
  { key: "judo", label: "Judo" },
  { key: "taekwondo", label: "Taekwondo" },
  { key: "other", label: "Other" },
];

export const LEGACY_SPORTS: FighterOption[] = [
  { key: "karate", label: "Karate" },
  { key: "sambo", label: "Sambo" },
  { key: "mixed", label: "Mixed / multiple" },
];

const BJJ_LEVELS: FighterOption[] = [
  { key: "White", label: "White" },
  { key: "Blue", label: "Blue" },
  { key: "Purple", label: "Purple" },
  { key: "Brown", label: "Brown" },
  { key: "Black", label: "Black" },
  { key: "No belt / other", label: "No belt / other" },
];

const JUDO_LEVELS: FighterOption[] = [
  { key: "White", label: "White" },
  { key: "Yellow", label: "Yellow" },
  { key: "Orange", label: "Orange" },
  { key: "Green", label: "Green" },
  { key: "Blue", label: "Blue" },
  { key: "Brown", label: "Brown" },
  { key: "Black", label: "Black" },
  { key: "No belt / other", label: "No rank / other" },
];

const EXPERIENCE_LEVELS: FighterOption[] = [
  { key: "Beginner", label: "Beginner" },
  { key: "Intermediate", label: "Intermediate" },
  { key: "Advanced", label: "Advanced" },
  { key: "Amateur Competitor", label: "Amateur competitor" },
  { key: "Professional", label: "Professional" },
];

const WRESTLING_LEVELS: FighterOption[] = [
  { key: "Beginner", label: "Beginner" },
  { key: "Intermediate", label: "Intermediate" },
  { key: "Advanced", label: "Advanced" },
  { key: "Competitive", label: "Competitive" },
];

export function isBjjSport(sport: string | null | undefined): boolean {
  return sport?.trim().toLowerCase() === "bjj";
}

export function levelsForSport(sport: string | null | undefined): FighterOption[] {
  switch (sport?.trim().toLowerCase()) {
    case "bjj":
      return BJJ_LEVELS;
    case "judo":
      return JUDO_LEVELS;
    case "wrestling":
      return WRESTLING_LEVELS;
    default:
      return EXPERIENCE_LEVELS;
  }
}

export function levelLabelForSport(sport: string | null | undefined): string {
  if (isBjjSport(sport)) return "BJJ BELT";
  if (sport?.trim().toLowerCase() === "judo") return "RANK";
  return "EXPERIENCE LEVEL";
}

export function defaultLevelForSport(sport: string | null | undefined): string {
  return levelsForSport(sport)[0].key;
}