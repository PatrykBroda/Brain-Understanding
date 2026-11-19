import { Router, type IRouter } from "express";
import { z } from "zod/v4";
import { and, desc, eq, inArray, isNull, lt, gte, or, sql } from "drizzle-orm";
import {
  db,
  announcementsTable,
  attendanceLogsTable,
  changeHistoryTable,
  childGymMembershipsTable,
  childPrivacySettingsTable,
  childrenTable,
  classGroupsTable,
  focusCategoriesTable,
  groupMembershipsTable,
  guardianInvitesTable,
  gymStaffTable,
  gymsTable,
  individualFocusesTable,
  juniorNotificationPrefsTable,
  milestoneRulesTable,
  milestoneStatesTable,
  observationsTable,
  staffInvitesTable,
  starAwardsTable,
  usersTable,
  userRolesTable,
  weeklyFocusVersionsTable,
  weeklyFocusesTable,
  guardianLinksTable,
} from "@workspace/db";
import { h, JuniorError, nowOf, parse, userId, uuidParam } from "../../lib/junior/http";
import { recordHistory } from "../../lib/junior/history";
import { assertGuardian, assertGuardianWithGym, getApprovedMembership } from "../../lib/junior/authz";
import { parentCanSee, toParentItem, type HistoryRow } from "../../lib/junior/historyView";
import { weekStartOf } from "../../lib/junior/timetable";
import { activeSessionCount } from "../../lib/junior/milestones";
import { localDate } from "../../lib/localTime";
import { normEmail } from "./identity";

const router: IRouter = Router();

// -- Empty states: one function so every screen explains "why is this empty" the same way ------------
async function emptyStateFor(childId: string): Promise<{ code: string; message: string }> {
  const [m] = await db
    .select({ status: childGymMembershipsTable.status })
    .from(childGymMembershipsTable)
    .where(and(eq(childGymMembershipsTable.childId, childId), inArray(childGymMembershipsTable.status, ["pending", "approved"])))
    .limit(1);
  if (!m) return { code: "NO_GYM", message: "Request to join your gym to see classes here. You can still keep this profile." };
  if (m.status === "pending") return { code: "AWAITING_APPROVAL", message: "Your gym has not approved this child yet. You will see classes once they do." };
  const [g] = await db
    .select({ id: groupMembershipsTable.id })
    .from(groupMembershipsTable)
    .where(and(eq(groupMembershipsTable.childId, childId), isNull(groupMembershipsTable.effectiveTo)))
    .limit(1);
  if (!g) return { code: "NO_GROUP", message: "Waiting for the gym to place your child in a class group." };
  return { code: "NO_SESSIONS", message: "No sessions logged yet. After a class, tap Log on Home and it will appear here." };
}

// -- Timeline: one chronological feed of the child's journey ----------------------------------------
export interface TimelineItem {
  type: "session" | "observation" | "milestone" | "star" | "gym_change" | "membership";
  at: Date;
  title: string;
  detail?: string | null;
  refId?: string;
}

