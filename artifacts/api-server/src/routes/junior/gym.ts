import { Router, type IRouter } from "express";
import { z } from "zod/v4";
import { and, asc, desc, eq, gte, inArray, isNull, lt, lte, or } from "drizzle-orm";
import {
  db,
  announcementReadsTable,
  announcementsTable,
  attendanceLogsTable,
  classGroupsTable,
  classOccurrencesTable,
  classSchedulesTable,
  focusCategoriesTable,
  gymsTable,
  milestoneRulesTable,
  weeklyFocusesTable,
  weeklyFocusVersionsTable,
} from "@workspace/db";
import { h, JuniorError, nowOf, parse, userId, uuidParam } from "../../lib/junior/http";
import { recordHistory, type DbLike } from "../../lib/junior/history";
import { assertGuardianWithGym, requireGymStaff } from "../../lib/junior/authz";
import { ensureHorizon, generateForSchedule, HORIZON_DAYS, localInstant, weekStartOf } from "../../lib/junior/timetable";
import { recalcMilestones } from "../../lib/junior/milestones";
import { addDays, localDate } from "../../lib/localTime";
import { guardianIdsOfGroup, guardianIdsOfGym, noticeFor, notifyUsers } from "../../lib/junior/notify";

const router: IRouter = Router();
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM");
const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");
const actorOf = (role: string) => (role === "admin" ? ("admin" as const) : ("coach" as const));

async function gymTz(gymId: string, conn: DbLike = db): Promise<string> {
  const [g] = await conn.select({ tz: gymsTable.timezone }).from(gymsTable).where(eq(gymsTable.id, gymId));
  return g?.tz ?? "Asia/Bangkok";
}

// ── Groups ───────────────────────────────────────────────────────────────────
router.get(
  "/gyms/:gymId/groups",
  h(async (req, res) => {
    const gymId = uuidParam(req, "gymId");
    await requireGymStaff(userId(req), gymId, "coach");
    res.json({ groups: await db.select().from(classGroupsTable).where(and(eq(classGroupsTable.gymId, gymId), eq(classGroupsTable.active, true))).orderBy(asc(classGroupsTable.name)) });
  }),
);

router.post(
  "/gyms/:gymId/groups",
  h(async (req, res) => {
    const gymId = uuidParam(req, "gymId");
    const uid = userId(req);
    const staff = await requireGymStaff(uid, gymId, "admin");
    const b = parse(z.object({ name: z.string().trim().min(1).max(80), ageBand: z.string().trim().max(40).default("") }), req.body);
    const g = await db.transaction(async (tx) => {
      const [row] = await tx.insert(classGroupsTable).values({ gymId, name: b.name, ageBand: b.ageBand }).returning();
      await recordHistory(tx, { gymId, actorUserId: uid, actorRole: actorOf(staff.role), entity: "group", entityId: row!.id, action: "created", after: b });
      return row!;
    });
    res.status(201).json({ group: g });
  }),
);

// ── Schedules (recurring weekly) ─────────────────────────────────────────────
const scheduleBody = z.object({
  groupId: z.string().uuid(),
  title: z.string().trim().min(1).max(80),
  weekday: z.number().int().min(0).max(6),
  startLocal: hhmm,
  endLocal: hhmm,
  coachUserId: z.string().optional(),
  effectiveFrom: ymd.optional(),
  effectiveTo: ymd.optional(),
});

