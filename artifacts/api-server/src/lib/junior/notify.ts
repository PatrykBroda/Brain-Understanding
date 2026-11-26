import { and, eq, inArray, isNull } from "drizzle-orm";
import {
  db,
  childGymMembershipsTable,
  groupMembershipsTable,
  guardianLinksTable,
  juniorNotificationPrefsTable,
  notificationsTable,
  pushPreferencesTable,
  pushTokensTable,
  pushSentTable,
  childrenTable,
} from "@workspace/db";
import { ExpoPushSender, type PushSender } from "../pushService";
import { inQuietHours, DEFAULT_QUIET_END_MIN, DEFAULT_QUIET_START_MIN } from "../pushLogic";
import type { PushMessage } from "../pushLogic";
import { juniorEnabled } from "./entitlement";
import { logger } from "../logger";

/**
 * Junior notification hooks. They reuse the athlete push plumbing: the in-app inbox
 * (notifications), device tokens (push_tokens), preferences (push_preferences: enabled + quiet hours)
 * and the idempotency ledger (push_sent). Nothing here is reachable unless JUNIOR_PORTAL_ENABLED is on.
 *
 *  - The inbox row is always written (unless the user switched that topic off).
 *  - Remote device delivery follows the SAME gate as athlete push: PUSH_JOB_ENABLED=true.
 *  - Lock-screen text is deliberately generic: never a child's name, never a note's content.
 */

export type JuniorTopic = "timetable" | "observations" | "recognition" | "announcements";

export interface JuniorNotice {
  topic: JuniorTopic;
  /** Unique per event; the same event can never notify the same user twice. */
  dedupeKey: string;
  title: string;
  body: string;
  route: string;
}

const COPY: Record<JuniorTopic, { title: string; body: string; route: string }> = {
  timetable: { title: "Timetable updated", body: "Timetable updated at your gym.", route: "/(parent)/home" },
  observations: { title: "New note from the gym", body: "The gym added a note to your child's journey.", route: "/(parent)/journey" },
  recognition: { title: "Recognition", body: "There is something new in your child's journey.", route: "/(parent)/journey" },
  announcements: { title: "News from your gym", body: "Your gym posted an update.", route: "/(parent)/home" },
};

export function noticeFor(topic: JuniorTopic, dedupeKey: string): JuniorNotice {
  return { topic, dedupeKey: `junior:${dedupeKey}`, ...COPY[topic] };
}

let sender: PushSender = new ExpoPushSender();
/** Tests swap the network sender for a fake. */
export function setJuniorPushSender(s: PushSender): void {
  sender = s;
}

function remoteEnabled(): boolean {
  return process.env["PUSH_JOB_ENABLED"] === "true";
}

/** Notify specific users. Never throws: a notification must never break the write that caused it. */
export async function notifyUsers(userIds: string[], notice: JuniorNotice, now: Date = new Date()): Promise<{ inbox: number; pushed: number }> {
  const out = { inbox: 0, pushed: 0 };
  if (!juniorEnabled() || userIds.length === 0) return out;
  try {
    const ids = [...new Set(userIds)];
    const prefs = await db.select().from(juniorNotificationPrefsTable).where(inArray(juniorNotificationPrefsTable.userId, ids));
    const off = new Set(prefs.filter((p) => p[notice.topic] === false).map((p) => p.userId));
    const pushPrefs = await db.select().from(pushPreferencesTable).where(inArray(pushPreferencesTable.userId, ids));
    const pp = new Map(pushPrefs.map((p) => [p.userId, p]));
    const tokens = await db.select().from(pushTokensTable).where(inArray(pushTokensTable.userId, ids));
    for (const uid of ids) {
      if (off.has(uid)) continue;
      const rows = await db
        .insert(notificationsTable)
        .values({ userId: uid, kind: `junior_${notice.topic}`, dedupeKey: notice.dedupeKey, title: notice.title, body: notice.body, data: { route: notice.route } })
        .onConflictDoNothing()
        .returning({ id: notificationsTable.id });
      if (!rows.length) continue; // already notified for this event
      out.inbox++;
      if (!remoteEnabled()) continue;
      const p = pp.get(uid);
      if (p && !p.enabled) continue;
      if (inQuietHours(now, "Asia/Bangkok", p?.quietStartMin ?? DEFAULT_QUIET_START_MIN, p?.quietEndMin ?? DEFAULT_QUIET_END_MIN)) continue;
      const toks = tokens.filter((t) => t.userId === uid).map((t) => t.token);
      if (!toks.length) continue;
      const claimed = await db.insert(pushSentTable).values({ userId: uid, kind: `junior_${notice.topic}`, dedupeKey: notice.dedupeKey }).onConflictDoNothing().returning({ id: pushSentTable.id });
      if (!claimed.length) continue;
      try {
        const msg = { kind: `junior_${notice.topic}`, dedupeKey: notice.dedupeKey, title: notice.title, body: notice.body, data: { route: notice.route } } as unknown as PushMessage;
        const r = await sender.send(toks, msg);
        if (r.invalidTokens.length) await db.delete(pushTokensTable).where(inArray(pushTokensTable.token, r.invalidTokens));
        if (r.delivered) out.pushed++;
      } catch {
        await db.delete(pushSentTable).where(and(eq(pushSentTable.userId, uid), eq(pushSentTable.dedupeKey, notice.dedupeKey))).catch(() => {});
      }
    }
  } catch (err) {
    logger.warn({ err }, "junior notify failed");
  }
  return out;
}

/** Active guardians of the given children (approved-membership gating is the caller's job). */
export async function guardianIdsOf(childIds: string[]): Promise<string[]> {
  if (!childIds.length) return [];
  const rows = await db
    .select({ userId: guardianLinksTable.userId })
    .from(guardianLinksTable)
    .innerJoin(childrenTable, eq(childrenTable.id, guardianLinksTable.childId))
    .where(and(inArray(guardianLinksTable.childId, childIds), eq(guardianLinksTable.status, "active"), eq(childrenTable.status, "active")));
  return rows.map((r) => r.userId);
}

/** Guardians of every child currently in a group (approved members only). */
export async function guardianIdsOfGroup(groupId: string): Promise<string[]> {
  const kids = await db
    .select({ childId: groupMembershipsTable.childId })
    .from(groupMembershipsTable)
    .innerJoin(childGymMembershipsTable, and(eq(childGymMembershipsTable.childId, groupMembershipsTable.childId), eq(childGymMembershipsTable.status, "approved")))
    .where(and(eq(groupMembershipsTable.groupId, groupId), isNull(groupMembershipsTable.effectiveTo)));
  return guardianIdsOf(kids.map((k) => k.childId));
}

/** Guardians of every approved child of a gym (gym-wide announcements). */
export async function guardianIdsOfGym(gymId: string): Promise<string[]> {
  const kids = await db
    .select({ childId: childGymMembershipsTable.childId })
    .from(childGymMembershipsTable)
    .where(and(eq(childGymMembershipsTable.gymId, gymId), eq(childGymMembershipsTable.status, "approved")));
  return guardianIdsOf(kids.map((k) => k.childId));
}
