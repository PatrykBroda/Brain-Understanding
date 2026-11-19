import { Router, type IRouter } from "express";
import { z } from "zod/v4";
import { and, asc, desc, eq, gte, inArray, isNull, lte, lt } from "drizzle-orm";
import {
  db,
  attendanceLogsTable,
  changeHistoryTable,
  childGymMembershipsTable,
  childrenTable,
  classGroupsTable,
  classOccurrencesTable,
  groupMembershipsTable,
  guardianLinksTable,
  gymsTable,
  milestoneRulesTable,
  milestoneStatesTable,
  observationsTable,
  usersTable,
  weeklyFocusVersionsTable,
  weeklyFocusesTable,
  wellbeingEntriesTable,
} from "@workspace/db";
import { h, JuniorError, nowOf, parse, userId, uuidParam } from "../../lib/junior/http";
import { recordHistory } from "../../lib/junior/history";
import { assertGuardian, assertGuardianWithGym, requireGymStaff } from "../../lib/junior/authz";
import { requireParentEntitlement, userHasParentEntitlement } from "../../lib/junior/entitlement";
import { ensureHorizon, weekStartOf } from "../../lib/junior/timetable";
import { activeSessionCount, recalcMilestones } from "../../lib/junior/milestones";
import { addDays, localDate, startOfLocalDay } from "../../lib/localTime";
import { focusFor } from "./gym";
import { guardianIdsOf, noticeFor, notifyUsers } from "../../lib/junior/notify";

const router: IRouter = Router();
const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");
const DAY = 86_400_000;

// ── Parent timetable (gym data: needs approved membership) ───────────────────
router.get(
  "/children/:childId/timetable",
  h(async (req, res) => {
    const childId = uuidParam(req, "childId");
    const uid = userId(req);
    const now = nowOf(req);
    const { membership } = await assertGuardianWithGym(uid, childId);
    if (!membership.groupId) { res.json({ occurrences: [], group: null }); return; }
    const q = parse(z.object({ from: ymd.optional(), to: ymd.optional() }), req.query);
    const [gym] = await db.select().from(gymsTable).where(eq(gymsTable.id, membership.gymId));
    await ensureHorizon(membership.gymId, now);
    const today = localDate(now, gym!.timezone);
    const from = q.from ?? addDays(today, -7);
    const to = q.to ?? addDays(today, 14);
    const occs = await db
      .select()
      .from(classOccurrencesTable)
      .where(and(eq(classOccurrencesTable.groupId, membership.groupId), gte(classOccurrencesTable.originalDate, from), lte(classOccurrencesTable.originalDate, to)))
      .orderBy(asc(classOccurrencesTable.startsAt));
    const logs = occs.length
      ? await db.select().from(attendanceLogsTable).where(and(eq(attendanceLogsTable.childId, childId), eq(attendanceLogsTable.status, "active"), inArray(attendanceLogsTable.occurrenceId, occs.map((o) => o.id))))
      : [];
    const logged = new Map(logs.map((l) => [l.occurrenceId, l.id]));
    const focus = await focusFor(db, membership.groupId, weekStartOf(today));
    res.json({
      group: membership.groupId,
      occurrences: occs.map((o) => ({
        ...o,
        loggedLogId: logged.get(o.id) ?? null,
        canLog: o.status === "scheduled" && o.startsAt.getTime() <= now.getTime() && o.startsAt.getTime() >= now.getTime() - gym!.loggingWindowDays * DAY,
      })),
      focus,
    });
  }),
);

// ── Logging a session (duplicate-safe) ───────────────────────────────────────
const logBody = z.object({ occurrenceId: z.string().uuid(), clientLogId: z.string().min(8).max(100) });