router.post(
  "/gyms/:gymId/schedules",
  h(async (req, res) => {
    const gymId = uuidParam(req, "gymId");
    const uid = userId(req);
    const staff = await requireGymStaff(uid, gymId, "admin");
    const b = parse(scheduleBody, req.body);
    if (b.endLocal <= b.startLocal) throw new JuniorError(422, "BAD_TIME", "End must be after start");
    const tz = await gymTz(gymId);
    const today = localDate(nowOf(req), tz);
    const out = await db.transaction(async (tx) => {
      const [grp] = await tx.select({ id: classGroupsTable.id }).from(classGroupsTable).where(and(eq(classGroupsTable.id, b.groupId), eq(classGroupsTable.gymId, gymId)));
      if (!grp) throw new JuniorError(422, "BAD_GROUP", "Group does not belong to this gym");
      const [s] = await tx
        .insert(classSchedulesTable)
        .values({ gymId, groupId: b.groupId, title: b.title, weekday: b.weekday, startLocal: b.startLocal, endLocal: b.endLocal, coachUserId: b.coachUserId ?? null, effectiveFrom: b.effectiveFrom ?? today, effectiveTo: b.effectiveTo ?? null })
        .returning();
      const created = await generateForSchedule(tx, s!, tz, s!.effectiveFrom, addDays(today, HORIZON_DAYS));
      await recordHistory(tx, { gymId, actorUserId: uid, actorRole: actorOf(staff.role), entity: "schedule", entityId: s!.id, action: "created", after: { title: b.title, weekday: b.weekday } });
      return { schedule: s!, occurrencesCreated: created };
    });
    res.status(201).json(out);
  }),
);

/** End a schedule: future generated occurrences without logs are removed; ones with logs stay. */
router.post(
  "/gyms/:gymId/schedules/:scheduleId/end",
  h(async (req, res) => {
    const gymId = uuidParam(req, "gymId");
    const sid = uuidParam(req, "scheduleId");
    const uid = userId(req);
    const staff = await requireGymStaff(uid, gymId, "admin");
    const tz = await gymTz(gymId);
    const today = localDate(nowOf(req), tz);
    await db.transaction(async (tx) => {
      const rows = await tx.update(classSchedulesTable).set({ effectiveTo: today }).where(and(eq(classSchedulesTable.id, sid), eq(classSchedulesTable.gymId, gymId))).returning({ id: classSchedulesTable.id });
      if (!rows.length) throw new JuniorError(404, "NOT_FOUND", "Not found");
      const future = await tx
        .select({ id: classOccurrencesTable.id })
        .from(classOccurrencesTable)
        .where(and(eq(classOccurrencesTable.scheduleId, sid), gte(classOccurrencesTable.originalDate, addDays(today, 1))));
      for (const o of future) {
        const [log] = await tx.select({ id: attendanceLogsTable.id }).from(attendanceLogsTable).where(eq(attendanceLogsTable.occurrenceId, o.id)).limit(1);
        if (!log) await tx.delete(classOccurrencesTable).where(eq(classOccurrencesTable.id, o.id));
      }
      await recordHistory(tx, { gymId, actorUserId: uid, actorRole: actorOf(staff.role), entity: "schedule", entityId: sid, action: "ended" });
    });
    res.json({ ok: true });
  }),
);

// ── Occurrences ──────────────────────────────────────────────────────────────
router.post(
  "/gyms/:gymId/occurrences",
  h(async (req, res) => {
    const gymId = uuidParam(req, "gymId");
    const uid = userId(req);
    const staff = await requireGymStaff(uid, gymId, "coach");
    const b = parse(z.object({ groupId: z.string().uuid(), title: z.string().trim().min(1).max(80), date: ymd, startLocal: hhmm, endLocal: hhmm, coachUserId: z.string().optional() }), req.body);
    if (b.endLocal <= b.startLocal) throw new JuniorError(422, "BAD_TIME", "End must be after start");
    const tz = await gymTz(gymId);
    const o = await db.transaction(async (tx) => {
      const [grp] = await tx.select({ id: classGroupsTable.id }).from(classGroupsTable).where(and(eq(classGroupsTable.id, b.groupId), eq(classGroupsTable.gymId, gymId)));
      if (!grp) throw new JuniorError(422, "BAD_GROUP", "Group does not belong to this gym");
      const [row] = await tx
        .insert(classOccurrencesTable)
        .values({ gymId, groupId: b.groupId, originalDate: b.date, startsAt: localInstant(b.date, b.startLocal, tz), endsAt: localInstant(b.date, b.endLocal, tz), title: b.title, coachUserId: b.coachUserId ?? uid })
        .returning();
      await recordHistory(tx, { gymId, actorUserId: uid, actorRole: actorOf(staff.role), entity: "occurrence", entityId: row!.id, action: "created_oneoff" });
      return row!;
    });
    res.status(201).json({ occurrence: o });
  }),
);

