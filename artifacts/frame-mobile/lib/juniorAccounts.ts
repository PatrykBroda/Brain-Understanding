/**
 * Junior accounts, "Join a gym" and gym performance: client types and pure helpers (unit-testable without
 * React Native). The server decides every permission; nothing here grants access.
 */

export type JoinStatus = "pending" | "approved" | "declined" | "cancelled" | "ended";
export interface GymHit { id: string; name: string; city: string | null }
export interface JoinRequest {
  id: string;
  kind: "member" | "junior";
  status: JoinStatus;
  gymId: string;
  gymName: string;
  city: string | null;
  childId: string | null;
  childName: string | null;
  requestedAt: string;
  showOnBoard: boolean | null;
}

export function joinStatusLabel(s: JoinStatus): string {
  switch (s) {
    case "pending": return "Pending";
    case "approved": return "Approved";
    case "declined": return "Declined";
    case "cancelled": return "Cancelled";
    case "ended": return "Left";
  }
}
export function joinStatusTone(s: JoinStatus): "wait" | "ok" | "no" | "idle" {
  return s === "pending" ? "wait" : s === "approved" ? "ok" : s === "declined" ? "no" : "idle";
}
/** One plain sentence under the status pill. */
export function joinStatusLine(r: Pick<JoinRequest, "status" | "gymName" | "childName" | "kind">): string {
  const self = r.kind !== "junior" || !r.childName;
  const who = self ? "You" : (r.childName as string);
  const be = self ? "are" : "is";
  switch (r.status) {
    case "pending": return `Waiting for ${r.gymName} to answer. Nothing about ${self ? "you" : who} is shared with the gym until they approve.`;
    case "approved": return `${who} ${be} a member of ${r.gymName}.`;
    case "declined": return `${r.gymName} did not approve this request. You can ask a different gym.`;
    case "cancelled": return "This request was cancelled.";
    case "ended": return "You left this gym.";
  }
}

export type BoardPeriod = "week" | "month" | "term";
export const PERIOD_OPTIONS: { key: BoardPeriod; label: string }[] = [
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
  { key: "term", label: "Term" },
];

export interface BoardRow { id: string; kind: "junior" | "member"; name: string; sessions: number; trainingMinutes: number; streakWeeks: number; attendanceRate: number | null }
export interface ImprovedRow extends BoardRow { priorMinutes: number; delta: number; deltaPct: number | null }
export interface StarCandidate { childId: string; name: string; sessions: number; trainingMinutes: number; streakWeeks: number; reason: string; alreadyAwarded: boolean }
export interface Leaderboard {
  gym: { id: string; name: string };
  period: BoardPeriod;
  counts: { members: number; shown: number; hidden: number };
  optInRequired: boolean;
  gymAttendanceRate: number | null;
  top: { minutes: BoardRow[]; sessions: BoardRow[]; streak: BoardRow[] };
  mostImproved: ImprovedRow[];
  attendance: BoardRow[];
  starCandidates: StarCandidate[];
}

/** 0.5 -> "50%". */
export const pctLabel = (r: number | null | undefined) => (r == null ? "n/a" : `${Math.round(r * 100)}%`);
export function minutesLabel(m: number): string {
  if (m < 60) return `${m} min`;
  const rest = m % 60;
  return `${Math.floor(m / 60)} h${rest ? ` ${rest} min` : ""}`;
}
export function deltaLabel(d: { delta: number; deltaPct: number | null }): string {
  const sign = d.delta > 0 ? "+" : "";
  return `${sign}${d.delta} min${d.deltaPct == null ? "" : ` (${sign}${d.deltaPct}%)`}`;
}
export function ordinal(n: number): string {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  return `${n}${({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th"}`;
}

export type JuniorStatus = "pending_setup" | "active" | "paused" | "parent_managed";
export interface JuniorAccount {
  childId: string;
  displayName: string;
  status: JuniorStatus;
  hasLogin: boolean;
  username: string | null;
  ageBand: "under_13" | "13_15" | "16_17";
  aiEnabled: boolean;
}
export function juniorStatusLabel(s: JuniorStatus): string {
  switch (s) {
    case "pending_setup": return "Waiting for setup";
    case "active": return "Active";
    case "paused": return "Paused";
    case "parent_managed": return "You manage this account";
  }
}
export const juniorStatusTone = (s: JuniorStatus): "wait" | "ok" | "no" | "idle" =>
  s === "active" ? "ok" : s === "paused" ? "no" : s === "pending_setup" ? "wait" : "idle";

export interface JuniorSummary {
  child: { id: string; displayName: string };
  junior: JuniorAccount;
  period: BoardPeriod;
  summary: { sessions: number; trainingMinutes: number; streakWeeks: number; lastActiveAt: string | null };
  sharedCoachNotes: { id: string; body: string; createdAt: string }[];
  gym: { status: string; gymName: string } | null;
}
export interface JuniorRules { minAge: number; loginMinAge: number; maxAge: number; consentVersion: string; consentStatement: string; aiChatAvailable: boolean }

export function lastActiveLabel(iso: string | null, now: Date = new Date()): string {
  if (!iso) return "Not active yet";
  const days = Math.floor((now.getTime() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  return `${days} days ago`;
}

/** Full birth date "YYYY-MM-DD" check (the server is the authority; this only avoids a pointless round trip). */
export function isBirthDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}
export function ageOnDate(birthDate: string, now: Date = new Date()): number {
  const [y, m, d] = birthDate.split("-").map(Number) as [number, number, number];
  let age = now.getUTCFullYear() - y;
  const mo = now.getUTCMonth() + 1;
  if (mo < m || (mo === m && now.getUTCDate() < d)) age -= 1;
  return age;
}

/** Why the login choice is unavailable, or null when it is allowed. */
export function loginBlockedReason(age: number, loginMinAge: number): string | null {
  return age < loginMinAge ? `Own logins start at ${loginMinAge}. Until then you manage this junior account for them.` : null;
}