router.post(
  "/children/:childId/logs",
  h(async (req, res) => {
    const childId = uuidParam(req, "childId");
    const uid = userId(req);
    const now = nowOf(req);
    const b = parse(logBody, req.body);
    const { membership } = await assertGuardianWithGym(uid, childId);
    await requireParentEntitlement(childId, now);
    if (!membership.groupId) throw new JuniorError(422, "NO_GROUP", "The gym has not placed this child in a group yet");
    const out = await db.transaction(async (tx) => {
      const [o] = await tx.select().from(classOccurrencesTable).where(eq(classOccurrencesTable.id, b.occurrenceId));
      // A class of another gym or another group looks the same as a missing one.
      if (!o || o.gymId !== membership.gymId || o.groupId !== membership.groupId) throw new JuniorError(404, "NOT_FOUND", "Not found");
      const [gym] = await tx.select().from(gymsTable).where(eq(gymsTable.id, o.gymId));
      // Replay of the same request is always answered with the stored log, whatever the window says now.
      const [prior] = await tx.select().from(attendanceLogsTable).where(eq(attendanceLogsTable.clientLogId, b.clientLogId));
      if (prior) {
        if (prior.childId !== childId) throw new JuniorError(409, "CLIENT_LOG_ID_CONFLICT", "That id is already used");
        return { log: prior, duplicate: true, milestones: { reached: [] as string[], withdrawn: [] as string[], count: await activeSessionCount(tx, childId) } };
      }
      if (o.status !== "scheduled") throw new JuniorError(422, "CLASS_CANCELLED", "This class was cancelled");
      if (o.startsAt.getTime() > now.getTime()) throw new JuniorError(422, "CLASS_NOT_STARTED", "You can log a class once it has started");
      if (o.startsAt.getTime() < now.getTime() - gym!.loggingWindowDays * DAY) {
        throw new JuniorError(422, "OUTSIDE_WINDOW", `Logs can be added for ${gym!.loggingWindowDays} days after a class`);
      }
      // Focus that was current when the class started (else the earliest version we have).
      const [wf] = await tx
        .select({ id: weeklyFocusesTable.id })
        .from(weeklyFocusesTable)
        .where(and(eq(weeklyFocusesTable.groupId, o.groupId), eq(weeklyFocusesTable.weekStart, weekStartOf(o.originalDate))));
      let focusVersionId: string | null = null;
      if (wf) {
        const vs = await tx.select().from(weeklyFocusVersionsTable).where(eq(weeklyFocusVersionsTable.weeklyFocusId, wf.id)).orderBy(asc(weeklyFocusVersionsTable.version));
        const atStart = [...vs].reverse().find((v) => v.createdAt.getTime() <= o.startsAt.getTime());
        focusVersionId = (atStart ?? vs[0])?.id ?? null;
      }
      const inserted = await tx
        .insert(attendanceLogsTable)
        .values({
          childId,
          occurrenceId: o.id,
          clientLogId: b.clientLogId,
          source: "parent",
          loggedBy: uid,
          loggedAt: now,
          occurrenceSnapshot: { title: o.title, startsAt: o.startsAt, endsAt: o.endsAt, groupId: o.groupId, gymId: o.gymId },
          focusVersionId,
        })
        .onConflictDoNothing()
        .returning();
      if (!inserted[0]) {
        // Lost a race (second guardian, double tap, retry): the surviving row is the answer.
        const [existing] = await tx
          .select()
          .from(attendanceLogsTable)
          .where(and(eq(attendanceLogsTable.childId, childId), eq(attendanceLogsTable.occurrenceId, o.id), eq(attendanceLogsTable.status, "active")));
        const [byId] = existing ? [existing] : await tx.select().from(attendanceLogsTable).where(eq(attendanceLogsTable.clientLogId, b.clientLogId));
        if (!byId) throw new JuniorError(409, "CONFLICT", "Please retry");
        return { log: byId, duplicate: true, milestones: { reached: [] as string[], withdrawn: [] as string[], count: await activeSessionCount(tx, childId) } };
      }
      const log = inserted[0];
      await recordHistory(tx, { gymId: o.gymId, childId, actorUserId: uid, actorRole: "parent", entity: "attendance_log", entityId: log.id, action: "created", after: { occurrenceId: o.id } });
      const milestones = await recalcMilestones(tx, childId, o.gymId, { userId: uid, role: "parent" }, now);
      return { log, duplicate: false, milestones };
    });
    res.status(out.duplicate ? 200 : 201).json(out);
  }),
);

router.get(
  "/children/:childId/logs",
  h(async (req, res) => {
    const childId = uuidParam(req, "childId");
    await assertGuardian(userId(req), childId);
    const rows = await db.select().from(attendanceLogsTable).where(and(eq(attendanceLogsTable.childId, childId), eq(attendanceLogsTable.status, "active"))).orderBy(desc(attendanceLogsTable.loggedAt)).limit(200);
    res.json({ logs: rows });
  }),
);

