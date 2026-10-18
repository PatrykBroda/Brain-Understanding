// Canonical onboarding answers, shared by the mobile app, the coach web app and
// the API server so the two apps store the SAME strings for the same choice.
//
//   primarySport      -> the key            ("bjj")
//   art               -> the label          ("BJJ")
//   level             -> the level string   ("White", "Beginner"...)
//   trainingFrequency -> the frequency      ("3-4x / week")
//
// Older builds stored other spellings (mobile: art "bjj", frequency "3-4";
// coach: art "BJJ / Grappling"). normalise.ts maps those back to this set.

export type SportOption = { key: string; label: string };

export const SPORTS: readonly SportOption[] = [
  { key: "mma", label: "MMA" },
  { key: "bjj", label: "BJJ" },
  { key: "boxing", label: "Boxing" },
  { key: "muay_thai", label: "Muay Thai" },
  { key: "kickboxing", label: "Kickboxing" },
  { key: "wrestling", label: "Wrestling" },
  { key: "judo", label: "Judo" },
  { key: "taekwondo", label: "Taekwondo" },
  { key: "other", label: "Other" },
];

/** Sports old profiles may carry but that are no longer offered as choices. */
export const LEGACY_SPORTS: readonly SportOption[] = [
  { key: "karate", label: "Karate" },
  { key: "sambo", label: "Sambo" },
  { key: "mixed", label: "Mixed / multiple" },
];

export const FREQUENCIES: readonly string[] = ["1-2x / week", "3-4x / week", "5-6x / week", "Daily / pro"];

const BJJ_LEVELS = ["White", "Blue", "Purple", "Brown", "Black", "No belt / other"] as const;
const JUDO_LEVELS = ["White", "Yellow", "Orange", "Green", "Blue", "Brown", "Black", "No belt / other"] as const;
const EXPERIENCE_LEVELS = ["Beginner", "Intermediate", "Advanced", "Amateur Competitor", "Professional"] as const;
const WRESTLING_LEVELS = ["Beginner", "Intermediate", "Advanced", "Competitive"] as const;

/** Every level string any sport can store (the normaliser's vocabulary). */
export const ALL_LEVELS: readonly string[] = Array.from(
  new Set<string>([...BJJ_LEVELS, ...JUDO_LEVELS, ...EXPERIENCE_LEVELS, ...WRESTLING_LEVELS]),
);

export function levelsForSport(sport: string | null | undefined): readonly string[] {
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

/** The canonical label for a sport key ("bjj" -> "BJJ"), or null when the key is unknown. */
export function sportLabelFor(key: string | null | undefined): string | null {
  const k = key?.trim().toLowerCase();
  return [...SPORTS, ...LEGACY_SPORTS].find((s) => s.key === k)?.label ?? null;
}
