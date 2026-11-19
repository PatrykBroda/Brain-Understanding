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
