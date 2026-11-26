import { Router, type IRouter } from "express";
import { z } from "zod/v4";
import { and, eq, inArray, isNull } from "drizzle-orm";
import {
  db,
  childGymMembershipsTable,
  childPrivacySettingsTable,
  childrenTable,
  groupMembershipsTable,
  gymMembershipsTable,
  gymsTable,
  starAwardsTable,
  usersTable,
} from "@workspace/db";
import { h, JuniorError, nowOf, parse, userId, uuidParam } from "../../lib/junior/http";
import { assertGuardianWithGym, getActiveStaff } from "../../lib/junior/authz";
import { BOARD_REQUIRES_OPT_IN, STAR_MIN_SESSIONS, type BoardPeriod } from "../../lib/junior/accountConfig";
import {
  boardName,
  improvement,
  juniorEvents,
  memberEvents,
  mostImproved,
  periodWindow,
  rankByMinutes,
  scheduledPerGroup,
  summarize,
  type Metrics,
} from "../../lib/junior/stats";
import { localDate } from "../../lib/localTime";
import { weekStartOf } from "../../lib/junior/timetable";

/**
 * Gym performance pages. Data is ONLY from approved members of the gym:
 *  - staff (coach/admin of THAT gym) get the boards; everyone else gets 403 and no data;
 *  - juniors appear by first name + initial, and only when the parent switched "show on gym board" on
 *    (BOARD_REQUIRES_OPT_IN); adult members likewise;
 *  - a parent can only ask for THEIR OWN child's rank: a number out of N, never other people's data.
 */
const router: IRouter = Router();

const periodQuery = z.object({ period: z.enum(["week", "month", "term"]).optional() });

interface Entry {
  key: string;
  id: string;
  kind: "junior" | "member";
  name: string;
  groupId: string | null;
  onBoard: boolean;
  m: Metrics;
  week: Metrics;
  attendanceRate: number | null;
}

async function loadMembers(gymId: string, period: BoardPeriod, now: Date): Promise<Entry[]> {
  const w = periodWindow(period, now);
  const ww = periodWindow("week", now);
  const kids = await db
    .select({
      id: childrenTable.id,
      name: childrenTable.displayName,
      show: childPrivacySettingsTable.showOnGymBoard,
    })
    .from(childGymMembershipsTable)
    .innerJoin(childrenTable, eq(childrenTable.id, childGymMembershipsTable.childId))
    .leftJoin(childPrivacySettingsTable, eq(childPrivacySettingsTable.childId, childrenTable.id))
    .where(and(eq(childGymMembershipsTable.gymId, gymId), eq(childGymMembershipsTable.status, "approved"), eq(childrenTable.status, "active")));
  const kidIds = kids.map((k) => k.id);
  const groups = kidIds.length
    ? await db
        .select({ childId: groupMembershipsTable.childId, groupId: groupMembershipsTable.groupId })
        .from(groupMembershipsTable)
        .where(and(inArray(groupMembershipsTable.childId, kidIds), isNull(groupMembershipsTable.effectiveTo)))
    : [];
  const adults = await db
    .select({ id: gymMembershipsTable.id, userId: gymMembershipsTable.userId, name: usersTable.displayName, show: gymMembershipsTable.showOnBoard })
    .from(gymMembershipsTable)
    .innerJoin(usersTable, eq(usersTable.id, gymMembershipsTable.userId))
    .where(and(eq(gymMembershipsTable.gymId, gymId), eq(gymMembershipsTable.status, "approved")));

  const kidEvents = await juniorEvents(gymId, kidIds, now);
  const adultEvents = await memberEvents(adults.map((a) => a.userId), now);
  const sched = await scheduledPerGroup(gymId, w.start, w.end);

  const out: Entry[] = [];
  for (const k of kids) {
    const ev = kidEvents.get(k.id) ?? [];
    const groupId = groups.find((g) => g.childId === k.id)?.groupId ?? null;
    const m = summarize(ev, w, now);
    const possible = groupId ? (sched.get(groupId) ?? 0) : 0;
    out.push({
      key: `j:${k.id}`,
      id: k.id,
      kind: "junior",
      name: boardName(k.name),
      groupId,
      onBoard: !BOARD_REQUIRES_OPT_IN || !!k.show,
      m,
      week: summarize(ev, ww, now),
      attendanceRate: possible > 0 ? Math.min(1, Math.round((m.sessions / possible) * 100) / 100) : null,
    });
  }
  for (const a of adults) {
    const ev = adultEvents.get(a.userId) ?? [];
    out.push({
      key: `m:${a.id}`,
      id: a.id,
      kind: "member",
      name: boardName(a.name || "Member"),
      groupId: null,
      onBoard: !BOARD_REQUIRES_OPT_IN || a.show,
      m: summarize(ev, w, now),
      week: summarize(ev, ww, now),
      attendanceRate: null,
    });
  }
  return out;
}

const toRow = (e: Entry) => ({
  id: e.id,
  kind: e.kind,
  name: e.name,
  sessions: e.m.sessions,
  trainingMinutes: e.m.minutes,
  streakWeeks: e.m.streak,
  attendanceRate: e.attendanceRate,
});

