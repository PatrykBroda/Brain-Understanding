// Pure helpers for the sign-up screen and the Profile "Onboarding questions" section
// (validation, error copy). Kept free of React so they can be unit-tested.

export const NAME_MAX = 60;
export const MIN_PASSWORD_LENGTH = 8;
/** Longest a profile save may spin before we say so and let them retry. */
export const SAVE_TIMEOUT_MS = 25_000;

// ── Sign-up form ─────────────────────────────────────────────────────────────

export type SignUpErrors = { name?: string; email?: string; password?: string; legal?: string };

export function isPlausibleEmail(raw: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(raw.trim());
}

/** What is still missing from the sign-up form, in plain words (the button used to just stay greyed out). */
export function validateSignUp(input: { name: string; email: string; password: string; acceptedLegal: boolean }): SignUpErrors {
  const errors: SignUpErrors = {};
  const name = input.name.trim();
  if (!name) errors.name = "Enter your name.";
  else if (name.length > NAME_MAX) errors.name = `Use ${NAME_MAX} characters or fewer.`;
  if (!input.email.trim()) errors.email = "Enter your email.";
  else if (!isPlausibleEmail(input.email)) errors.email = "That email doesn't look right. Check it for typos.";
  if (!input.password) errors.password = "Choose a password.";
  else if (input.password.length < MIN_PASSWORD_LENGTH) errors.password = `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  if (!input.acceptedLegal) errors.legal = "Tick the box to accept the Terms and Privacy Policy.";
  return errors;
}

// ── Details ─────────────────────────────────────────────────────────────

export function nameProblem(raw: string): string | null {
  const name = raw.trim();
  if (!name) return "Enter a name or callsign.";
  if (name.length > NAME_MAX) return `Keep it to ${NAME_MAX} characters or fewer.`;
  return null;
}

/** Message for an unusable date-of-birth value ("YYYY-MM-DD" from <input type=date>), or null. */
export function dobProblem(value: string | null | undefined, today = new Date()): string | null {
  if (!value) return "Enter your date of birth.";
  const m = /^(\d{4,6})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return "Enter your date of birth as day, month and year.";
  const year = Number(m[1]);
  if (year < 1900) return "Check the year. It looks too far back.";
  const iso = `${String(year).padStart(4, "0")}-${m[2]}-${m[3]}`;
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== iso) return "That date doesn't exist.";
  const todayIso = today.toISOString().slice(0, 10);
  if (iso > todayIso) return "That date is in the future.";
  return null;
}

// ── Nothing is pre-selected ────────────────────────────────────

export type DetailsChoiceProblems = { sport?: string; level?: string; frequency?: string };

const LEVEL_NOUN = (sport: string) => (sport === "bjj" ? "belt" : sport === "judo" ? "rank" : "experience level");

/** What the details form is still missing among the three choices, in plain words (empty object = all chosen). */
export function detailsChoiceProblems(
  form: { primarySport?: string | null; level?: string | null; trainingFrequency?: string | null },
  levelsForSport: (sport: string) => string[],
): DetailsChoiceProblems {
  const out: DetailsChoiceProblems = {};
  const sport = form.primarySport ?? "";
  if (!sport) out.sport = "Choose your primary sport.";
  if (!form.level || (sport && !levelsForSport(sport).includes(form.level))) {
    out.level = sport ? `Choose your ${LEVEL_NOUN(sport)}.` : "Choose your sport first, then your level.";
  }
  if (!form.trainingFrequency) out.frequency = "Choose how often you train.";
  return out;
}

// ── Save errors ──────────────────────────────────────────────────────────────

type ErrorLike = { kind?: string; status?: number | null; detail?: string; message?: string };

/** Plain-English reason the save failed. Never a raw JSON body. */
export function describeSaveError(err: unknown): string {
  const e = (err ?? {}) as ErrorLike;
  const detail = `${e.detail ?? ""} ${e.message ?? ""}`;
  if (e.kind === "auth") return "Your session has expired. Sign in again, then save again.";
  if (e.kind === "timeout" || e.kind === "network") {
    return "We couldn't reach FRAME. Check your connection, then tap Save to try again. Your answers are kept.";
  }
  if (e.kind === "rate_limit") return "Too many attempts. Wait a minute, then tap Save again.";
  if (e.kind === "server" || (e.status != null && e.status >= 500)) {
    return "Our server hit a problem saving your profile. Your answers are kept. Tap Save to try again.";
  }
  if (e.status === 400) {
    if (/"name"|name is required|characters/i.test(detail) && !/date/i.test(detail)) {
      return `Your name needs to be 1 to ${NAME_MAX} characters.`;
    }
    if (/date of birth|dateOfBirth/i.test(detail)) return "That date of birth wasn't accepted. Check it and try again.";
    return "Something in your details wasn't accepted. Check each field and try again.";
  }
  return "We couldn't save your profile. Tap Save to try again.";
}
