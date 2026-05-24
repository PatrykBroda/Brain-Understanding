export type CalibrationQuestion = {
  key: string;
  prompt: string;
  options: string[];
};

export const CALIBRATION_BANK: CalibrationQuestion[] = [
  {
    key: "break_point",
    prompt: "Where did you break first today?",
    options: ["Breath", "Posture", "Grip", "Focus", "Didn't break"],
  },
  {
    key: "failure_pattern",
    prompt: "What kept failing during sparring?",
    options: [
      "Posture under top pressure",
      "Guard retention",
      "Passing structure",
      "Gas tank",
      "Submission finishes",
      "Didn't spar",
    ],
  },
  {
    key: "hesitation",
    prompt: "Where did hesitation appear?",
    options: [
      "Initiating exchange",
      "Committing to submission",
      "Standing up to disengage",
      "Resetting after a scramble",
      "No hesitation",
    ],
  },
  {
    key: "pressure_response",
    prompt: "What happened under real pressure?",
    options: [
      "Collapsed posture",
      "Held structure but lost initiative",
      "Counter-attacked clean",
      "Disengaged early",
      "Didn't get pressured",
    ],
  },
  {
    key: "aftershock",
    prompt: "How is your nervous system landing after the session?",
    options: [
      "Wired — can't settle",
      "Heavy — flat and tired",
      "Clean — dense calm",
      "Fragmented — looping the round",
      "Haven't trained today",
    ],
  },
  {
    key: "authority",
    prompt: "Whose decision drove your last roll?",
    options: [
      "Mine — I set the terms",
      "Theirs — I reacted to them",
      "Mixed — traded initiative",
      "Coach/instruction-driven",
    ],
  },
  {
    key: "containment",
    prompt: "What leaked out of containment this week?",
    options: [
      "Frustration on the mat",
      "Sleep quality",
      "Eating discipline",
      "Carry-over into work/life",
      "Nothing notable",
    ],
  },
  {
    key: "approach_velocity",
    prompt: "How fast are you entering positions vs the right speed?",
    options: [
      "Too fast — running past the read",
      "Right speed",
      "Too slow — letting them settle",
      "Inconsistent across rounds",
    ],
  },
];

export function pickNextQuestion(
  askedKeysInLast: string[],
): CalibrationQuestion {
  const remaining = CALIBRATION_BANK.filter((q) => !askedKeysInLast.includes(q.key));
  const pool = remaining.length > 0 ? remaining : CALIBRATION_BANK;
  const idx = Math.floor(Math.random() * pool.length);
  return pool[idx]!;
}

export function answerToSignal(question: CalibrationQuestion, answer: string): string | null {
  const noop: Record<string, string[]> = {
    break_point: ["Didn't break"],
    failure_pattern: ["Didn't spar"],
    hesitation: ["No hesitation"],
    pressure_response: ["Didn't get pressured"],
    aftershock: ["Haven't trained today"],
    containment: ["Nothing notable"],
  };
  if (noop[question.key]?.includes(answer)) return null;
  return `${question.prompt} → ${answer}`;
}