const occEdit = z.object({
  title: z.string().trim().min(1).max(80).optional(),
  startLocal: hhmm.optional(),
  endLocal: hhmm.optional(),
  date: ymd.optional(),
  coachUserId: z.string().nullable().optional(),
  cancel: z.boolean().optional(),
  confirm: z.boolean().optional(),
});

/**
 * Edit or cancel ONE occurrence. Families of the group get a timetable announcement.
 * Cancelling a class that already has parent logs needs `confirm: true` and removes those logs
 * (reason class_cancelled), recalculating milestones in the same transaction.
 */
router.patch(
  "/gyms/:gymId/occurrences/:occId",
  h(async (req, res) => {
    const gymId = uuidParam(req, "gymId");
    const occId = uuidParam(req, "occId");
    const uid = userId(req);
    const now = nowOf(req);
    const staff = await requireGymStaff(uid, gymId, "coach");
    const b = parse(occEdit, req.body);
    const tz = await gymTz(gymId);
    const out = await db.transaction(async (tx) => {
      const [o] = await tx.select().from(classOccurrencesTable).where(and(eq(classOccurrencesTable.id, occId), eq(classOccurrencesTable.gymId, gymId))).for("update");
      if (!o) throw new JuniorError(404, "NOT_FOUND", "Not found");
      const logs = await tx
        .select({ id: attendanceLogsTable.id, childId: attendanceLogsTable.childId })
        .from(attendanceLogsTable)
        .where(and(eq(attendanceLogsTable.occurrenceId, occId), eq(attendanceLogsTable.status, "active")));
      const role = actorOf(staff.role);
      if (b.cancel) {
        if (o.status === "cancelled") return { cancelled: true, removedLogs: 0, notify: false, groupId: o.groupId };
        if (logs.length && !b.confirm) {
          throw new JuniorError(409, "HAS_LOGS", `${logs.length} attendance log(s) exist for this class. Confirm to cancel and remove them.`, { logCount: logs.length });
        }
        await tx.update(classOccurrencesTable).set({ status: "cancelled", edited: true }).where(eq(classOccurrencesTable.id, occId));
        if (logs.length) {
          await tx
            .update(attendanceLogsTable)
            .set({ status: "removed", removedBy: uid, removedAt: now, removedReason: "class_cancelled" })
            .where(inArray(attendanceLogsTable.id, logs.map((l) => l.id)));
          for (const c of new Set(logs.map((l) => l.childId))) await recalcMilestones(tx, c, gymId, { userId: uid, role }, now);
        }
        await tx.insert(announcementsTable).values({ gymId, groupId: o.groupId, kind: "timetable", title: `Cancelled: ${o.title}`, body: `${o.title} on ${o.originalDate} is cancelled.`, occurrenceId: occId, publishedBy: uid });
        await recordHistory(tx, { gymId, actorUserId: uid, actorRole: role, entity: "occurrence", entityId: occId, action: "cancelled", before: { startsAt: o.startsAt }, after: { removedLogs: logs.length } });
        return { cancelled: true, removedLogs: logs.length, notify: true, groupId: o.groupId };
      }
      const date = b.date ?? localDate(o.startsAt, tz);
      const startLocal = b.startLocal ?? hhmmOf(o.startsAt, tz);
      const endLocal = b.endLocal ?? hhmmOf(o.endsAt, tz);
      if (endLocal <= startLocal) throw new JuniorError(422, "BAD_TIME", "End must be after start");
      const startsAt = localInstant(date, startLocal, tz);
      if (logs.length && startsAt.getTime() > now.getTime()) {
        throw new JuniorError(422, "HAS_LOGS", "This class already has attendance logs and cannot move into the future");
      }
      const patch = { title: b.title ?? o.title, startsAt, endsAt: localInstant(date, endLocal, tz), coachUserId: b.coachUserId === undefined ? o.coachUserId : b.coachUserId, edited: true };
      await tx.update(classOccurrencesTable).set(patch).where(eq(classOccurrencesTable.id, occId));
      await tx.insert(announcementsTable).values({ gymId, groupId: o.groupId, kind: "timetable", title: `Changed: ${patch.title}`, body: `${patch.title} now ${date} ${startLocal}-${endLocal}.`, occurrenceId: occId, publishedBy: uid });
      await recordHistory(tx, { gymId, actorUserId: uid, actorRole: role, entity: "occurrence", entityId: occId, action: "edited", before: { startsAt: o.startsAt, title: o.title }, after: { startsAt, title: patch.title } });
      return { cancelled: false, removedLogs: 0, notify: true, groupId: o.groupId };
    });
    if (out.notify) await guardianIdsOfGroup(out.groupId).then((ids) => notifyUsers(ids, noticeFor("timetable", `occ:${occId}:${now.getTime()}`), now));
    const { notify: _n, groupId: _g, ...pub } = out;
    res.json({ ok: true, ...pub });
  }),
);

