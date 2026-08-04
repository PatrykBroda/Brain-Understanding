export const FREQUENCIES = ["1-2x / week", "3-4x / week", "5-6x / week", "Daily / pro"];

// Primary combat sport options (FINAL_UPDATE spec order).
export const SPORTS: { value: string; label: string }[] = [
  { value: "mma", label: "MMA" },
  { value: "bjj", label: "BJJ / Grappling" },
  { value: "boxing", label: "Boxing" },
  { value: "muay_thai", label: "Muay Thai" },
  { value: "kickboxing", label: "Kickboxing" },
  { value: "wrestling", label: "Wrestling" },
  { value: "judo", label: "Judo" },
  { value: "taekwondo", label: "Taekwondo" },
  { value: "other", label: "Other" },
];

// Labels for sport keys that existing profiles may still carry but that are no
// longer offered as choices. Keeps old profiles rendering correctly.
const LEGACY_SPORT_LABELS: Record<string, string> = {
  karate: "Karate",
  sambo: "Sambo",
  mixed: "Mixed / multiple",
};

export function sportLabel(key: string): string {
  return (
    SPORTS.find((s) => s.value === key)?.label ?? LEGACY_SPORT_LABELS[key] ?? key
  );
}

// ---------------------------------------------------------------------------
// Per-sport skill levels (FINAL_UPDATE spec): belt sports get belts, the
// striking/MMA arts get an experience ladder, wrestling gets its own ladder.
// ---------------------------------------------------------------------------

const BELT_LEVELS = ["White", "Blue", "Purple", "Brown", "Black", "No belt / other"];
const JUDO_BELT_LEVELS = ["White", "Yellow", "Orange", "Green", "Blue", "Brown", "Black", "No belt / other"];
const EXPERIENCE_LEVELS = [
  "Beginner",
  "Intermediate",
  "Advanced",
  "Amateur Competitor",
  "Professional",
];
const WRESTLING_LEVELS = ["Beginner", "Intermediate", "Advanced", "Competitive"];

// Back-compat: the historical flat list (BJJ belts) — some legacy profiles
// store these regardless of sport.
export const LEVELS = BELT_LEVELS;

export function levelsForSport(sport: string): string[] {
  switch (sport) {
    case "bjj":
      return BELT_LEVELS;
    case "judo":
      return JUDO_BELT_LEVELS;
    case "wrestling":
      return WRESTLING_LEVELS;
    default:
      return EXPERIENCE_LEVELS;
  }
}

// Optional multi-select "Training background" — other arts the athlete has trained.
// Same sport list as the primary select (labels are what gets stored).
export const TRAINING_BACKGROUND_OPTIONS = SPORTS.map((s) => s.label);

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