router.get(
  "/children/:childId/timeline",
  h(async (req, res) => {
    const childId = uuidParam(req, "childId");
    const uid = userId(req);
    const q = parse(z.object({ before: z.coerce.date().optional(), limit: z.coerce.number().int().min(1).max(100).default(30) }), req.query);
    await assertGuardian(uid, childId);
    const before = q.before ?? new Date(nowOf(req).getTime() + 86_400_000);
    const membership = await getApprovedMembership(childId);
    const items: TimelineItem[] = [];

    const logs = await db
      .select({ id: attendanceLogsTable.id, at: attendanceLogsTable.loggedAt, snap: attendanceLogsTable.occurrenceSnapshot, focusVersionId: attendanceLogsTable.focusVersionId })
      .from(attendanceLogsTable)
      .where(and(eq(attendanceLogsTable.childId, childId), eq(attendanceLogsTable.status, "active"), lt(attendanceLogsTable.loggedAt, before)))
      .orderBy(desc(attendanceLogsTable.loggedAt))
      .limit(q.limit + 1);
    const fIds = logs.map((l) => l.focusVersionId).filter((x): x is string => !!x);
    const fv = fIds.length ? await db.select({ id: weeklyFocusVersionsTable.id, title: weeklyFocusVersionsTable.title }).from(weeklyFocusVersionsTable).where(inArray(weeklyFocusVersionsTable.id, fIds)) : [];
    const fMap = new Map(fv.map((f) => [f.id, f.title]));
    for (const l of logs) {
      const snap = l.snap as { title?: string };
      items.push({ type: "session", at: l.at, title: snap.title ?? "Class", detail: l.focusVersionId ? `Focus: ${fMap.get(l.focusVersionId) ?? ""}` : null, refId: l.id });
    }

    const ms = await db
      .select({ label: milestoneRulesTable.label, at: milestoneStatesTable.reachedAt, ruleId: milestoneRulesTable.id })
      .from(milestoneStatesTable)
      .innerJoin(milestoneRulesTable, eq(milestoneRulesTable.id, milestoneStatesTable.ruleId))
      .where(and(eq(milestoneStatesTable.childId, childId), eq(milestoneStatesTable.status, "reached"), lt(milestoneStatesTable.reachedAt, before)))
      .orderBy(desc(milestoneStatesTable.reachedAt))
      .limit(q.limit + 1);
    for (const m of ms) items.push({ type: "milestone", at: m.at, title: m.label, refId: m.ruleId });

    if (membership) {
      const obs = await db
        .select({ id: observationsTable.id, body: observationsTable.body, at: observationsTable.createdAt })
        .from(observationsTable)
        .where(and(eq(observationsTable.childId, childId), eq(observationsTable.visibility, "shared"), eq(observationsTable.status, "active"), lt(observationsTable.createdAt, before)))
        .orderBy(desc(observationsTable.createdAt))
        .limit(q.limit + 1);
      for (const o of obs) items.push({ type: "observation", at: o.at, title: "Note from the gym", detail: o.body, refId: o.id });

      const stars = await db
        .select({ id: starAwardsTable.id, at: starAwardsTable.createdAt, note: starAwardsTable.note, week: starAwardsTable.weekStart })
        .from(starAwardsTable)
        .where(and(eq(starAwardsTable.childId, childId), eq(starAwardsTable.status, "active"), lt(starAwardsTable.createdAt, before)))
        .orderBy(desc(starAwardsTable.createdAt))
        .limit(q.limit + 1);
      for (const s of stars) items.push({ type: "star", at: s.at, title: "Star of the Week", detail: s.note || `Week of ${s.week}`, refId: s.id });

      // "Class details changed by gym": timetable announcements for the child's group, so a logged class
      // that moved or was cancelled is explained on the journey rather than silently different.
      const ann = await db
        .select({ id: announcementsTable.id, at: announcementsTable.createdAt, title: announcementsTable.title, body: announcementsTable.body })
        .from(announcementsTable)
        .where(
          and(
            eq(announcementsTable.gymId, membership.gymId),
            eq(announcementsTable.kind, "timetable"),
            lt(announcementsTable.createdAt, before),
            membership.groupId ? or(isNull(announcementsTable.groupId), eq(announcementsTable.groupId, membership.groupId)) : isNull(announcementsTable.groupId),
          ),
        )
        .orderBy(desc(announcementsTable.createdAt))
        .limit(q.limit + 1);
      for (const a of ann) items.push({ type: "gym_change", at: a.at, title: a.title, detail: a.body, refId: a.id });
    }

    const hist = await db
      .select()
      .from(changeHistoryTable)
      .where(and(eq(changeHistoryTable.childId, childId), eq(changeHistoryTable.entity, "membership"), inArray(changeHistoryTable.action, ["approved", "rejected", "ended"]), lt(changeHistoryTable.createdAt, before)))
      .orderBy(desc(changeHistoryTable.createdAt))
      .limit(q.limit + 1);
    for (const r of hist) items.push({ type: "membership", at: r.createdAt, title: r.action === "approved" ? "Gym membership approved" : r.action === "rejected" ? "Gym membership not approved" : "Gym membership ended" });

    items.sort((a, b) => b.at.getTime() - a.at.getTime());
    const page = items.slice(0, q.limit);
    const hasMore = items.length > q.limit;
    res.json({
      items: page,
      nextBefore: hasMore ? page[page.length - 1]!.at.toISOString() : null,
      emptyState: page.length === 0 ? await emptyStateFor(childId) : null,
    });
  }),
);

