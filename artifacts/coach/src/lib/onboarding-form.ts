// Pure helpers for the sign-up + onboarding screens (validation, error copy,
// step maths, saved-draft parsing). Kept free of React so they can be unit-tested.

export const NAME_MAX = 60;
export const MIN_PASSWORD_LENGTH = 8;
/** Longest the "Enter FRAME" save may spin before we say so and let them retry. */
export const SAVE_TIMEOUT_MS = 25_000;
/** How long a tapped answer stays highlighted before the next question appears. */
export const ADVANCE_DELAY_MS = 220;

// ── Sign-up form ─────────────────────────────────────────────────────────────

export type SignUpErrors = { email?: string; password?: string; legal?: string };

export function isPlausibleEmail(raw: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(raw.trim());
}

/** What is still missing from the sign-up form, in plain words (the button used to just stay greyed out). */
export function validateSignUp(input: { email: string; password: string; acceptedLegal: boolean }): SignUpErrors {
  const errors: SignUpErrors = {};
  if (!input.email.trim()) errors.email = "Enter your email.";
  else if (!isPlausibleEmail(input.email)) errors.email = "That email doesn't look right. Check it for typos.";
  if (!input.password) errors.password = "Choose a password.";
  else if (input.password.length < MIN_PASSWORD_LENGTH) errors.password = `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  if (!input.acceptedLegal) errors.legal = "Tick the box to accept the Terms and Privacy Policy.";
  return errors;
}

// ── Details step ─────────────────────────────────────────────────────────────

export function nameProblem(raw: string): string | null {
  const name = raw.trim();
  if (!name) return "Enter a name or callsign to continue.";
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

// ── Details form: nothing is pre-selected ────────────────────────────────────

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

// ── Question flow ────────────────────────────────────────────────────────────

/** Next step after an answer, clamped so a stray extra tap can never land past the details step. */
export function nextStep(from: number, detailsStep: number): number {
  return Math.min(Math.max(from + 1, 0), detailsStep);
}

export function prevStep(from: number): number {
  return Math.max(from - 1, 0);
}

// ── Save errors ──────────────────────────────────────────────────────────────

type ErrorLike = { kind?: string; status?: number | null; detail?: string; message?: string };

/** Plain-English reason the save failed. Never a raw JSON body. */
export function describeSaveError(err: unknown): string {
  const e = (err ?? {}) as ErrorLike;
  const detail = `${e.detail ?? ""} ${e.message ?? ""}`;
  if (e.kind === "auth") return "Your session has expired. Sign in again, then pick up where you left off.";
  if (e.kind === "timeout" || e.kind === "network") {
    return "We couldn't reach FRAME. Check your connection, then tap Enter FRAME to try again. Your answers are kept.";
  }
  if (e.kind === "rate_limit") return "Too many attempts. Wait a minute, then tap Enter FRAME again.";
  if (e.kind === "server" || (e.status != null && e.status >= 500)) {
    return "Our server hit a problem saving your profile. Your answers are kept. Tap Enter FRAME to try again.";
  }
  if (e.status === 400) {
    if (/"name"|name is required|characters/i.test(detail) && !/date/i.test(detail)) {
      return `Your name needs to be 1 to ${NAME_MAX} characters.`;
    }
    if (/date of birth|dateOfBirth/i.test(detail)) return "That date of birth wasn't accepted. Check it and try again.";
    return "Something in your details wasn't accepted. Check each field and try again.";
  }
  return "We couldn't save your profile. Tap Enter FRAME to try again.";
}

// ── Saved draft (resume where they left off) ─────────────────────────────────

export type OnboardingDraft = {
  started: boolean;
  step: number;
  answers: Record<string, number>;
  background: string[];
  form: {
    name: string;
    dateOfBirth: string;
    primarySport: string;
    level: string;
    trainingFrequency: string;
    goals: string;
    weaknesses: string;
    bio: string;
    personality: string;
    competes: boolean;
  };
};

// v2: drafts saved before the defaults were removed hold a pre-selected MMA / Beginner / 3-4x that
// the athlete may never have chosen, so they are not restored.
export const draftKeyFor = (userId: string) => `frame:onboarding-draft:v2:${userId}`;

const s = (v: unknown, max = 4000) => (typeof v === "string" ? v.slice(0, max) : "");

/** Parse a saved draft defensively. `questionCount` bounds the answers and the step. */
export function parseDraft(
  raw: string | null | undefined,
  opts: { questionIds: string[]; choicesPerQuestion: number; sports: string[]; frequencies: string[] },
): OnboardingDraft | null {
  if (!raw) return null;
  let o: unknown;
  try {
    o = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof o !== "object" || o === null) return null;
  const d = o as Record<string, unknown>;
  const f = (typeof d.form === "object" && d.form !== null ? d.form : {}) as Record<string, unknown>;

  const answers: Record<string, number> = {};
  if (typeof d.answers === "object" && d.answers !== null) {
    for (const id of opts.questionIds) {
      const v = (d.answers as Record<string, unknown>)[id];
      if (typeof v === "number" && Number.isInteger(v) && v >= 0 && v < opts.choicesPerQuestion) answers[id] = v;
    }
  }
  const detailsStep = opts.questionIds.length;
  const rawStep = typeof d.step === "number" && Number.isInteger(d.step) ? d.step : 0;
  const sport = s(f.primarySport, 40);
  const freq = s(f.trainingFrequency, 40);
  return {
    started: d.started === true,
    step: Math.min(Math.max(rawStep, 0), detailsStep),
    answers,
    background: Array.isArray(d.background) ? d.background.filter((x): x is string => typeof x === "string").slice(0, 12) : [],
    form: {
      name: s(f.name, NAME_MAX),
      dateOfBirth: s(f.dateOfBirth, 12),
      // Never fall back to a default sport / frequency: an unknown value means "not chosen yet".
      primarySport: opts.sports.includes(sport) ? sport : "",
      level: s(f.level, 60),
      trainingFrequency: opts.frequencies.includes(freq) ? freq : "",
      goals: s(f.goals),
      weaknesses: s(f.weaknesses),
      bio: s(f.bio),
      personality: s(f.personality),
      competes: f.competes === true,
    },
  };
}

/** True when the draft holds anything worth restoring. */
export function draftHasProgress(d: OnboardingDraft): boolean {
  return (
    d.started ||
    d.step > 0 ||
    Object.keys(d.answers).length > 0 ||
    d.background.length > 0 ||
    !!d.form.name.trim() ||
    !!d.form.dateOfBirth ||
    !!d.form.goals.trim() ||
    !!d.form.weaknesses.trim() ||
    !!d.form.bio.trim() ||
    !!d.form.personality.trim()
  );
}
