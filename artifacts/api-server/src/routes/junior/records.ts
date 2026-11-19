import { Router, type IRouter } from "express";
import { z } from "zod/v4";
import { and, asc, desc, eq, gte, inArray, isNull, lt, sql } from "drizzle-orm";
import {
  db,
  announcementsTable,
  attendanceLogsTable,
  changeHistoryTable,
  childGymMembershipsTable,
  childrenTable,
  classGroupsTable,
  classOccurrencesTable,
  classSchedulesTable,
  focusCategoriesTable,
  groupMembershipsTable,
  gymStaffTable,
  gymsTable,
  individualFocusesTable,
  milestoneRulesTable,
  milestoneStatesTable,
  observationsTable,
  staffInvitesTable,
  starAwardsTable,
  usersTable,
  weeklyFocusVersionsTable,
  wellbeingEntriesTable,
} from "@workspace/db";
import { h, JuniorError, nowOf, parse, userId, uuidParam } from "../../lib/junior/http";
import { recordHistory, type DbLike } from "../../lib/junior/history";
import { requireGymStaff } from "../../lib/junior/authz";
import { coachCanSee, toCoachItem, type HistoryRow } from "../../lib/junior/historyView";
import { generateForSchedule, HORIZON_DAYS, weekStartOf } from "../../lib/junior/timetable";
import { activeSessionCount } from "../../lib/junior/milestones";
import { guardianIdsOf, guardianIdsOfGroup, noticeFor, notifyUsers } from "../../lib/junior/notify";
import { addDays, localDate, startOfLocalDay } from "../../lib/localTime";
import { staffChildGym } from "./loop";
import { privacyFor } from "./parent";

const router: IRouter = Router();
const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM");
const actorOf = (role: string) => (role === "admin" ? ("admin" as const) : ("coach" as const));

async function gymOf(gymId: string, conn: DbLike = db) {
  const [g] = await conn.select().from(gymsTable).where(eq(gymsTable.id, gymId));
  if (!g) throw new JuniorError(404, "NOT_FOUND", "Not found");
  return g;
}

// == Individual focus (per child; one active at a time) ===============================================
const indivBody = z.object({ title: z.string().trim().min(1).max(120), details: z.string().trim().max(1000).default(""), categoryId: z.string().uuid().optional() });

router.post(
  "/gyms/:gymId/children/:childId/individual-focus",
  h(async (req, res) => {
    const gymId = uuidParam(req, "gymId");
    const childId = uuidParam(req, "childId");
    const uid = userId(req);
    const staff = await staffChildGym(uid, gymId, childId);
    const b = parse(indivBody, req.body);
    if (b.categoryId) {
      const [c] = await db.select({ id: focusCategoriesTable.id }).from(focusCategoriesTable).where(and(eq(focusCategoriesTable.id, b.categoryId), eq(focusCategoriesTable.gymId, gymId)));
      if (!c) throw new JuniorError(422, "BAD_CATEGORY", "Category does not belong to this gym");
    }
    const row = await db.transaction(async (tx) => {
      const ended = await tx
        .update(individualFocusesTable)
        .set({ status: "ended", endedAt: nowOf(req) })
        .where(and(eq(individualFocusesTable.childId, childId), eq(individualFocusesTable.status, "active")))
        .returning({ id: individualFocusesTable.id });
      for (const e of ended) await recordHistory(tx, { gymId, childId, actorUserId: uid, actorRole: actorOf(staff.role), entity: "individual_focus", entityId: e.id, action: "ended", reason: "replaced" });
      const [r] = await tx.insert(individualFocusesTable).values({ childId, gymId, title: b.title, details: b.details, categoryId: b.categoryId ?? null, createdBy: uid }).returning();
      await recordHistory(tx, { gymId, childId, actorUserId: uid, actorRole: actorOf(staff.role), entity: "individual_focus", entityId: r!.id, action: "set", after: { title: b.title } });
      return r!;
    });
    res.status(201).json({ focus: row });
  }),
);