async function currentFocusFor(groupId: string, weekStart: string): Promise<{ title: string; practiceDetails: string } | null> {
  const [wf] = await db.select({ id: weeklyFocusesTable.id }).from(weeklyFocusesTable).where(and(eq(weeklyFocusesTable.groupId, groupId), eq(weeklyFocusesTable.weekStart, weekStart)));
  if (!wf) return null;
  const [v] = await db.select().from(weeklyFocusVersionsTable).where(eq(weeklyFocusVersionsTable.weeklyFocusId, wf.id)).orderBy(desc(weeklyFocusVersionsTable.version)).limit(1);
  return v ? { title: v.title, practiceDetails: v.practiceDetails } : null;
}

// -- Passport: where the child is now, what they have practised, recognition -------------------------
router.get(
  "/children/:childId/passport",
  h(async (req, res) => {
    const childId = uuidParam(req, "childId");
    const uid = userId(req);
    const now = nowOf(req);
    await assertGuardian(uid, childId);
    const [child] = await db.select({ id: childrenTable.id, displayName: childrenTable.displayName }).from(childrenTable).where(eq(childrenTable.id, childId));
    const membership = await getApprovedMembership(childId);
    if (!membership) {
      res.json({ child, sessionCount: await activeSessionCount(db, childId), currentFocus: null, individualFocus: null, areasPracticed: [], observations: [], milestones: [], recognition: [], emptyState: await emptyStateFor(childId) });
      return;
    }
    const [gym] = await db.select({ tz: gymsTable.timezone }).from(gymsTable).where(eq(gymsTable.id, membership.gymId));
    const week = weekStartOf(localDate(now, gym!.tz));
    const currentFocus = membership.groupId ? await currentFocusFor(membership.groupId, week) : null;
    const [indiv] = await db
      .select({ title: individualFocusesTable.title, details: individualFocusesTable.details })
      .from(individualFocusesTable)
      .where(and(eq(individualFocusesTable.childId, childId), eq(individualFocusesTable.status, "active")))
      .orderBy(desc(individualFocusesTable.createdAt))
      .limit(1);
    // Areas practised = focus categories of the classes actually logged (parent-logged, still active).
    const areas = await db
      .select({ name: focusCategoriesTable.name, sessions: sql<number>`count(*)::int` })
      .from(attendanceLogsTable)
      .innerJoin(weeklyFocusVersionsTable, eq(weeklyFocusVersionsTable.id, attendanceLogsTable.focusVersionId))
      .innerJoin(focusCategoriesTable, eq(focusCategoriesTable.id, weeklyFocusVersionsTable.categoryId))
      .where(and(eq(attendanceLogsTable.childId, childId), eq(attendanceLogsTable.status, "active")))
      .groupBy(focusCategoriesTable.name)
      .orderBy(desc(sql`count(*)`));
    const observations = await db
      .select({ id: observationsTable.id, body: observationsTable.body, createdAt: observationsTable.createdAt })
      .from(observationsTable)
      .where(and(eq(observationsTable.childId, childId), eq(observationsTable.visibility, "shared"), eq(observationsTable.status, "active")))
      .orderBy(desc(observationsTable.createdAt))
      .limit(50);
    const milestones = await db
      .select({ label: milestoneRulesTable.label, reachedAt: milestoneStatesTable.reachedAt })
      .from(milestoneStatesTable)
      .innerJoin(milestoneRulesTable, eq(milestoneRulesTable.id, milestoneStatesTable.ruleId))
      .where(and(eq(milestoneStatesTable.childId, childId), eq(milestoneStatesTable.status, "reached")))
      .orderBy(milestoneRulesTable.threshold);
    const recognition = await db
      .select({ id: starAwardsTable.id, weekStart: starAwardsTable.weekStart, note: starAwardsTable.note })
      .from(starAwardsTable)
      .where(and(eq(starAwardsTable.childId, childId), eq(starAwardsTable.status, "active")))
      .orderBy(desc(starAwardsTable.weekStart));
    res.json({ child, sessionCount: await activeSessionCount(db, childId), currentFocus, individualFocus: indiv ?? null, areasPracticed: areas, observations, milestones, recognition, emptyState: null });
  }),
);

