export const LEVELS = ["White", "Blue", "Purple", "Brown", "Black", "No belt / other"];
export const FREQUENCIES = ["1-2x / week", "3-4x / week", "5-6x / week", "Daily / pro"];

export const SPORTS: { value: string; label: string }[] = [
  { value: "bjj", label: "Brazilian Jiu-Jitsu" },
  { value: "mma", label: "MMA" },
  { value: "boxing", label: "Boxing" },
  { value: "muay_thai", label: "Muay Thai" },
  { value: "kickboxing", label: "Kickboxing" },
  { value: "wrestling", label: "Wrestling" },
  { value: "judo", label: "Judo" },
  { value: "karate", label: "Karate" },
  { value: "sambo", label: "Sambo" },
  { value: "mixed", label: "Mixed / multiple" },
];

export function sportLabel(key: string): string {
  return SPORTS.find((s) => s.value === key)?.label ?? key;
}

export const STANCES = ["Orthodox", "Southpaw", "Switch", "Open"];

// ---------------------------------------------------------------------------
// Sport-conditional style question (dynamic onboarding).
// Each sport asks at most ONE follow-up that actually means something in that
// sport, instead of a generic "primary art" list. The answer is stored either
// in fighters.art (style/focus questions, composed via composeArt) or in
// fighters.stance (stance questions for the striking arts).
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
  // judo / sambo: no follow-up — the sport itself is the art.
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