router.post(
  "/gyms/:gymId/children/:childId/individual-focus/:focusId/end",
  h(async (req, res) => {
    const gymId = uuidParam(req, "gymId");
    const childId = uuidParam(req, "childId");
    const fid = uuidParam(req, "focusId");
    const uid = userId(req);
    const staff = await staffChildGym(uid, gymId, childId);
    await db.transaction(async (tx) => {
      const rows = await tx
        .update(individualFocusesTable)
        .set({ status: "ended", endedAt: nowOf(req) })
        .where(and(eq(individualFocusesTable.id, fid), eq(individualFocusesTable.childId, childId), eq(individualFocusesTable.gymId, gymId), eq(individualFocusesTable.status, "active")))
        .returning({ id: individualFocusesTable.id });
      if (!rows.length) throw new JuniorError(404, "NOT_FOUND", "Not found");
      await recordHistory(tx, { gymId, childId, actorUserId: uid, actorRole: actorOf(staff.role), entity: "individual_focus", entityId: fid, action: "ended" });
    });
    res.json({ ok: true });
  }),
);

router.get(
  "/gyms/:gymId/children/:childId/individual-focus",
  h(async (req, res) => {
    const gymId = uuidParam(req, "gymId");
    const childId = uuidParam(req, "childId");
    await staffChildGym(userId(req), gymId, childId);
    const rows = await db.select().from(individualFocusesTable).where(and(eq(individualFocusesTable.childId, childId), eq(individualFocusesTable.gymId, gymId))).orderBy(desc(individualFocusesTable.createdAt)).limit(20);
    res.json({ focuses: rows });
  }),
);

// == Star of the Week (flexible: any number per group per week; one per child per week) ==============
router.post(
  "/gyms/:gymId/children/:childId/stars",
  h(async (req, res) => {
    const gymId = uuidParam(req, "gymId");
    const childId = uuidParam(req, "childId");
    const uid = userId(req);
    const now = nowOf(req);
    const staff = await staffChildGym(uid, gymId, childId);
    const b = parse(z.object({ weekStart: ymd.optional(), note: z.string().trim().max(300).default("") }), req.body);
    const gym = await gymOf(gymId);
    const week = weekStartOf(b.weekStart ?? localDate(now, gym.timezone));
    const [gm] = await db.select({ groupId: groupMembershipsTable.groupId }).from(groupMembershipsTable).where(and(eq(groupMembershipsTable.childId, childId), isNull(groupMembershipsTable.effectiveTo)));
    const row = await db.transaction(async (tx) => {
      const [r] = await tx.insert(starAwardsTable).values({ gymId, groupId: gm?.groupId ?? null, childId, weekStart: week, note: b.note, awardedBy: uid }).onConflictDoNothing().returning();
      if (!r) throw new JuniorError(409, "ALREADY_AWARDED", "This child already has a star for that week");
      await recordHistory(tx, { gymId, childId, actorUserId: uid, actorRole: actorOf(staff.role), entity: "star_award", entityId: r.id, action: "created", after: { weekStart: week } });
      return r;
    });
    await guardianIdsOf([childId]).then((ids) => notifyUsers(ids, noticeFor("recognition", `star:${row.id}`), now));
    res.status(201).json({ star: row });
  }),
);

