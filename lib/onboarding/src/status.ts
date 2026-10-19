// Whether an athlete has answered the onboarding questions yet.
//
// Sign-up only collects name, email and password; the server creates a stub fighter row
// (name only, every answer blank) and the athlete fills the questions in from the Profile
// tab whenever they like. Both apps use this one rule to decide whether to show the
// "Answer your onboarding questions" prompt on Home and to pre-fill the Profile section.

export type QuestionnaireFighter = {
  dateOfBirth?: string | null;
  primarySport?: string | null;
  level?: string | null;
  trainingFrequency?: string | null;
};

const blank = (v: string | null | undefined) => !v || !v.trim();

/** The required answers still missing, in the order the questions are asked. */
export function missingAnswers(f: QuestionnaireFighter | null | undefined): string[] {
  if (!f) return ["dateOfBirth", "primarySport", "level", "trainingFrequency"];
  const out: string[] = [];
  if (blank(f.dateOfBirth)) out.push("dateOfBirth");
  if (blank(f.primarySport)) out.push("primarySport");
  if (blank(f.level)) out.push("level");
  if (blank(f.trainingFrequency)) out.push("trainingFrequency");
  return out;
}

/** True once date of birth, sport, level and frequency are all answered (goals / weaknesses are optional). */
export function questionnaireAnswered(f: QuestionnaireFighter | null | undefined): boolean {
  return missingAnswers(f).length === 0;
}