function hhmmOf(d: Date, tz: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);
  return parts;
}

router.get(
  "/gyms/:gymId/occurrences",
  h(async (req, res) => {
    const gymId = uuidParam(req, "gymId");
    await requireGymStaff(userId(req), gymId, "coach");
    const q = parse(z.object({ from: ymd.optional(), to: ymd.optional(), groupId: z.string().uuid().optional() }), req.query);
    const tz = await gymTz(gymId);
    const today = localDate(nowOf(req), tz);
    await ensureHorizon(gymId, nowOf(req));
    const from = q.from ?? today;
    const to = q.to ?? addDays(from, 14);
    const conds = [eq(classOccurrencesTable.gymId, gymId), gte(classOccurrencesTable.originalDate, from), lte(classOccurrencesTable.originalDate, to)];
    if (q.groupId) conds.push(eq(classOccurrencesTable.groupId, q.groupId));
    res.json({ occurrences: await db.select().from(classOccurrencesTable).where(and(...conds)).orderBy(asc(classOccurrencesTable.startsAt)) });
  }),
);

// ── Weekly focus (versioned; carried forward) ────────────────────────────────
router.get(
  "/gyms/:gymId/focus-categories",
  h(async (req, res) => {
    const gymId = uuidParam(req, "gymId");
    await requireGymStaff(userId(req), gymId, "coach");
    res.json({ categories: await db.select().from(focusCategoriesTable).where(and(eq(focusCategoriesTable.gymId, gymId), eq(focusCategoriesTable.active, true))).orderBy(asc(focusCategoriesTable.sort)) });
  }),
);

router.post(
  "/gyms/:gymId/focus-categories",
  h(async (req, res) => {
    const gymId = uuidParam(req, "gymId");
    await requireGymStaff(userId(req), gymId, "admin");
    const b = parse(z.object({ name: z.string().trim().min(1).max(60), sort: z.number().int().default(0) }), req.body);
    const [c] = await db.insert(focusCategoriesTable).values({ gymId, ...b }).returning();
    res.status(201).json({ category: c });
  }),
);

export async function focusFor(conn: DbLike, groupId: string, weekStart: string) {
  const [exact] = await conn.select().from(weeklyFocusesTable).where(and(eq(weeklyFocusesTable.groupId, groupId), eq(weeklyFocusesTable.weekStart, weekStart)));
  let wf = exact;
  let carriedFrom: string | null = null;
  if (!wf) {
    const [prev] = await conn
      .select()
      .from(weeklyFocusesTable)
      .where(and(eq(weeklyFocusesTable.groupId, groupId), lt(weeklyFocusesTable.weekStart, weekStart)))
      .orderBy(desc(weeklyFocusesTable.weekStart))
      .limit(1);
    if (prev) {
      wf = prev;
      carriedFrom = prev.weekStart;
    }
  }
  if (!wf) return null;
  const [v] = await conn.select().from(weeklyFocusVersionsTable).where(eq(weeklyFocusVersionsTable.weeklyFocusId, wf.id)).orderBy(desc(weeklyFocusVersionsTable.version)).limit(1);
  if (!v) return null;
  return { weekStart, carriedFrom, versionId: v.id, version: v.version, categoryId: v.categoryId, title: v.title, practiceDetails: v.practiceDetails, updatedAt: v.createdAt };
}

