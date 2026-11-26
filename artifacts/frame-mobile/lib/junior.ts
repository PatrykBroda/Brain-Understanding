/**
 * Junior Portal (pilot) client logic. Pure functions only so they are unit-testable without React Native.
 * The server is the authority for every permission: nothing here decides access, it only chooses which
 * screens to show and how to word server answers.
 */

export type JuniorRole = "athlete" | "parent" | "coach";

export interface JuniorMe {
  roles: JuniorRole[];
  activeRole: JuniorRole | null;
  staff: { gymId: string; role: "coach" | "admin"; gymName: string }[];
  children: {
    id: string;
    displayName: string;
    birthYearMonth: string;
    membership: { status: "pending" | "approved" | "rejected"; gymId: string; gymName: string } | null;
  }[];
  parentEntitlement: boolean;
}

export type JuniorEntry = "loading" | "athlete" | "parent" | "coach";

/**
 * Which app should this signed-in user land in?
 *  - flag off / config unreachable  -> athlete (the unchanged app)
 *  - no role rows (every existing athlete) -> athlete
 *  - last active role decides otherwise
 */
export function decideEntry(config: { enabled: boolean } | null | undefined, me: JuniorMe | null | undefined, configFailed = false): JuniorEntry {
  if (configFailed) return "athlete";
  if (!config) return "loading";
  if (!config.enabled) return "athlete";
  if (!me) return "loading";
  if (me.roles.length === 0) return "athlete";
  if (me.activeRole === "parent") return "parent";
  if (me.activeRole === "coach") return "coach";
  return "athlete";
}

export function juniorErrorCopy(code: string | undefined, fallback: string): string {
  switch (code) {
    case "PARENT_PLAN_REQUIRED":
      return "Adding new records needs a FRAME Family plan. Your history is safe and you can still read it.";
    case "MEMBERSHIP_NOT_APPROVED":
      return "The gym has not approved this child yet. You will see classes once they do.";
    case "CLASS_NOT_STARTED":
      return "You can log a class once it has started.";
    case "OUTSIDE_WINDOW":
      return "This class is too long ago to add. Ask your gym if it should be added.";
    case "CLASS_CANCELLED":
      return "This class was cancelled.";
    case "NO_GROUP":
      return "The gym has not placed this child in a class group yet.";
    case "HAS_LOGS":
      return fallback;
    case "LAST_ADMIN":
      return "A gym needs at least one admin.";
    case "INVALID_INVITE":
      return "That invite is invalid, expired, or meant for a different email.";
    case "CONSENT_REQUIRED":
      return "Please tick the parent consent box to continue.";
    case "AGE_ABOVE_MAXIMUM":
      return "Over-18s need their own FRAME account.";
    case "USERNAME_TAKEN":
      return "That username is taken. Try another.";
    case "NOT_GYM_STAFF":
      return "Only this gym's coaches and admins can see this.";
    case "ALREADY_STAFF":
      return "You already work at this gym.";
    case "NOT_PENDING":
      return "This request has already been answered.";
    case "RATE_LIMITED":
      return "Too many tries. Wait a moment and try again.";
    case "AI_NOT_AVAILABLE":
      return "AI coach and chat are not available for junior accounts yet.";
    default:
      return fallback;
  }
}

/** "3 sessions" / "1 session". */
export function sessionsLabel(n: number): string {
  return `${n} ${n === 1 ? "session" : "sessions"}`;
}

/** Whole years and months from "YYYY-MM" (we never store a full birth date for children). */
export function ageLabel(birthYearMonth: string, now: Date = new Date()): string {
  const m = /^(\d{4})-(\d{2})$/.exec(birthYearMonth);
  if (!m) return "";
  let months = (now.getUTCFullYear() - Number(m[1])) * 12 + (now.getUTCMonth() + 1 - Number(m[2]));
  if (months < 0) months = 0;
  const years = Math.floor(months / 12);
  return years >= 1 ? `${years} yr` : `${months} mo`;
}

/** A client-generated id for one logging intent. Re-sent unchanged on retry so the server de-duplicates. */
export function newClientLogId(rand: () => number = Math.random, now: () => number = Date.now): string {
  const r = () => Math.floor(rand() * 0xffffffff).toString(16).padStart(8, "0");
  return `log-${now().toString(36)}-${r()}${r()}`;
}

export function formatClassWhen(iso: string, timeZone = "Asia/Bangkok"): string {
  const d = new Date(iso);
  const day = new Intl.DateTimeFormat("en-GB", { timeZone, weekday: "short", day: "numeric", month: "short" }).format(d);
  const time = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);
  return `${day}, ${time}`;
}

// ── Phase 2: parent timeline, invites, privacy ───────────────────────────────

export type TimelineType = "session" | "observation" | "milestone" | "star" | "gym_change" | "membership";
export interface TimelineItem { type: TimelineType; at: string; title: string; detail?: string | null; refId?: string }

export function timelineLabel(t: TimelineType): string {
  switch (t) {
    case "session": return "Session";
    case "observation": return "Coach note";
    case "milestone": return "Milestone";
    case "star": return "Star of the Week";
    case "gym_change": return "Gym update";
    case "membership": return "Gym";
  }
}

/** Day heading for a timeline row; "Today"/"Yesterday" relative to `now`, in the gym's time zone. */
export function timelineDayLabel(iso: string, now: Date = new Date(), timeZone = "Asia/Bangkok"): string {
  const key = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone }).format(d);
  const day = key(new Date(iso));
  if (day === key(now)) return "Today";
  if (day === key(new Date(now.getTime() - 86_400_000))) return "Yesterday";
  return new Intl.DateTimeFormat("en-GB", { timeZone, weekday: "short", day: "numeric", month: "short" }).format(new Date(iso));
}

export interface EmptyState { code: string; message: string }
/** Server wording wins; this only covers an older server that sends no message. */
export function emptyStateCopy(e: EmptyState | null | undefined): string | null {
  if (!e) return null;
  if (e.message) return e.message;
  switch (e.code) {
    case "NO_GYM": return "Choose a gym for your child to start their journey.";
    case "AWAITING_APPROVAL": return "Waiting for the gym to approve. You will see classes once they do.";
    case "NO_GROUP": return "The gym has not placed this child in a class group yet.";
    case "NO_SESSIONS": return "No sessions yet. They appear here when you add them.";
    case "NO_INVITES": return "No invitations right now.";
    default: return "Nothing to show yet.";
  }
}

export interface InviteRow { kind: "guardian" | "staff"; id: string; title: string; from: string | null; expiresAt: string }
export const inviteActionPath = (i: Pick<InviteRow, "kind" | "id">, decision: "accept" | "decline") => `/junior/my/invites/${i.kind}/${i.id}/${decision}`;

export interface PrivacySettings { coachSeesWellbeing: boolean; teamSeesRecognition: boolean }
export function privacySummary(p: PrivacySettings): string {
  return p.coachSeesWellbeing ? "Coaches can see your wellbeing averages." : "Coaches cannot see wellbeing entries.";
}

/** "Not logged" is never "absent": a class the family did not log says nothing about attendance. */
export function recapLine(r: { sessionsLogged: number; classesHeld: number }): string {
  const nl = Math.max(0, r.classesHeld - r.sessionsLogged);
  return `${r.sessionsLogged} logged of ${r.classesHeld} classes${nl > 0 ? ` (${nl} not logged)` : ""}`;
}
