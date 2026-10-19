// The four behavioural questions asked on both apps ("you're gassed, what
// happens to you?"). Each answer carries a short "read" sentence; the reads are
// composed into the `personality` text the archetype / spirit-animal read is
// built from, so both apps feed the server the same input.

export type Choice = { label: string; read: string };
export type Question = { id: string; prompt: string; choices: Choice[] };

const BASE_QUESTIONS: readonly Question[] = [
  {
    id: "tired",
    prompt: "You're gassed and there's still a round left. What happens to you?",
    choices: [
      { label: "I press harder — pace is the weapon", read: "Under fatigue they raise the pace instead of dropping it — pressure-forward." },
      { label: "I shell up and survive the storm", read: "Under fatigue they go defensive and ride it out — survival-minded under load." },
      { label: "I slow down and pick my shots", read: "Under fatigue they get patient and selective — calm and economical." },
      { label: "I start forcing it, emotions creep in", read: "Under fatigue they force things and get emotional — reactive when tired." },
    ],
  },
  {
    id: "imposed",
    prompt: "Someone imposes their pace on you. First instinct?",
    choices: [
      { label: "Meet it head-on, collide", read: "Meets imposed pressure head-on — collision over evasion." },
      { label: "Circle out, reset, re-angle", read: "Slips imposed pressure and re-angles — movement over collision." },
      { label: "Sit still, bait, then counter", read: "Absorbs pressure and counters off the bait — patient counter-fighter." },
      { label: "Match it and outlast them", read: "Matches imposed pace and turns it into attrition — endurance war." },
    ],
  },
  {
    id: "proud",
    prompt: "The roll you're proudest of — you won it by...",
    choices: [
      { label: "Drowning them in relentless pace", read: "Best wins come from relentless pace — a chainer." },
      { label: "Catching the one clean opening", read: "Best wins come from precise timing — a one-shot finisher." },
      { label: "Out-thinking them, two moves ahead", read: "Best wins come from reading the pattern — high fight-IQ." },
      { label: "Refusing to break when they pushed", read: "Best wins come from refusing to break — pure will." },
    ],
  },
  {
    id: "chaos",
    prompt: "When it all goes chaotic, you become...",
    choices: [
      { label: "More aggressive", read: "Chaos makes them more aggressive." },
      { label: "More still and quiet", read: "Chaos makes them go still and quiet." },
      { label: "More analytical", read: "Chaos makes them more analytical." },
      { label: "More stubborn", read: "Chaos makes them dig in and get stubborn." },
    ],
  },
];

/**
 * PLACEHOLDER for the new onboarding multiple-choice question requested by the client. The wording and the
 * four choices have NOT been supplied, so nothing here is real copy and the slot is OFF: it is never shown
 * to users and never reaches Profile, the server validation or the personality text.
 * TODO(client): supply the prompt + four choices (each with a one-line "read"), then set
 * NEW_QUESTION_ENABLED = true. Nothing else needs to change; both apps and the server read QUESTIONS.
 */
export const NEW_QUESTION_ENABLED = false;
export const NEW_QUESTION_PLACEHOLDER: Question = {
  id: "new_question_pending",
  prompt: "TODO: wording pending from the client",
  choices: [
    { label: "TODO: choice 1", read: "" },
    { label: "TODO: choice 2", read: "" },
    { label: "TODO: choice 3", read: "" },
    { label: "TODO: choice 4", read: "" },
  ],
};

export const QUESTIONS: readonly Question[] = NEW_QUESTION_ENABLED
  ? [...BASE_QUESTIONS, NEW_QUESTION_PLACEHOLDER]
  : BASE_QUESTIONS;

export const QUESTION_IDS: readonly string[] = QUESTIONS.map((q) => q.id);
export const CHOICES_PER_QUESTION = 4;

/** Answers: question id -> index of the chosen choice. */
export type Answers = Record<string, number>;

/**
 * Compose the `personality` text from the answers, then any free-text extra.
 * Identical on both apps: reads in question order, unanswered questions
 * skipped, joined with a single space. No boilerplate.
 */
export function composePersonality(answers: Answers, extra?: string | null): string {
  const reads = QUESTIONS.map((q) => {
    const idx = answers[q.id];
    return idx == null ? null : (q.choices[idx]?.read ?? null);
  }).filter(Boolean) as string[];
  return [...reads, extra?.trim()].filter(Boolean).join(" ");
}

/** Keep only well-formed answers (known question, index in range). For restoring drafts. */
export function sanitiseAnswers(raw: unknown): Answers {
  const out: Answers = {};
  if (typeof raw !== "object" || raw === null) return out;
  for (const q of QUESTIONS) {
    const v = (raw as Record<string, unknown>)[q.id];
    if (typeof v === "number" && Number.isInteger(v) && v >= 0 && v < q.choices.length) out[q.id] = v;
  }
  return out;
}