router.get(
  "/gyms/:gymId/groups/:groupId/focus",
  h(async (req, res) => {
    const gymId = uuidParam(req, "gymId");
    const groupId = uuidParam(req, "groupId");
    await requireGymStaff(userId(req), gymId, "coach");
    const q = parse(z.object({ weekStart: ymd.optional() }), req.query);
    const ws = weekStartOf(q.weekStart ?? localDate(nowOf(req), await gymTz(gymId)));
    res.json({ focus: await focusFor(db, groupId, ws) });
  }),
);

router.put(
  "/gyms/:gymId/groups/:groupId/focus",
  h(async (req, res) => {
    const gymId = uuidParam(req, "gymId");
    const groupId = uuidParam(req, "groupId");
    const uid = userId(req);
    const staff = await requireGymStaff(uid, gymId, "coach");
    const b = parse(z.object({ weekStart: ymd.optional(), categoryId: z.string().uuid().nullable().optional(), title: z.string().trim().min(1).max(120), practiceDetails: z.string().trim().max(2000).default("") }), req.body);
    const ws = weekStartOf(b.weekStart ?? localDate(nowOf(req), await gymTz(gymId)));
    const out = await db.transaction(async (tx) => {
      const [grp] = await tx.select({ id: classGroupsTable.id }).from(classGroupsTable).where(and(eq(classGroupsTable.id, groupId), eq(classGroupsTable.gymId, gymId)));
      if (!grp) throw new JuniorError(404, "NOT_FOUND", "Not found");
      if (b.categoryId) {
        const [c] = await tx.select({ id: focusCategoriesTable.id }).from(focusCategoriesTable).where(and(eq(focusCategoriesTable.id, b.categoryId), eq(focusCategoriesTable.gymId, gymId)));
        if (!c) throw new JuniorError(422, "BAD_CATEGORY", "Category does not belong to this gym");
      }
      await tx.insert(weeklyFocusesTable).values({ groupId, weekStart: ws }).onConflictDoNothing();
      const [wf] = await tx.select().from(weeklyFocusesTable).where(and(eq(weeklyFocusesTable.groupId, groupId), eq(weeklyFocusesTable.weekStart, ws))).for("update");
      const [last] = await tx.select({ v: weeklyFocusVersionsTable.version }).from(weeklyFocusVersionsTable).where(eq(weeklyFocusVersionsTable.weeklyFocusId, wf!.id)).orderBy(desc(weeklyFocusVersionsTable.version)).limit(1);
      const [ver] = await tx
        .insert(weeklyFocusVersionsTable)
        .values({ weeklyFocusId: wf!.id, version: (last?.v ?? 0) + 1, categoryId: b.categoryId ?? null, title: b.title, practiceDetails: b.practiceDetails, createdBy: uid })
        .returning();
      await recordHistory(tx, { gymId, actorUserId: uid, actorRole: actorOf(staff.role), entity: "weekly_focus", entityId: wf!.id, action: "version_added", after: { version: ver!.version, title: b.title } });
      return ver!;
    });
    res.json({ ok: true, version: out.version, versionId: out.id, weekStart: ws });
  }),
);

// ── Milestone rules (gym admin) ──────────────────────────────────────────────
router.get(
  "/gyms/:gymId/milestone-rules",
  h(async (req, res) => {
    const gymId = uuidParam(req, "gymId");
    await requireGymStaff(userId(req), gymId, "coach");
    res.json({ rules: await db.select().from(milestoneRulesTable).where(eq(milestoneRulesTable.gymId, gymId)).orderBy(asc(milestoneRulesTable.threshold)) });
  }),
);