/** A guardian can always undo, even if the plan lapsed: taking data back is never paywalled. */
router.post(
  "/children/:childId/logs/:logId/undo",
  h(async (req, res) => {
    const childId = uuidParam(req, "childId");
    const logId = uuidParam(req, "logId");
    const uid = userId(req);
    const now = nowOf(req);
    await assertGuardian(uid, childId);
    const out = await db.transaction(async (tx) => {
      const [log] = await tx.select().from(attendanceLogsTable).where(and(eq(attendanceLogsTable.id, logId), eq(attendanceLogsTable.childId, childId))).for("update");
      if (!log) throw new JuniorError(404, "NOT_FOUND", "Not found");
      if (log.status !== "active") return { alreadyUndone: true, milestones: null };
      await tx.update(attendanceLogsTable).set({ status: "undone", undoneBy: uid, undoneAt: now }).where(eq(attendanceLogsTable.id, logId));
      const snap = log.occurrenceSnapshot as { gymId?: string };
      const gymId = snap.gymId ?? "";
      await recordHistory(tx, { gymId: gymId || null, childId, actorUserId: uid, actorRole: "parent", entity: "attendance_log", entityId: logId, action: "undone" });
      const milestones = gymId ? await recalcMilestones(tx, childId, gymId, { userId: uid, role: "parent" }, now) : null;
      return { alreadyUndone: false, milestones };
    });
    res.json({ ok: true, ...out });
  }),
);

router.post(
  "/gyms/:gymId/logs/:logId/remove",
  h(async (req, res) => {
    const gymId = uuidParam(req, "gymId");
    const logId = uuidParam(req, "logId");
    const uid = userId(req);
    const now = nowOf(req);
    const staff = await requireGymStaff(uid, gymId, "coach");
    const { reason } = parse(z.object({ reason: z.string().trim().min(3).max(300) }), req.body);
    await db.transaction(async (tx) => {
      const [row] = await tx
        .select({ log: attendanceLogsTable })
        .from(attendanceLogsTable)
        .innerJoin(classOccurrencesTable, eq(classOccurrencesTable.id, attendanceLogsTable.occurrenceId))
        .where(and(eq(attendanceLogsTable.id, logId), eq(classOccurrencesTable.gymId, gymId)))
        .for("update", { of: attendanceLogsTable });
      if (!row || row.log.status !== "active") throw new JuniorError(404, "NOT_FOUND", "Not found");
      await tx.update(attendanceLogsTable).set({ status: "removed", removedBy: uid, removedAt: now, removedReason: reason }).where(eq(attendanceLogsTable.id, logId));
      const role = staff.role === "admin" ? ("admin" as const) : ("coach" as const);
      await recordHistory(tx, { gymId, childId: row.log.childId, actorUserId: uid, actorRole: role, entity: "attendance_log", entityId: logId, action: "removed", reason });
      await recalcMilestones(tx, row.log.childId, gymId, { userId: uid, role }, now);
    });
    res.json({ ok: true });
  }),
);

// ── Wellbeing (parent-only; never shown to the gym in the pilot) ─────────────
const scale = z.number().int().min(1).max(3).nullable().optional();
router.put(
  "/children/:childId/wellbeing",
  h(async (req, res) => {
    const childId = uuidParam(req, "childId");
    const uid = userId(req);
    const now = nowOf(req);
    await assertGuardian(uid, childId);
    await requireParentEntitlement(childId, now);
    const b = parse(z.object({ localDate: ymd.optional(), mood: scale, energy: scale, sleep: scale, note: z.string().trim().max(500).default("") }), req.body);
    const date = b.localDate ?? localDate(now, "Asia/Bangkok");
    if (date > addDays(localDate(now, "Asia/Bangkok"), 1)) throw new JuniorError(422, "FUTURE_DATE", "Cannot record the future");
    await db
      .insert(wellbeingEntriesTable)
      .values({ childId, localDate: date, mood: b.mood ?? null, energy: b.energy ?? null, sleep: b.sleep ?? null, note: b.note, createdBy: uid, updatedAt: now })
      .onConflictDoUpdate({ target: [wellbeingEntriesTable.childId, wellbeingEntriesTable.localDate], set: { mood: b.mood ?? null, energy: b.energy ?? null, sleep: b.sleep ?? null, note: b.note, updatedAt: now } });
    res.json({ ok: true, localDate: date });
  }),
);