router.post(
  "/gyms/:gymId/stars/:starId/withdraw",
  h(async (req, res) => {
    const gymId = uuidParam(req, "gymId");
    const sid = uuidParam(req, "starId");
    const uid = userId(req);
    const staff = await requireGymStaff(uid, gymId, "coach");
    const reason = parse(z.object({ reason: z.string().trim().max(200).optional() }), req.body ?? {}).reason ?? null;
    await db.transaction(async (tx) => {
      const rows = await tx
        .update(starAwardsTable)
        .set({ status: "withdrawn", withdrawnAt: nowOf(req) })
        .where(and(eq(starAwardsTable.id, sid), eq(starAwardsTable.gymId, gymId), eq(starAwardsTable.status, "active")))
        .returning({ id: starAwardsTable.id, childId: starAwardsTable.childId });
      if (!rows.length) throw new JuniorError(404, "NOT_FOUND", "Not found");
      await recordHistory(tx, { gymId, childId: rows[0]!.childId, actorUserId: uid, actorRole: actorOf(staff.role), entity: "star_award", entityId: sid, action: "withdrawn", reason });
    });
    res.json({ ok: true });
  }),
);

router.get(
  "/gyms/:gymId/stars",
  h(async (req, res) => {
    const gymId = uuidParam(req, "gymId");
    await requireGymStaff(userId(req), gymId, "coach");
    const q = parse(z.object({ week: ymd.optional(), groupId: z.string().uuid().optional() }), req.query);
    const conds = [eq(starAwardsTable.gymId, gymId), eq(starAwardsTable.status, "active")];
    if (q.week) conds.push(eq(starAwardsTable.weekStart, weekStartOf(q.week)));
    if (q.groupId) conds.push(eq(starAwardsTable.groupId, q.groupId));
    const rows = await db
      .select({ id: starAwardsTable.id, childId: starAwardsTable.childId, childName: childrenTable.displayName, groupId: starAwardsTable.groupId, weekStart: starAwardsTable.weekStart, note: starAwardsTable.note })
      .from(starAwardsTable)
      .innerJoin(childrenTable, eq(childrenTable.id, starAwardsTable.childId))
      .where(and(...conds))
      .orderBy(desc(starAwardsTable.weekStart))
      .limit(100);
    res.json({ stars: rows });
  }),
);

// == Wellbeing summary a coach may see ONLY when the family switched it on ==================================
export async function coachWellbeingSummary(childId: string, from: string, to: string) {
  const p = await privacyFor(childId);
  if (!p.coachSeesWellbeing) return { shared: false as const };
  const [r] = await db
    .select({ n: sql<number>`count(*)::int`, mood: sql<number | null>`avg(${wellbeingEntriesTable.mood})::float`, energy: sql<number | null>`avg(${wellbeingEntriesTable.energy})::float`, sleep: sql<number | null>`avg(${wellbeingEntriesTable.sleep})::float` })
    .from(wellbeingEntriesTable)
    .where(and(eq(wellbeingEntriesTable.childId, childId), gte(wellbeingEntriesTable.localDate, from), lt(wellbeingEntriesTable.localDate, to)));
  // Notes are never shared: only averages, labelled as parent-reported.
  return { shared: true as const, source: "parent-reported", entries: r?.n ?? 0, avgMood: r?.mood ?? null, avgEnergy: r?.energy ?? null, avgSleep: r?.sleep ?? null };
}

router.get(
  "/gyms/:gymId/children/:childId/wellbeing",
  h(async (req, res) => {
    const gymId = uuidParam(req, "gymId");
    const childId = uuidParam(req, "childId");
    await staffChildGym(userId(req), gymId, childId);
    const gym = await gymOf(gymId);
    const today = localDate(nowOf(req), gym.timezone);
    res.json(await coachWellbeingSummary(childId, addDays(today, -30), addDays(today, 1)));
  }),
);