// -- Team card: group, focus, recognition the family may see -----------------------------------------
router.get(
  "/children/:childId/team",
  h(async (req, res) => {
    const childId = uuidParam(req, "childId");
    const uid = userId(req);
    const now = nowOf(req);
    const { membership } = await assertGuardianWithGym(uid, childId);
    const [gym] = await db.select().from(gymsTable).where(eq(gymsTable.id, membership.gymId));
    if (!membership.groupId) {
      res.json({ gym: { id: gym!.id, name: gym!.name }, group: null, focus: null, recognition: { mine: [], team: [] }, emptyState: { code: "NO_GROUP", message: "Waiting for the gym to place your child in a class group." } });
      return;
    }
    const [grp] = await db.select({ id: classGroupsTable.id, name: classGroupsTable.name, ageBand: classGroupsTable.ageBand }).from(classGroupsTable).where(eq(classGroupsTable.id, membership.groupId));
    const week = weekStartOf(localDate(now, gym!.timezone));
    const focus = await currentFocusFor(membership.groupId, week);
    const mine = await db
      .select({ id: starAwardsTable.id, weekStart: starAwardsTable.weekStart, note: starAwardsTable.note })
      .from(starAwardsTable)
      .where(and(eq(starAwardsTable.childId, childId), eq(starAwardsTable.status, "active")))
      .orderBy(desc(starAwardsTable.weekStart))
      .limit(5);
    // Team-wide recognition shows only if the GYM allows it AND that child's own family allows it.
    let others: { id: string; weekStart: string; childName: string }[] = [];
    if (gym!.showRecognitionToTeam) {
      others = await db
        .select({ id: starAwardsTable.id, weekStart: starAwardsTable.weekStart, childName: childrenTable.displayName })
        .from(starAwardsTable)
        .innerJoin(childrenTable, eq(childrenTable.id, starAwardsTable.childId))
        .leftJoin(childPrivacySettingsTable, eq(childPrivacySettingsTable.childId, starAwardsTable.childId))
        .where(
          and(
            eq(starAwardsTable.groupId, membership.groupId),
            eq(starAwardsTable.status, "active"),
            sql`${starAwardsTable.childId} <> ${childId}`,
            gte(starAwardsTable.weekStart, weekStartOf(localDate(new Date(now.getTime() - 28 * 86_400_000), gym!.timezone))),
            or(isNull(childPrivacySettingsTable.childId), eq(childPrivacySettingsTable.teamSeesRecognition, true)),
          ),
        )
        .orderBy(desc(starAwardsTable.weekStart))
        .limit(10);
    }
    res.json({ gym: { id: gym!.id, name: gym!.name }, group: grp ?? null, focus, recognition: { mine, team: others }, emptyState: null });
  }),
);

// -- Privacy controls: what a parent sees vs what a coach sees ---------------------------------------
export const VISIBILITY_MATRIX = [
  { item: "Sessions you log", parent: true, coach: true, note: "Coaches see that a session was logged for their class, never who else is a guardian." },
  { item: "Coach notes marked shared", parent: true, coach: true, note: "" },
  { item: "Coach private notes", parent: false, coach: true, note: "Only gym staff can see these." },
  { item: "How are they feeling (mood, energy, sleep)", parent: true, coach: "setting", note: "Hidden from coaches unless you switch it on. Never part of attendance." },
  { item: "Guardian emails and contact details", parent: true, coach: false, note: "Coaches never see them." },
  { item: "Milestones and Star of the Week", parent: true, coach: true, note: "" },
  { item: "Star of the Week shown to the class group", parent: true, coach: true, note: "Only if the gym turns team recognition on AND you allow it." },
] as const;