router.get(
  "/children/:childId/wellbeing",
  h(async (req, res) => {
    const childId = uuidParam(req, "childId");
    await assertGuardian(userId(req), childId);
    res.json({ entries: await db.select().from(wellbeingEntriesTable).where(eq(wellbeingEntriesTable.childId, childId)).orderBy(desc(wellbeingEntriesTable.localDate)).limit(60) });
  }),
);

// ── Observations (coach -> shared with the family, or private to staff) ──────
const obsBody = z.object({ visibility: z.enum(["shared", "private"]), body: z.string().trim().min(1).max(1500), categoryId: z.string().uuid().optional(), occurrenceId: z.string().uuid().optional() });

export async function staffChildGym(uid: string, gymId: string, childId: string) {
  const staff = await requireGymStaff(uid, gymId, "coach");
  const [m] = await db
    .select({ id: childGymMembershipsTable.id })
    .from(childGymMembershipsTable)
    .where(and(eq(childGymMembershipsTable.gymId, gymId), eq(childGymMembershipsTable.childId, childId), eq(childGymMembershipsTable.status, "approved")));
  if (!m) throw new JuniorError(404, "NOT_FOUND", "Not found");
  return staff;
}

router.post(
  "/gyms/:gymId/children/:childId/observations",
  h(async (req, res) => {
    const gymId = uuidParam(req, "gymId");
    const childId = uuidParam(req, "childId");
    const uid = userId(req);
    const staff = await staffChildGym(uid, gymId, childId);
    const b = parse(obsBody, req.body);
    const o = await db.transaction(async (tx) => {
      const [row] = await tx.insert(observationsTable).values({ childId, gymId, authorId: uid, visibility: b.visibility, body: b.body, categoryId: b.categoryId ?? null, occurrenceId: b.occurrenceId ?? null }).returning();
      await recordHistory(tx, { gymId, childId, actorUserId: uid, actorRole: staff.role === "admin" ? "admin" : "coach", entity: "observation", entityId: row!.id, action: "created", after: { visibility: b.visibility } });
      return row!;
    });
    if (b.visibility === "shared") void guardianIdsOf([childId]).then((ids) => notifyUsers(ids, noticeFor("observations", `obs:${o.id}`), nowOf(req)));
    res.status(201).json({ observation: o });
  }),
);

router.post(
  "/gyms/:gymId/observations/:obsId/withdraw",
  h(async (req, res) => {
    const gymId = uuidParam(req, "gymId");
    const obsId = uuidParam(req, "obsId");
    const uid = userId(req);
    const staff = await requireGymStaff(uid, gymId, "coach");
    await db.transaction(async (tx) => {
      const [o] = await tx.select().from(observationsTable).where(and(eq(observationsTable.id, obsId), eq(observationsTable.gymId, gymId))).for("update");
      if (!o || o.status !== "active") throw new JuniorError(404, "NOT_FOUND", "Not found");
      if (o.authorId !== uid && staff.role !== "admin") throw new JuniorError(403, "NOT_AUTHOR", "Only the author or a gym admin can withdraw this");
      await tx.update(observationsTable).set({ status: "withdrawn" }).where(eq(observationsTable.id, obsId));
      await recordHistory(tx, { gymId, childId: o.childId, actorUserId: uid, actorRole: staff.role === "admin" ? "admin" : "coach", entity: "observation", entityId: obsId, action: "withdrawn" });
    });
    res.json({ ok: true });
  }),
);

