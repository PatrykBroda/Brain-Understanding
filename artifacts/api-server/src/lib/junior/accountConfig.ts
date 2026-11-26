/**
 * Junior account rules as CONFIG. None of these are legal advice or a decision: every value marked
 * TODO(Harry) is a conservative placeholder until Harry Roberts / legal confirms it.
 * See SPEC_junior_accounts.md for the questions behind each one.
 */

/** Youngest age (years) for which a parent may create a junior account at all. TODO(Harry) */
export const JUNIOR_ACCOUNT_MIN_AGE = 6;
/**
 * Youngest age at which the junior gets their OWN login. Below it the account is parent-managed (no login).
 * TODO(Harry): 13 is the common GDPR-K / COPPA line; confirm per market.
 */
export const JUNIOR_LOGIN_MIN_AGE = 13;
/** A junior account is for under-18s; at 18 the person needs a normal FRAME account. */
export const JUNIOR_MAX_AGE = 17;
/** Version of the parent-consent text recorded with every junior account. TODO(Harry): final wording and version. */
export const JUNIOR_CONSENT_VERSION = "junior-consent-draft-1";
export const JUNIOR_CONSENT_STATEMENT =
  "I am this child's parent or legal guardian. I agree to FRAME creating a junior account for them, linked to my account. I can pause or delete it and download its data at any time.";
/** Domain for the synthetic login address behind a username. ".invalid" can never receive mail or be registered. */
export const JUNIOR_LOGIN_DOMAIN = "junior.frame.invalid";
/** Setup codes (invite flow) last this long. */
export const JUNIOR_INVITE_TTL_MS = 7 * 24 * 3600 * 1000;

/** AI coach / chat for juniors. OFF unless the server flag is on AND the account row enables it. TODO(Harry) decides. */
export function juniorAiEnabledGlobally(): boolean {
  const v = process.env["JUNIOR_AI_CHAT_ENABLED"];
  return v === "1" || v === "true";
}

/** Leaderboards. TODO(Harry): window lengths, star minimum, and whether staff may see juniors who have not opted in. */
export const PERIOD_DAYS = { week: 7, month: 28, term: 84 } as const;
export type BoardPeriod = keyof typeof PERIOD_DAYS;
export const STAR_MIN_SESSIONS = 2;
/** true = only juniors / members who switched "show on gym board" on appear by name on the staff board. */
export const BOARD_REQUIRES_OPT_IN = true;

export type AgeBand = "under_13" | "13_15" | "16_17";

/** Whole years on `now` for a YYYY-MM-DD birth date. */
export function ageOn(birthDate: string, now: Date): number {
  const [y, m, d] = birthDate.split("-").map(Number) as [number, number, number];
  let age = now.getUTCFullYear() - y;
  const md = (now.getUTCMonth() + 1) * 100 + now.getUTCDate();
  if (md < m * 100 + d) age -= 1;
  return age;
}

export function ageBandFor(age: number): AgeBand {
  if (age < 13) return "under_13";
  if (age < 16) return "13_15";
  return "16_17";
}

export const USERNAME_RE = /^[a-z0-9][a-z0-9._]{2,23}$/;
export const loginEmailFor = (username: string) => `${username.toLowerCase()}@${JUNIOR_LOGIN_DOMAIN}`;
