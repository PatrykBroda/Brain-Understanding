import {
  db,
  fightersTable,
  dailyCheckinsTable,
  videoAnalysesTable,
  competitionsTable,
  pushTokensTable,
  pushPreferencesTable,
  pushSentTable,
} from "@workspace/db";
import { and, desc, eq, gte, inArray } from "drizzle-orm";
import type { PushStore, PushTarget } from "./pushService";
import type { PushUserContext } from "./pushLogic";
import { ANALYSIS_FRESH_HOURS, DEFAULT_QUIET_END_MIN, DEFAULT_QUIET_START_MIN } from "./pushLogic";
import { isValidTimeZone } from "./localTime";

export const drizzlePushStore: PushStore = {
  async listUsers(now) {
    const tokens = await db.select().from(pushTokensTable);
    const byUser = new Map<string, string[]>();
    for (const t of tokens) byUser.set(t.userId, [...(byUser.get(t.userId) ?? []), t.token]);
    const out: (PushUserContext & PushTarget)[] = [];
    for (const [userId, toks] of byUser) {
      const [prefs] = await db.select().from(pushPreferencesTable).where(eq(pushPreferencesTable.userId, userId));
      const [fighter] = await db.select().from(fightersTable).where(eq(fightersTable.userId, userId));
      let lastCheckinDate: string | null = null;
      let analyses: PushUserContext["analyses"] = [];
      let competitions: PushUserContext["competitions"] = [];
      if (fighter) {
        const [last] = await db
          .select({ d: dailyCheckinsTable.checkinDate })
          .from(dailyCheckinsTable)
          .where(eq(dailyCheckinsTable.fighterId, fighter.id))
          .orderBy(desc(dailyCheckinsTable.checkinDate))
          .limit(1);
        lastCheckinDate = last?.d ?? null;
        analyses = await db
          .select({ id: videoAnalysesTable.id, createdAt: videoAnalysesTable.createdAt })
          .from(videoAnalysesTable)
          .where(
            and(
              eq(videoAnalysesTable.fighterId, fighter.id),
              eq(videoAnalysesTable.subject, "self"),
              gte(videoAnalysesTable.createdAt, new Date(now.getTime() - ANALYSIS_FRESH_HOURS * 3_600_000)),
            ),
          );
        const comps = await db
          .select()
          .from(competitionsTable)
          .where(and(eq(competitionsTable.fighterId, fighter.id), eq(competitionsTable.status, "active")));
        competitions = comps.map((c) => ({ id: c.id, name: c.eventName, eventDate: c.eventDate }));
      }
      out.push({
        userId,
        tokens: toks,
        timeZone: fighter && isValidTimeZone(fighter.timezone) ? fighter.timezone : "UTC",
        enabled: prefs?.enabled ?? true,
        quietStartMin: prefs?.quietStartMin ?? DEFAULT_QUIET_START_MIN,
        quietEndMin: prefs?.quietEndMin ?? DEFAULT_QUIET_END_MIN,
        lastCheckinDate,
        analyses,
        competitions,
      });
    }
    return out;
  },

  async claim(userId, kind, dedupeKey) {
    const rows = await db
      .insert(pushSentTable)
      .values({ userId, kind, dedupeKey })
      .onConflictDoNothing()
      .returning({ id: pushSentTable.id });
    return rows.length > 0;
  },

  async release(userId, dedupeKey) {
    await db.delete(pushSentTable).where(and(eq(pushSentTable.userId, userId), eq(pushSentTable.dedupeKey, dedupeKey)));
  },

  async removeTokens(tokens) {
    if (tokens.length) await db.delete(pushTokensTable).where(inArray(pushTokensTable.token, tokens));
  },
};