/** Parent view: shared + active ONLY. The privacy filter is in the SQL, not in the response mapper. */
router.get(
  "/children/:childId/observations",
  h(async (req, res) => {
    const childId = uuidParam(req, "childId");
    await assertGuardianWithGym(userId(req), childId);
    const rows = await db
      .select({ id: observationsTable.id, body: observationsTable.body, categoryId: observationsTable.categoryId, occurrenceId: observationsTable.occurrenceId, createdAt: observationsTable.createdAt })
      .from(observationsTable)
      .where(and(eq(observationsTable.childId, childId), eq(observationsTable.visibility, "shared"), eq(observationsTable.status, "active")))
      .orderBy(desc(observationsTable.createdAt))
      .limit(100);
    res.json({ observations: rows });
  }),
);

// ── Journey (parent) ─────────────────────────────────────────────────────────
router.get(
  "/children/:childId/journey",
  h(async (req, res) => {
    const childId = uuidParam(req, "childId");
    const uid = userId(req);
    const now = nowOf(req);
    await assertGuardian(uid, childId);
    const [child] = await db.select().from(childrenTable).where(eq(childrenTable.id, childId));
    const logs = await db
      .select({ id: attendanceLogsTable.id, loggedAt: attendanceLogsTable.loggedAt, snapshot: attendanceLogsTable.occurrenceSnapshot, focusVersionId: attendanceLogsTable.focusVersionId })
      .from(attendanceLogsTable)
      .where(and(eq(attendanceLogsTable.childId, childId), eq(attendanceLogsTable.status, "active")))
      .orderBy(desc(attendanceLogsTable.loggedAt))
      .limit(200);
    const focusIds = [...new Set(logs.map((l) => l.focusVersionId).filter((x): x is string => !!x))];
    const focus = focusIds.length ? await db.select().from(weeklyFocusVersionsTable).where(inArray(weeklyFocusVersionsTable.id, focusIds)) : [];
    const fMap = new Map(focus.map((f) => [f.id, f]));
    // Shared coach notes appear only while the gym membership is approved (gym-sourced data).
    const membershipOk = (await db.select({ id: childGymMembershipsTable.id }).from(childGymMembershipsTable).where(and(eq(childGymMembershipsTable.childId, childId), eq(childGymMembershipsTable.status, "approved")))).length > 0;
    const observations = membershipOk
      ? await db
          .select({ id: observationsTable.id, body: observationsTable.body, createdAt: observationsTable.createdAt })
          .from(observationsTable)
          .where(and(eq(observationsTable.childId, childId), eq(observationsTable.visibility, "shared"), eq(observationsTable.status, "active")))
          .orderBy(desc(observationsTable.createdAt))
          .limit(100)
      : [];
    const milestones = await db
      .select({ label: milestoneRulesTable.label, threshold: milestoneRulesTable.threshold, status: milestoneStatesTable.status, reachedAt: milestoneStatesTable.reachedAt })
      .from(milestoneStatesTable)
      .innerJoin(milestoneRulesTable, eq(milestoneRulesTable.id, milestoneStatesTable.ruleId))
      .where(and(eq(milestoneStatesTable.childId, childId), eq(milestoneStatesTable.status, "reached")))
      .orderBy(asc(milestoneRulesTable.threshold));
    res.json({
      child: { id: child!.id, displayName: child!.displayName },
      sessionCount: logs.length,
      milestones,
      sessions: logs.map((l) => ({ id: l.id, loggedAt: l.loggedAt, class: l.snapshot, focus: l.focusVersionId ? { title: fMap.get(l.focusVersionId)?.title ?? null, practiceDetails: fMap.get(l.focusVersionId)?.practiceDetails ?? null } : null })),
      observations,
      canAddRecords: await userHasParentEntitlement(uid, now),
    });
  }),
);