const rankInput = (e: Entry) => ({ key: e.key, minutes: e.m.minutes, sessions: e.m.sessions, priorMinutes: e.m.priorMinutes });

/** Staff of THIS gym only. Not staff = 403 with no body of data (gym existence is public anyway). */
async function requireStaffOr403(uid: string, gymId: string) {
  const staff = await getActiveStaff(uid, gymId);
  if (!staff) throw new JuniorError(403, "NOT_GYM_STAFF", "Only this gym's coaches and admins can see its performance board");
  return staff;
}

router.get(
  "/gyms/:gymId/leaderboard",
  h(async (req, res) => {
    const gymId = uuidParam(req, "gymId");
    await requireStaffOr403(userId(req), gymId);
    const now = nowOf(req);
    const { period = "week" } = parse(periodQuery, req.query);
    const p = period as BoardPeriod;
    const [gym] = await db.select({ id: gymsTable.id, name: gymsTable.name, timezone: gymsTable.timezone }).from(gymsTable).where(eq(gymsTable.id, gymId));
    const all = await loadMembers(gymId, p, now);
    const shown = all.filter((e) => e.onBoard);
    const top = (sel: (e: Entry) => number, minValue = 1) =>
      shown
        .filter((e) => sel(e) >= minValue)
        .sort((a, b) => sel(b) - sel(a) || b.m.sessions - a.m.sessions || a.name.localeCompare(b.name))
        .slice(0, 5)
        .map(toRow);

    const improved = mostImproved(shown.map((e) => ({ ...rankInput(e), name: e.name, e })), 5).map((r) => ({
      ...toRow(r.e),
      priorMinutes: r.priorMinutes,
      delta: r.delta,
      deltaPct: r.pct,
    }));

    const rated = all.filter((e) => e.attendanceRate !== null);
    const gymAttendanceRate = rated.length ? Math.round((rated.reduce((s, e) => s + (e.attendanceRate ?? 0), 0) / rated.length) * 100) / 100 : null;

    // Star of the Week: this week's strongest shown juniors. Candidates only; the coach still awards it.
    const weekStart = weekStartOf(localDate(now, gym?.timezone ?? "UTC"));
    const juniors = shown.filter((e) => e.kind === "junior");
    const awarded = juniors.length
      ? await db
          .select({ childId: starAwardsTable.childId })
          .from(starAwardsTable)
          .where(and(eq(starAwardsTable.gymId, gymId), eq(starAwardsTable.weekStart, weekStart), eq(starAwardsTable.status, "active")))
      : [];
    const starCandidates = juniors
      .filter((e) => e.week.sessions >= STAR_MIN_SESSIONS)
      .sort((a, b) => b.week.sessions - a.week.sessions || b.week.minutes - a.week.minutes || b.m.streak - a.m.streak || a.name.localeCompare(b.name))
      .slice(0, 3)
      .map((e) => ({
        childId: e.id,
        name: e.name,
        sessions: e.week.sessions,
        trainingMinutes: e.week.minutes,
        streakWeeks: e.m.streak,
        reason: `${e.week.sessions} sessions, ${e.week.minutes} min this week${e.m.streak > 1 ? `, ${e.m.streak}-week streak` : ""}`,
        alreadyAwarded: awarded.some((a) => a.childId === e.id),
      }));

    res.json({
      gym: { id: gym?.id, name: gym?.name },
      period: p,
      window: { start: periodWindow(p, now).start, end: now },
      weekStart,
      counts: { members: all.length, shown: shown.length, hidden: all.length - shown.length },
      optInRequired: BOARD_REQUIRES_OPT_IN,
      gymAttendanceRate,
      top: { minutes: top((e) => e.m.minutes), sessions: top((e) => e.m.sessions), streak: top((e) => e.m.streak) },
      mostImproved: improved,
      attendance: shown
        .filter((e) => e.attendanceRate !== null)
        .sort((a, b) => (b.attendanceRate ?? 0) - (a.attendanceRate ?? 0) || a.name.localeCompare(b.name))
        .slice(0, 10)
        .map(toRow),
      starCandidates,
    });
  }),
);

/** A parent's view: ONLY their own child's place (number out of N) and own numbers. */
router.get(
  "/children/:childId/gym-rank",
  h(async (req, res) => {
    const childId = uuidParam(req, "childId");
    const { membership } = await assertGuardianWithGym(userId(req), childId);
    const now = nowOf(req);
    const { period = "week" } = parse(periodQuery, req.query);
    const all = await loadMembers(membership.gymId, period as BoardPeriod, now);
    const me = all.find((e) => e.kind === "junior" && e.id === childId);
    if (!me) throw new JuniorError(404, "NOT_FOUND", "Not found");
    const ranks = rankByMinutes(all.map(rankInput));
    const [gym] = await db.select({ name: gymsTable.name }).from(gymsTable).where(eq(gymsTable.id, membership.gymId));
    res.json({
      gym: gym?.name ?? null,
      period,
      rank: ranks.get(me.key) ?? null,
      outOf: all.length,
      trainingMinutes: me.m.minutes,
      sessions: me.m.sessions,
      streakWeeks: me.m.streak,
      improvement: improvement(me.m),
      shownOnGymBoard: me.onBoard,
    });
  }),
);

export { loadMembers };
export default router;
