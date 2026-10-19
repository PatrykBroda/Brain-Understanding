import {
  FREQUENCIES as SHARED_FREQUENCIES,
  LEGACY_SPORTS,
  SPORTS as SHARED_SPORTS,
  levelsForSport as sharedLevelsForSport,
  sportLabelFor,
} from "@workspace/onboarding";

// The values (sport keys and labels, level strings, frequencies) live in
// @workspace/onboarding so this app and the mobile app store identical strings.
export const FREQUENCIES: string[] = [...SHARED_FREQUENCIES];

// Primary combat sport options.
export const SPORTS: { value: string; label: string }[] = SHARED_SPORTS.map((s) => ({ value: s.key, label: s.label }));

// Sport keys that existing profiles may still carry but that are no longer
// offered as choices. Keeps old profiles rendering correctly.
export function sportLabel(key: string): string {
  return sportLabelFor(key) ?? LEGACY_SPORTS.find((s) => s.key === key)?.label ?? key;
}

// Per-sport skill levels: belt sports get belts, the striking/MMA arts get an
// experience ladder, wrestling gets its own ladder.
export function levelsForSport(sport: string): string[] {
  return [...sharedLevelsForSport(sport)];
}

// Back-compat: the historical flat list (BJJ belts) — some legacy profiles
// store these regardless of sport.
export const LEVELS = levelsForSport("bjj");

export function isBjjSport(sport: string | null | undefined): boolean {
  return sport?.trim().toLowerCase() === "bjj";
}

export function levelLabelForSport(sport: string | null | undefined): string {
  if (isBjjSport(sport)) return "BJJ belt";
  if (sport?.trim().toLowerCase() === "judo") return "Rank";
  return "Experience level";
}

// Optional multi-select "Training background" — other arts the athlete has trained.
// Same sport list as the primary select (labels are what gets stored).
// The stored labels are unchanged from before ("BJJ / Grappling"), so existing profiles keep matching.
export const TRAINING_BACKGROUND_OPTIONS = SPORTS.map((s) => (s.value === "bjj" ? "BJJ / Grappling" : s.label));

export const STANCES = ["Orthodox", "Southpaw", "Switch", "Open"];

// ---------------------------------------------------------------------------
// Sport-conditional style question — retained for the profile editor only
// (onboarding no longer asks it, per the FINAL_UPDATE spec).
// ---------------------------------------------------------------------------

export type StyleQuestion = {
  label: string;
  options: string[];
  /** Which fighter column the answer belongs in. */
  storeIn: "art" | "stance";
};

const STANCE_QUESTION: StyleQuestion = {
  label: "Preferred stance",
  options: ["Orthodox", "Southpaw", "Switch"],
  storeIn: "stance",
};

const MMA_STYLE_QUESTION: StyleQuestion = {
  label: "Primary style",
  options: [
    "Wrestling-heavy",
    "BJJ-heavy",
    "Muay Thai-heavy",
    "Boxing-heavy",
    "Kickboxing-heavy",
    "Pressure fighter",
    "Counter striker",
    "Balanced",
    "Other",
  ],
  storeIn: "art",
};

export const SPORT_STYLE_QUESTIONS: Record<string, StyleQuestion> = {
  mma: MMA_STYLE_QUESTION,
  mixed: MMA_STYLE_QUESTION,
  boxing: STANCE_QUESTION,
  muay_thai: STANCE_QUESTION,
  kickboxing: STANCE_QUESTION,
  karate: STANCE_QUESTION,
  taekwondo: STANCE_QUESTION,
  wrestling: {
    label: "Preferred style",
    options: ["Freestyle", "Folkstyle", "Greco-Roman"],
    storeIn: "art",
  },
  bjj: {
    label: "Primary focus",
    options: ["Guard player", "Top pressure", "Submission hunter", "Balanced"],
    storeIn: "art",
  },
  // judo / sambo / other: no follow-up — the sport itself is the art.
};

/** Compose the fighters.art value from the sport + (optional) style answer.
 *  e.g. ("mma", "Wrestling-heavy") → "MMA (Wrestling-heavy)"; ("judo") → "Judo". */
export function composeArt(sport: string, styleAnswer?: string): string {
  const base = sportLabel(sport);
  const q = SPORT_STYLE_QUESTIONS[sport];
  if (!q || q.storeIn !== "art" || !styleAnswer || styleAnswer === "Other") return base;
  return `${base} (${styleAnswer})`;
}

// Combat-sport weight classes across the common promotions (kept broad since FRAME
// spans all combat sports). Free selection — nothing is inferred or fabricated.
export const WEIGHT_CLASSES = [
  "Strawweight",
  "Flyweight",
  "Bantamweight",
  "Featherweight",
  "Lightweight",
  "Welterweight",
  "Middleweight",
  "Light Heavyweight",
  "Heavyweight",
];

export function ageFromDob(dob: string | null | undefined): number | null {
  if (!dob) return null;
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age >= 0 && age < 130 ? age : null;
}