// ── Parent home ──────────────────────────────────────────────────────────────
router.get(
  "/parent/home",
  h(async (req, res) => {
    const uid = userId(req);
    const now = nowOf(req);
    const kids = await db
      .select({ id: childrenTable.id, displayName: childrenTable.displayName })
      .from(guardianLinksTable)
      .innerJoin(childrenTable, eq(childrenTable.id, guardianLinksTable.childId))
      .where(and(eq(guardianLinksTable.userId, uid), eq(guardianLinksTable.status, "active"), eq(childrenTable.status, "active")));
    const out = [];
    for (const k of kids) {
      const [m] = await db
        .select({ status: childGymMembershipsTable.status, gymId: childGymMembershipsTable.gymId })
        .from(childGymMembershipsTable)
        .where(and(eq(childGymMembershipsTable.childId, k.id), inArray(childGymMembershipsTable.status, ["pending", "approved"])))
        .limit(1);
      let next = null;
      let needsLog = null;
      if (m?.status === "approved") {
        const [gm] = await db.select({ groupId: groupMembershipsTable.groupId }).from(groupMembershipsTable).where(and(eq(groupMembershipsTable.childId, k.id), isNull(groupMembershipsTable.effectiveTo)));
        if (gm) {
          await ensureHorizon(m.gymId, now, 7);
          [next] = await db.select().from(classOccurrencesTable).where(and(eq(classOccurrencesTable.groupId, gm.groupId), eq(classOccurrencesTable.status, "scheduled"), gte(classOccurrencesTable.startsAt, now))).orderBy(asc(classOccurrencesTable.startsAt)).limit(1);
          const recent = await db
            .select()
            .from(classOccurrencesTable)
            .where(and(eq(classOccurrencesTable.groupId, gm.groupId), eq(classOccurrencesTable.status, "scheduled"), lt(classOccurrencesTable.startsAt, now), gte(classOccurrencesTable.startsAt, new Date(now.getTime() - 3 * DAY))))
            .orderBy(desc(classOccurrencesTable.startsAt));
          const logged = recent.length ? await db.select({ o: attendanceLogsTable.occurrenceId }).from(attendanceLogsTable).where(and(eq(attendanceLogsTable.childId, k.id), eq(attendanceLogsTable.status, "active"), inArray(attendanceLogsTable.occurrenceId, recent.map((r) => r.id)))) : [];
          const set = new Set(logged.map((l) => l.o));
          needsLog = recent.find((r) => !set.has(r.id)) ?? null;
        }
      }
      out.push({ ...k, membershipStatus: m?.status ?? null, sessionCount: await activeSessionCount(db, k.id), nextClass: next ?? null, needsLog });
    }
    res.json({ children: out, canAddRecords: await userHasParentEntitlement(uid, now) });
  }),
);

// ── Coach views ──────────────────────────────────────────────────────────────
router.get(
  "/gyms/:gymId/today",
  h(async (req, res) => {
    const gymId = uuidParam(req, "gymId");
    const now = nowOf(req);
    await requireGymStaff(userId(req), gymId, "coach");
    const [gym] = await db.select().from(gymsTable).where(eq(gymsTable.id, gymId));
    await ensureHorizon(gymId, now);
    const today = localDate(now, gym!.timezone);
    const start = startOfLocalDay(today, gym!.timezone);
    const occs = await db
      .select({ o: classOccurrencesTable, group: classGroupsTable.name })
      .from(classOccurrencesTable)
      .innerJoin(classGroupsTable, eq(classGroupsTable.id, classOccurrencesTable.groupId))
      .where(and(eq(classOccurrencesTable.gymId, gymId), gte(classOccurrencesTable.startsAt, start), lt(classOccurrencesTable.startsAt, new Date(start.getTime() + DAY))))
      .orderBy(asc(classOccurrencesTable.startsAt));
    const pending = await db.select({ id: childGymMembershipsTable.id }).from(childGymMembershipsTable).where(and(eq(childGymMembershipsTable.gymId, gymId), eq(childGymMembershipsTable.status, "pending")));
    res.json({ date: today, classes: occs.map((r) => ({ ...r.o, groupName: r.group })), pendingRequests: pending.length });
  }),
);

router.get(
  "/gyms/:gymId/occurrences/:occId/roster",
  h(async (req, res) => {
    const gymId = uuidParam(req, "gymId");
    const occId = uuidParam(req, "occId");
    await requireGymStaff(userId(req), gymId, "coach");
    const [o] = await db.select().from(classOccurrencesTable).where(and(eq(classOccurrencesTable.id, occId), eq(classOccurrencesTable.gymId, gymId)));
    if (!o) throw new JuniorError(404, "NOT_FOUND", "Not found");
    const kids = await db
      .select({ id: childrenTable.id, displayName: childrenTable.displayName, birthYearMonth: childrenTable.birthYearMonth })
      .from(groupMembershipsTable)
      .innerJoin(childrenTable, eq(childrenTable.id, groupMembershipsTable.childId))
      .innerJoin(childGymMembershipsTable, and(eq(childGymMembershipsTable.childId, childrenTable.id), eq(childGymMembershipsTable.gymId, gymId), eq(childGymMembershipsTable.status, "approved")))
      .where(and(eq(groupMembershipsTable.groupId, o.groupId), isNull(groupMembershipsTable.effectiveTo), eq(childrenTable.status, "active")));
    const logs = await db.select({ childId: attendanceLogsTable.childId }).from(attendanceLogsTable).where(and(eq(attendanceLogsTable.occurrenceId, occId), eq(attendanceLogsTable.status, "active")));
    const logged = new Set(logs.map((l) => l.childId));
    res.json({ occurrence: o, children: kids.map((k) => ({ ...k, parentLogged: logged.has(k.id) })) });
  }),
);