const privacyBody = z.object({ coachSeesWellbeing: z.boolean().optional(), teamSeesRecognition: z.boolean().optional() }).refine((b) => Object.keys(b).length > 0, "Nothing to change");

export async function privacyFor(childId: string) {
  const [p] = await db.select().from(childPrivacySettingsTable).where(eq(childPrivacySettingsTable.childId, childId));
  return { coachSeesWellbeing: p?.coachSeesWellbeing ?? false, teamSeesRecognition: p?.teamSeesRecognition ?? true };
}

router.get(
  "/children/:childId/privacy",
  h(async (req, res) => {
    const childId = uuidParam(req, "childId");
    await assertGuardian(userId(req), childId);
    res.json({ settings: await privacyFor(childId), matrix: VISIBILITY_MATRIX });
  }),
);

router.put(
  "/children/:childId/privacy",
  h(async (req, res) => {
    const childId = uuidParam(req, "childId");
    const uid = userId(req);
    await assertGuardian(uid, childId);
    const b = parse(privacyBody, req.body);
    await db.transaction(async (tx) => {
      const before = await privacyFor(childId);
      const after = { ...before, ...b };
      await tx
        .insert(childPrivacySettingsTable)
        .values({ childId, ...after, updatedBy: uid })
        .onConflictDoUpdate({ target: childPrivacySettingsTable.childId, set: { ...after, updatedBy: uid, updatedAt: new Date() } });
      await recordHistory(tx, { childId, actorUserId: uid, actorRole: "parent", entity: "privacy", action: "updated", before, after });
    });
    res.json({ settings: await privacyFor(childId), matrix: VISIBILITY_MATRIX });
  }),
);

// -- Change history the PARENT may see (role-filtered) -----------------------------------------------
router.get(
  "/children/:childId/history",
  h(async (req, res) => {
    const childId = uuidParam(req, "childId");
    const uid = userId(req);
    await assertGuardian(uid, childId);
    const rows = (await db.select().from(changeHistoryTable).where(eq(changeHistoryTable.childId, childId)).orderBy(desc(changeHistoryTable.id)).limit(300)) as HistoryRow[];
    res.json({ history: rows.filter(parentCanSee).slice(0, 100).map((r) => toParentItem(r, uid)) });
  }),
);

// -- Notification topic preferences (device push on/off + quiet hours stay in /push/preferences) -----
const prefsBody = z.object({ timetable: z.boolean(), observations: z.boolean(), recognition: z.boolean(), announcements: z.boolean() }).partial().refine((b) => Object.keys(b).length > 0, "Nothing to change");

async function prefsFor(uid: string) {
  const [p] = await db.select().from(juniorNotificationPrefsTable).where(eq(juniorNotificationPrefsTable.userId, uid));
  return { timetable: p?.timetable ?? true, observations: p?.observations ?? true, recognition: p?.recognition ?? true, announcements: p?.announcements ?? true };
}

router.get("/notification-prefs", h(async (req, res) => { res.json({ prefs: await prefsFor(userId(req)) }); }));
router.put(
  "/notification-prefs",
  h(async (req, res) => {
    const uid = userId(req);
    const b = parse(prefsBody, req.body);
    const next = { ...(await prefsFor(uid)), ...b };
    await db
      .insert(juniorNotificationPrefsTable)
      .values({ userId: uid, ...next })
      .onConflictDoUpdate({ target: juniorNotificationPrefsTable.userId, set: { ...next, updatedAt: new Date() } });
    res.json({ prefs: next });
  }),
);