// == Monthly recap (coach only; "not logged" is never "absent") ============================================
router.get(
  "/gyms/:gymId/children/:childId/recap",
  h(async (req, res) => {
    const gymId = uuidParam(req, "gymId");
    const childId = uuidParam(req, "childId");
    await staffChildGym(userId(req), gymId, childId);
    const { month } = parse(z.object({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Use YYYY-MM") }), req.query);
    const gym = await gymOf(gymId);
    const first = `${month}-01`;
    const [yy, mm] = month.split("-").map(Number) as [number, number];
    const nextFirst = mm === 12 ? `${yy + 1}-01-01` : `${yy}-${String(mm + 1).padStart(2, "0")}-01`;
    const start = startOfLocalDay(first, gym.timezone);
    const end = startOfLocalDay(nextFirst, gym.timezone);

    const logs = await db
      .select({ id: attendanceLogsTable.id, focusVersionId: attendanceLogsTable.focusVersionId })
      .from(attendanceLogsTable)
      .innerJoin(classOccurrencesTable, eq(classOccurrencesTable.id, attendanceLogsTable.occurrenceId))
      .where(and(eq(attendanceLogsTable.childId, childId), eq(attendanceLogsTable.status, "active"), eq(classOccurrencesTable.gymId, gymId), gte(classOccurrencesTable.startsAt, start), lt(classOccurrencesTable.startsAt, end)));
    const [gm] = await db.select({ groupId: groupMembershipsTable.groupId }).from(groupMembershipsTable).where(and(eq(groupMembershipsTable.childId, childId), isNull(groupMembershipsTable.effectiveTo)));
    const heldRows = gm
      ? await db
          .select({ n: sql<number>`count(*)::int` })
          .from(classOccurrencesTable)
          .where(and(eq(classOccurrencesTable.groupId, gm.groupId), eq(classOccurrencesTable.status, "scheduled"), gte(classOccurrencesTable.startsAt, start), lt(classOccurrencesTable.startsAt, end), lt(classOccurrencesTable.startsAt, nowOf(req))))
      : [{ n: 0 }];
    const classesHeld = heldRows[0]?.n ?? 0;
    const fIds = [...new Set(logs.map((l) => l.focusVersionId).filter((x): x is string => !!x))];
    const areas = fIds.length
      ? await db
          .select({ name: focusCategoriesTable.name, sessions: sql<number>`count(*)::int` })
          .from(attendanceLogsTable)
          .innerJoin(weeklyFocusVersionsTable, eq(weeklyFocusVersionsTable.id, attendanceLogsTable.focusVersionId))
          .innerJoin(focusCategoriesTable, eq(focusCategoriesTable.id, weeklyFocusVersionsTable.categoryId))
          .where(inArray(attendanceLogsTable.id, logs.map((l) => l.id)))
          .groupBy(focusCategoriesTable.name)
      : [];
    const obs = await db
      .select({ visibility: observationsTable.visibility, n: sql<number>`count(*)::int` })
      .from(observationsTable)
      .where(and(eq(observationsTable.childId, childId), eq(observationsTable.gymId, gymId), eq(observationsTable.status, "active"), gte(observationsTable.createdAt, start), lt(observationsTable.createdAt, end)))
      .groupBy(observationsTable.visibility);
    const milestones = await db
      .select({ label: milestoneRulesTable.label, reachedAt: milestoneStatesTable.reachedAt })
      .from(milestoneStatesTable)
      .innerJoin(milestoneRulesTable, eq(milestoneRulesTable.id, milestoneStatesTable.ruleId))
      .where(and(eq(milestoneStatesTable.childId, childId), eq(milestoneStatesTable.status, "reached"), eq(milestoneRulesTable.gymId, gymId), gte(milestoneStatesTable.reachedAt, start), lt(milestoneStatesTable.reachedAt, end)));
    const stars = await db
      .select({ weekStart: starAwardsTable.weekStart, note: starAwardsTable.note })
      .from(starAwardsTable)
      .where(and(eq(starAwardsTable.childId, childId), eq(starAwardsTable.gymId, gymId), eq(starAwardsTable.status, "active"), gte(starAwardsTable.weekStart, first), lt(starAwardsTable.weekStart, nextFirst)));
    const [child] = await db.select({ displayName: childrenTable.displayName }).from(childrenTable).where(eq(childrenTable.id, childId));
    res.json({
      month,
      child: { id: childId, displayName: child!.displayName },
      sessionsLogged: logs.length,
      classesHeld,
      // Wording matters: a class without a log means the family did not log it, nothing more.
      notLogged: Math.max(0, classesHeld - logs.length),
      notLoggedNote: "Classes with no log were not logged by the family. This does not mean the child was absent.",
      areasPracticed: areas,
      observations: { shared: obs.find((o) => o.visibility === "shared")?.n ?? 0, private: obs.find((o) => o.visibility === "private")?.n ?? 0 },
      milestones,
      stars,
      lifetimeSessions: await activeSessionCount(db, childId),
      wellbeing: await coachWellbeingSummary(childId, first, nextFirst),
      hasData: logs.length + classesHeld + milestones.length + stars.length > 0,
    });
  }),
);

// == Coach-visible child history (role-filtered) ============================================================
router.get(
  "/gyms/:gymId/children/:childId/history",
  h(async (req, res) => {
    const gymId = uuidParam(req, "gymId");
    const childId = uuidParam(req, "childId");
    await staffChildGym(userId(req), gymId, childId);
    const rows = (await db
      .select()
      .from(changeHistoryTable)
      .where(and(eq(changeHistoryTable.childId, childId), eq(changeHistoryTable.gymId, gymId)))
      .orderBy(desc(changeHistoryTable.id))
      .limit(300)) as HistoryRow[];
    const visible = rows.filter(coachCanSee).slice(0, 100);
    const ids = [...new Set(visible.map((r) => r.actorUserId).filter((x): x is string => !!x))];
    const users = ids.length ? await db.select({ id: usersTable.id, name: usersTable.displayName }).from(usersTable).where(inArray(usersTable.id, ids)) : [];
    const names = new Map(users.map((u) => [u.id, u.name as string | null]));
    res.json({ history: visible.map((r) => toCoachItem(r, names)) });
  }),
);

// == "Change future from date X" for a recurring class ======================================================
const changeFromBody = z.object({
  fromDate: ymd,
  title: z.string().trim().min(1).max(80).optional(),
  weekday: z.number().int().min(0).max(6).optional(),
  startLocal: hhmm.optional(),
  endLocal: hhmm.optional(),
  coachUserId: z.string().nullable().optional(),
});

router.post(
  "/gyms/:gymId/schedules/:scheduleId/change-from",
  h(async (req, res) => {
    const gymId = uuidParam(req, "gymId");
    const sid = uuidParam(req, "scheduleId");
    const uid = userId(req);
    const now = nowOf(req);
    const staff = await requireGymStaff(uid, gymId, "admin");
    const b = parse(changeFromBody, req.body);
    const gym = await gymOf(gymId);
    const today = localDate(now, gym.timezone);
    if (b.fromDate < today) throw new JuniorError(422, "PAST_DATE", "Changes apply from today or later");
    const out = await db.transaction(async (tx) => {
      const [old] = await tx.select().from(classSchedulesTable).where(and(eq(classSchedulesTable.id, sid), eq(classSchedulesTable.gymId, gymId))).for("update");
      if (!old) throw new JuniorError(404, "NOT_FOUND", "Not found");
      if (old.effectiveTo && old.effectiveTo < b.fromDate) throw new JuniorError(422, "SCHEDULE_ENDED", "That schedule has already ended before this date");
      const startLocal = b.startLocal ?? old.startLocal;
      const endLocal = b.endLocal ?? old.endLocal;
      if (endLocal <= startLocal) throw new JuniorError(422, "BAD_TIME", "End must be after start");
      // 1. End the old schedule the day before the change.
      await tx.update(classSchedulesTable).set({ effectiveTo: addDays(b.fromDate, -1) }).where(eq(classSchedulesTable.id, sid));
      // 2. Drop its future occurrences that have NO logs; occurrences with logs are kept untouched.
      const future = await tx
        .select({ id: classOccurrencesTable.id, originalDate: classOccurrencesTable.originalDate })
        .from(classOccurrencesTable)
        .where(and(eq(classOccurrencesTable.scheduleId, sid), gte(classOccurrencesTable.originalDate, b.fromDate)));
      const keptDates = new Set<string>();
      let removed = 0;
      for (const o of future) {
        const [log] = await tx.select({ id: attendanceLogsTable.id }).from(attendanceLogsTable).where(eq(attendanceLogsTable.occurrenceId, o.id)).limit(1);
        if (log) keptDates.add(o.originalDate);
        else {
          await tx.delete(classOccurrencesTable).where(eq(classOccurrencesTable.id, o.id));
          removed++;
        }
      }
      // 3. New schedule from fromDate, with the changed fields.
      const [fresh] = await tx
        .insert(classSchedulesTable)
        .values({ gymId, groupId: old.groupId, title: b.title ?? old.title, weekday: b.weekday ?? old.weekday, startLocal, endLocal, coachUserId: b.coachUserId === undefined ? old.coachUserId : b.coachUserId, effectiveFrom: b.fromDate, effectiveTo: old.effectiveTo })
        .returning();
      const created = await generateForSchedule(tx, fresh!, gym.timezone, b.fromDate, addDays(today, HORIZON_DAYS));
      // A kept (logged) occurrence on the same day wins: do not create a second class that day.
      let dupes = 0;
      for (const d of keptDates) {
        const del = await tx.delete(classOccurrencesTable).where(and(eq(classOccurrencesTable.scheduleId, fresh!.id), eq(classOccurrencesTable.originalDate, d))).returning({ id: classOccurrencesTable.id });
        dupes += del.length;
      }
      await tx.insert(announcementsTable).values({ gymId, groupId: old.groupId, kind: "timetable", title: `Timetable change from ${b.fromDate}`, body: `${fresh!.title} will run ${startLocal}-${endLocal} from ${b.fromDate}.`, publishedBy: uid });
      await recordHistory(tx, { gymId, actorUserId: uid, actorRole: actorOf(staff.role), entity: "schedule", entityId: sid, action: "changed_from", before: { title: old.title, weekday: old.weekday, startLocal: old.startLocal, endLocal: old.endLocal }, after: { fromDate: b.fromDate, newScheduleId: fresh!.id, title: fresh!.title, weekday: fresh!.weekday, startLocal, endLocal } });
      return { schedule: fresh!, groupId: old.groupId, removedOccurrences: removed, createdOccurrences: created - dupes, keptLogged: keptDates.size };
    });
    await guardianIdsOfGroup(out.groupId).then((ids) => notifyUsers(ids, noticeFor("timetable", `sched:${out.schedule.id}`), now));
    const { groupId: _g, ...pub } = out;
    res.status(201).json(pub);
  }),
);

// == Team / staff area for gym admins ======================================================================
router.get(
  "/gyms/:gymId/team",
  h(async (req, res) => {
    const gymId = uuidParam(req, "gymId");
    const now = nowOf(req);
    await requireGymStaff(userId(req), gymId, "admin");
    const staff = await db
      .select({ userId: gymStaffTable.userId, role: gymStaffTable.role, status: gymStaffTable.status, email: usersTable.email, name: usersTable.displayName })
      .from(gymStaffTable)
      .innerJoin(usersTable, eq(usersTable.id, gymStaffTable.userId))
      .where(eq(gymStaffTable.gymId, gymId))
      .orderBy(asc(usersTable.displayName));
    const invites = await db
      .select({ id: staffInvitesTable.id, email: staffInvitesTable.email, role: staffInvitesTable.role, expiresAt: staffInvitesTable.expiresAt })
      .from(staffInvitesTable)
      .where(and(eq(staffInvitesTable.gymId, gymId), isNull(staffInvitesTable.acceptedAt), isNull(staffInvitesTable.declinedAt), isNull(staffInvitesTable.cancelledAt), gte(staffInvitesTable.expiresAt, now)));
    const groups = await db.select().from(classGroupsTable).where(eq(classGroupsTable.gymId, gymId)).orderBy(asc(classGroupsTable.name));
    const members = await db
      .select({ childId: childrenTable.id, displayName: childrenTable.displayName, groupId: groupMembershipsTable.groupId })
      .from(childGymMembershipsTable)
      .innerJoin(childrenTable, eq(childrenTable.id, childGymMembershipsTable.childId))
      .leftJoin(groupMembershipsTable, and(eq(groupMembershipsTable.childId, childrenTable.id), isNull(groupMembershipsTable.effectiveTo)))
      .where(and(eq(childGymMembershipsTable.gymId, gymId), eq(childGymMembershipsTable.status, "approved"), eq(childrenTable.status, "active")));
    res.json({
      staff,
      pendingInvites: invites,
      groups: groups.map((g) => ({ ...g, childCount: members.filter((m) => m.groupId === g.id).length })),
      unassigned: members.filter((m) => !m.groupId).map((m) => ({ id: m.childId, displayName: m.displayName })),
      emptyState: staff.filter((s) => s.status === "active").length <= 1 && invites.length === 0 ? { code: "ONLY_YOU", message: "You are the only staff member. Invite a coach by email to share the work." } : null,
    });
  }),
);

router.patch(
  "/gyms/:gymId/staff/:staffUserId",
  h(async (req, res) => {
    const gymId = uuidParam(req, "gymId");
    const uid = userId(req);
    await requireGymStaff(uid, gymId, "admin");
    const target = String(req.params["staffUserId"]);
    const { role } = parse(z.object({ role: z.enum(["coach", "admin"]) }), req.body);
    await db.transaction(async (tx) => {
      const [row] = await tx.select().from(gymStaffTable).where(and(eq(gymStaffTable.gymId, gymId), eq(gymStaffTable.userId, target), eq(gymStaffTable.status, "active"))).for("update");
      if (!row) throw new JuniorError(404, "NOT_FOUND", "Not found");
      if (row.role === "admin" && role === "coach") {
        const admins = await tx.select({ id: gymStaffTable.id }).from(gymStaffTable).where(and(eq(gymStaffTable.gymId, gymId), eq(gymStaffTable.role, "admin"), eq(gymStaffTable.status, "active")));
        if (admins.length <= 1) throw new JuniorError(409, "LAST_ADMIN", "A gym needs at least one admin");
      }
      if (row.role === role) return;
      await tx.update(gymStaffTable).set({ role }).where(eq(gymStaffTable.id, row.id));
      await recordHistory(tx, { gymId, actorUserId: uid, actorRole: "admin", entity: "gym_staff", entityId: target, action: "role_changed", before: { role: row.role }, after: { role } });
    });
    res.json({ ok: true });
  }),
);

router.post(
  "/gyms/:gymId/staff-invites/:inviteId/cancel",
  h(async (req, res) => {
    const gymId = uuidParam(req, "gymId");
    const iid = uuidParam(req, "inviteId");
    const uid = userId(req);
    await requireGymStaff(uid, gymId, "admin");
    await db.transaction(async (tx) => {
      const rows = await tx
        .update(staffInvitesTable)
        .set({ cancelledAt: nowOf(req) })
        .where(and(eq(staffInvitesTable.id, iid), eq(staffInvitesTable.gymId, gymId), isNull(staffInvitesTable.acceptedAt), isNull(staffInvitesTable.cancelledAt)))
        .returning({ id: staffInvitesTable.id });
      if (!rows.length) throw new JuniorError(404, "NOT_FOUND", "Not found");
      await recordHistory(tx, { gymId, actorUserId: uid, actorRole: "admin", entity: "staff_invite", entityId: iid, action: "cancelled" });
    });
    res.json({ ok: true });
  }),
);

router.patch(
  "/gyms/:gymId/groups/:groupId",
  h(async (req, res) => {
    const gymId = uuidParam(req, "gymId");
    const gid = uuidParam(req, "groupId");
    const uid = userId(req);
    await requireGymStaff(uid, gymId, "admin");
    const b = parse(z.object({ name: z.string().trim().min(1).max(80).optional(), ageBand: z.string().trim().max(40).optional(), active: z.boolean().optional() }).refine((x) => Object.keys(x).length > 0, "Nothing to change"), req.body);
    await db.transaction(async (tx) => {
      const [g] = await tx.select().from(classGroupsTable).where(and(eq(classGroupsTable.id, gid), eq(classGroupsTable.gymId, gymId))).for("update");
      if (!g) throw new JuniorError(404, "NOT_FOUND", "Not found");
      if (b.active === false) {
        const m = await tx.select({ id: groupMembershipsTable.id }).from(groupMembershipsTable).where(and(eq(groupMembershipsTable.groupId, gid), isNull(groupMembershipsTable.effectiveTo))).limit(1);
        if (m.length) throw new JuniorError(409, "GROUP_NOT_EMPTY", "Move the children to another group before archiving this one");
      }
      await tx.update(classGroupsTable).set(b).where(eq(classGroupsTable.id, gid));
      await recordHistory(tx, { gymId, actorUserId: uid, actorRole: "admin", entity: "group", entityId: gid, action: "updated", before: { name: g.name, ageBand: g.ageBand, active: g.active }, after: b });
    });
    res.json({ ok: true });
  }),
);

/** Bulk-assign approved children to a group. All-or-nothing: one bad id rolls the whole batch back. */
router.post(
  "/gyms/:gymId/groups/:groupId/assign",
  h(async (req, res) => {
    const gymId = uuidParam(req, "gymId");
    const gid = uuidParam(req, "groupId");
    const uid = userId(req);
    await requireGymStaff(uid, gymId, "admin");
    const { childIds } = parse(z.object({ childIds: z.array(z.string().uuid()).min(1).max(200) }), req.body);
    const ids = [...new Set(childIds)];
    await db.transaction(async (tx) => {
      const [g] = await tx.select({ id: classGroupsTable.id }).from(classGroupsTable).where(and(eq(classGroupsTable.id, gid), eq(classGroupsTable.gymId, gymId), eq(classGroupsTable.active, true)));
      if (!g) throw new JuniorError(422, "BAD_GROUP", "Group does not belong to this gym");
      const ok = await tx
        .select({ childId: childGymMembershipsTable.childId })
        .from(childGymMembershipsTable)
        .where(and(eq(childGymMembershipsTable.gymId, gymId), eq(childGymMembershipsTable.status, "approved"), inArray(childGymMembershipsTable.childId, ids)));
      if (ok.length !== ids.length) throw new JuniorError(422, "BAD_CHILDREN", "Every child must have an approved membership at this gym");
      for (const childId of ids) {
        const cur = await tx.select({ groupId: groupMembershipsTable.groupId }).from(groupMembershipsTable).where(and(eq(groupMembershipsTable.childId, childId), isNull(groupMembershipsTable.effectiveTo)));
        if (cur[0]?.groupId === gid) continue;
        await tx.update(groupMembershipsTable).set({ effectiveTo: nowOf(req) }).where(and(eq(groupMembershipsTable.childId, childId), isNull(groupMembershipsTable.effectiveTo)));
        await tx.insert(groupMembershipsTable).values({ childId, groupId: gid });
        await recordHistory(tx, { gymId, childId, actorUserId: uid, actorRole: "admin", entity: "group_membership", action: "moved", before: { groupId: cur[0]?.groupId ?? null }, after: { groupId: gid } });
      }
    });
    res.json({ ok: true, assigned: ids.length });
  }),
);

export default router;