router.get(
  "/gyms/:gymId/children",
  h(async (req, res) => {
    const gymId = uuidParam(req, "gymId");
    await requireGymStaff(userId(req), gymId, "coach");
    const rows = await db
      .select({ id: childrenTable.id, displayName: childrenTable.displayName, birthYearMonth: childrenTable.birthYearMonth, groupId: groupMembershipsTable.groupId })
      .from(childGymMembershipsTable)
      .innerJoin(childrenTable, eq(childrenTable.id, childGymMembershipsTable.childId))
      .leftJoin(groupMembershipsTable, and(eq(groupMembershipsTable.childId, childrenTable.id), isNull(groupMembershipsTable.effectiveTo)))
      .where(and(eq(childGymMembershipsTable.gymId, gymId), eq(childGymMembershipsTable.status, "approved"), eq(childrenTable.status, "active")))
      .orderBy(asc(childrenTable.displayName));
    res.json({ children: rows });
  }),
);

/** Coach child profile: name, group, count, coach notes (shared + private), milestones. No wellbeing, no guardian contact details. */
router.get(
  "/gyms/:gymId/children/:childId",
  h(async (req, res) => {
    const gymId = uuidParam(req, "gymId");
    const childId = uuidParam(req, "childId");
    await staffChildGym(userId(req), gymId, childId);
    const [child] = await db.select({ id: childrenTable.id, displayName: childrenTable.displayName, birthYearMonth: childrenTable.birthYearMonth }).from(childrenTable).where(eq(childrenTable.id, childId));
    const notes = await db
      .select({ id: observationsTable.id, body: observationsTable.body, visibility: observationsTable.visibility, authorId: observationsTable.authorId, createdAt: observationsTable.createdAt })
      .from(observationsTable)
      .where(and(eq(observationsTable.childId, childId), eq(observationsTable.gymId, gymId), eq(observationsTable.status, "active")))
      .orderBy(desc(observationsTable.createdAt))
      .limit(100);
    const milestones = await db
      .select({ label: milestoneRulesTable.label, reachedAt: milestoneStatesTable.reachedAt })
      .from(milestoneStatesTable)
      .innerJoin(milestoneRulesTable, eq(milestoneRulesTable.id, milestoneStatesTable.ruleId))
      .where(and(eq(milestoneStatesTable.childId, childId), eq(milestoneStatesTable.status, "reached"), eq(milestoneRulesTable.gymId, gymId)));
    res.json({ child, sessionCount: await activeSessionCount(db, childId), observations: notes, milestones });
  }),
);

router.get(
  "/gyms/:gymId/history",
  h(async (req, res) => {
    const gymId = uuidParam(req, "gymId");
    await requireGymStaff(userId(req), gymId, "admin");
    const rows = await db.select().from(changeHistoryTable).where(eq(changeHistoryTable.gymId, gymId)).orderBy(desc(changeHistoryTable.id)).limit(200);
    const ids = [...new Set(rows.map((r) => r.actorUserId).filter((x): x is string => !!x))];
    const users = ids.length ? await db.select({ id: usersTable.id, name: usersTable.displayName }).from(usersTable).where(inArray(usersTable.id, ids)) : [];
    const names = new Map(users.map((u) => [u.id, u.name]));
    res.json({ history: rows.map((r) => ({ ...r, actorName: r.actorUserId ? names.get(r.actorUserId) ?? null : null })) });
  }),
);

export default router;