// -- Invitation accept flow ---------------------------------------------------------------------------
// A signed-in user sees invitations addressed to THEIR account email (no token needed to find them),
// previews what they are invited to, and accepts or declines. Token deep-link flows remain.
async function myEmail(uid: string): Promise<string> {
  const [me] = await db.select({ email: usersTable.email }).from(usersTable).where(eq(usersTable.id, uid));
  return normEmail(me?.email ?? "");
}

router.get(
  "/my/invites",
  h(async (req, res) => {
    const uid = userId(req);
    const now = nowOf(req);
    const email = await myEmail(uid);
    const guardian = await db
      .select({ id: guardianInvitesTable.id, childName: childrenTable.displayName, expiresAt: guardianInvitesTable.expiresAt, invitedBy: usersTable.displayName })
      .from(guardianInvitesTable)
      .innerJoin(childrenTable, eq(childrenTable.id, guardianInvitesTable.childId))
      .leftJoin(usersTable, eq(usersTable.id, guardianInvitesTable.createdBy))
      .where(
        and(
          eq(guardianInvitesTable.email, email),
          eq(childrenTable.status, "active"),
          isNull(guardianInvitesTable.acceptedAt),
          isNull(guardianInvitesTable.declinedAt),
          isNull(guardianInvitesTable.cancelledAt),
          gte(guardianInvitesTable.expiresAt, now),
        ),
      );
    const staff = await db
      .select({ id: staffInvitesTable.id, gymName: gymsTable.name, role: staffInvitesTable.role, expiresAt: staffInvitesTable.expiresAt })
      .from(staffInvitesTable)
      .innerJoin(gymsTable, eq(gymsTable.id, staffInvitesTable.gymId))
      .where(and(eq(staffInvitesTable.email, email), isNull(staffInvitesTable.acceptedAt), isNull(staffInvitesTable.declinedAt), isNull(staffInvitesTable.cancelledAt), gte(staffInvitesTable.expiresAt, now)));
    res.json({
      invites: [
        ...guardian.map((g) => ({ kind: "guardian" as const, id: g.id, title: `Follow ${g.childName} on FRAME`, from: g.invitedBy ?? null, expiresAt: g.expiresAt })),
        ...staff.map((s) => ({ kind: "staff" as const, id: s.id, title: `Join ${s.gymName} as ${s.role}`, from: null, expiresAt: s.expiresAt })),
      ],
      emptyState: guardian.length + staff.length === 0 ? { code: "NO_INVITES", message: "No invitations right now. If someone invited you, check that they used the email you signed up with." } : null,
    });
  }),
);