router.put(
  "/gyms/:gymId/milestone-rules",
  h(async (req, res) => {
    const gymId = uuidParam(req, "gymId");
    const uid = userId(req);
    await requireGymStaff(uid, gymId, "admin");
    const b = parse(z.object({ threshold: z.number().int().min(1).max(10000), label: z.string().trim().min(1).max(60), active: z.boolean().default(true) }), req.body);
    await db.transaction(async (tx) => {
      await tx
        .insert(milestoneRulesTable)
        .values({ gymId, threshold: b.threshold, label: b.label, active: b.active })
        .onConflictDoUpdate({ target: [milestoneRulesTable.gymId, milestoneRulesTable.kind, milestoneRulesTable.threshold], set: { label: b.label, active: b.active } });
      await recordHistory(tx, { gymId, actorUserId: uid, actorRole: "admin", entity: "milestone_rule", action: "upserted", after: b });
    });
    res.json({ ok: true });
  }),
);

// ── Announcements ────────────────────────────────────────────────────────────
router.post(
  "/gyms/:gymId/announcements",
  h(async (req, res) => {
    const gymId = uuidParam(req, "gymId");
    const uid = userId(req);
    await requireGymStaff(uid, gymId, "coach");
    const b = parse(z.object({ title: z.string().trim().min(1).max(120), body: z.string().trim().max(2000).default(""), groupId: z.string().uuid().optional() }), req.body);
    const [a] = await db.insert(announcementsTable).values({ gymId, groupId: b.groupId ?? null, kind: "general", title: b.title, body: b.body, publishedBy: uid }).returning();
    await (b.groupId ? guardianIdsOfGroup(b.groupId) : guardianIdsOfGym(gymId)).then((ids) => notifyUsers(ids, noticeFor("announcements", `ann:${a!.id}`), nowOf(req)));
    res.status(201).json({ announcement: a });
  }),
);

router.get(
  "/children/:childId/announcements",
  h(async (req, res) => {
    const childId = uuidParam(req, "childId");
    const uid = userId(req);
    const { membership } = await assertGuardianWithGym(uid, childId);
    const rows = await db
      .select()
      .from(announcementsTable)
      .where(and(eq(announcementsTable.gymId, membership.gymId), or(isNull(announcementsTable.groupId), membership.groupId ? eq(announcementsTable.groupId, membership.groupId) : isNull(announcementsTable.groupId))))
      .orderBy(desc(announcementsTable.createdAt))
      .limit(50);
    const reads = rows.length ? await db.select().from(announcementReadsTable).where(and(eq(announcementReadsTable.userId, uid), inArray(announcementReadsTable.announcementId, rows.map((r) => r.id)))) : [];
    const readSet = new Set(reads.map((r) => r.announcementId));
    res.json({ announcements: rows.map((r) => ({ ...r, read: readSet.has(r.id) })) });
  }),
);

router.post(
  "/announcements/:announcementId/read",
  h(async (req, res) => {
    const aid = uuidParam(req, "announcementId");
    const uid = userId(req);
    // Only a guardian of a child in the announcement's gym (and group, if targeted) may mark it read.
    const [a] = await db.select().from(announcementsTable).where(eq(announcementsTable.id, aid));
    if (!a) throw new JuniorError(404, "NOT_FOUND", "Not found");
    const { guardianLinksTable, childGymMembershipsTable, groupMembershipsTable } = await import("@workspace/db");
    const kids = await db
      .select({ childId: guardianLinksTable.childId })
      .from(guardianLinksTable)
      .innerJoin(childGymMembershipsTable, and(eq(childGymMembershipsTable.childId, guardianLinksTable.childId), eq(childGymMembershipsTable.status, "approved"), eq(childGymMembershipsTable.gymId, a.gymId)))
      .where(and(eq(guardianLinksTable.userId, uid), eq(guardianLinksTable.status, "active")));
    let ok = kids.length > 0;
    if (ok && a.groupId) {
      const gm = await db
        .select({ id: groupMembershipsTable.id })
        .from(groupMembershipsTable)
        .where(and(eq(groupMembershipsTable.groupId, a.groupId), isNull(groupMembershipsTable.effectiveTo), inArray(groupMembershipsTable.childId, kids.map((k) => k.childId))))
        .limit(1);
      ok = gm.length > 0;
    }
    if (!ok) throw new JuniorError(404, "NOT_FOUND", "Not found");
    await db.insert(announcementReadsTable).values({ announcementId: aid, userId: uid }).onConflictDoNothing();
    res.json({ ok: true });
  }),
);

export default router;