router.post(
  "/my/invites/:kind/:inviteId/:decision",
  h(async (req, res) => {
    const uid = userId(req);
    const now = nowOf(req);
    const kind = parse(z.enum(["guardian", "staff"]), req.params["kind"]);
    const decision = parse(z.enum(["accept", "decline"]), req.params["decision"]);
    const id = uuidParam(req, "inviteId");
    const email = await myEmail(uid);
    const result = await db.transaction(async (tx) => {
      if (kind === "guardian") {
        const [inv] = await tx.select().from(guardianInvitesTable).where(eq(guardianInvitesTable.id, id)).for("update");
        if (!inv || normEmail(inv.email) !== email || inv.acceptedAt || inv.declinedAt || inv.cancelledAt || inv.expiresAt.getTime() < now.getTime()) {
          throw new JuniorError(404, "NOT_FOUND", "Not found");
        }
        if (decision === "decline") {
          await tx.update(guardianInvitesTable).set({ declinedAt: now }).where(eq(guardianInvitesTable.id, id));
          await recordHistory(tx, { childId: inv.childId, actorUserId: uid, actorRole: "parent", entity: "guardian_link", entityId: uid, action: "invite_declined" });
          return { childId: null as string | null };
        }
        await tx.update(guardianInvitesTable).set({ acceptedAt: now }).where(eq(guardianInvitesTable.id, id));
        await tx
          .insert(guardianLinksTable)
          .values({ childId: inv.childId, userId: uid, invitedBy: inv.createdBy })
          .onConflictDoUpdate({ target: [guardianLinksTable.childId, guardianLinksTable.userId], set: { status: "active", revokedAt: null, revokedBy: null } });
        await tx.insert(userRolesTable).values({ userId: uid, role: "parent" }).onConflictDoUpdate({ target: [userRolesTable.userId, userRolesTable.role], set: { lastActiveAt: now } });
        await recordHistory(tx, { childId: inv.childId, actorUserId: uid, actorRole: "parent", entity: "guardian_link", entityId: uid, action: "invite_accepted" });
        return { childId: inv.childId };
      }
      const [inv] = await tx.select().from(staffInvitesTable).where(eq(staffInvitesTable.id, id)).for("update");
      if (!inv || normEmail(inv.email) !== email || inv.acceptedAt || inv.declinedAt || inv.cancelledAt || inv.expiresAt.getTime() < now.getTime()) {
        throw new JuniorError(404, "NOT_FOUND", "Not found");
      }
      if (decision === "decline") {
        await tx.update(staffInvitesTable).set({ declinedAt: now }).where(eq(staffInvitesTable.id, id));
        await recordHistory(tx, { gymId: inv.gymId, actorUserId: uid, actorRole: "coach", entity: "gym_staff", entityId: uid, action: "invite_declined" });
        return { childId: null };
      }
      await tx.update(staffInvitesTable).set({ acceptedAt: now }).where(eq(staffInvitesTable.id, id));
      await tx
        .insert(gymStaffTable)
        .values({ gymId: inv.gymId, userId: uid, role: inv.role })
        .onConflictDoUpdate({ target: [gymStaffTable.gymId, gymStaffTable.userId], set: { role: inv.role, status: "active", revokedAt: null, revokedBy: null } });
      await tx.insert(userRolesTable).values({ userId: uid, role: "coach" }).onConflictDoUpdate({ target: [userRolesTable.userId, userRolesTable.role], set: { lastActiveAt: now } });
      await recordHistory(tx, { gymId: inv.gymId, actorUserId: uid, actorRole: "coach", entity: "gym_staff", entityId: uid, action: "invite_accepted", after: { role: inv.role } });
      return { childId: null };
    });
    res.json({ ok: true, decision, ...(result.childId ? { childId: result.childId } : {}) });
  }),
);

// Inviter side: see and withdraw guardian invitations still open for a child.
router.get(
  "/children/:childId/guardian-invites",
  h(async (req, res) => {
    const childId = uuidParam(req, "childId");
    await assertGuardian(userId(req), childId);
    const rows = await db
      .select({ id: guardianInvitesTable.id, email: guardianInvitesTable.email, expiresAt: guardianInvitesTable.expiresAt, createdAt: guardianInvitesTable.createdAt })
      .from(guardianInvitesTable)
      .where(and(eq(guardianInvitesTable.childId, childId), isNull(guardianInvitesTable.acceptedAt), isNull(guardianInvitesTable.declinedAt), isNull(guardianInvitesTable.cancelledAt), gte(guardianInvitesTable.expiresAt, nowOf(req))));
    res.json({ invites: rows });
  }),
);

router.post(
  "/children/:childId/guardian-invites/:inviteId/cancel",
  h(async (req, res) => {
    const childId = uuidParam(req, "childId");
    const id = uuidParam(req, "inviteId");
    await assertGuardian(userId(req), childId);
    const rows = await db
      .update(guardianInvitesTable)
      .set({ cancelledAt: nowOf(req) })
      .where(and(eq(guardianInvitesTable.id, id), eq(guardianInvitesTable.childId, childId), isNull(guardianInvitesTable.acceptedAt), isNull(guardianInvitesTable.cancelledAt)))
      .returning({ id: guardianInvitesTable.id });
    if (!rows.length) throw new JuniorError(404, "NOT_FOUND", "Not found");
    res.json({ ok: true });
  }),
);

export default router;
