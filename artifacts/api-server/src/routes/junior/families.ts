import { Router, type IRouter } from "express";
import { z } from "zod/v4";
import { and, eq, inArray, isNull } from "drizzle-orm";
import {
  db,
  changeHistoryTable,
  childGymMembershipsTable,
  childrenTable,
  classGroupsTable,
  groupMembershipsTable,
  guardianInvitesTable,
  guardianLinksTable,
  gymsTable,
  usersTable,
  userRolesTable,
  gymMembershipsTable,
  attendanceLogsTable,
  observationsTable,
  wellbeingEntriesTable,
} from "@workspace/db";
import { sql } from "drizzle-orm";
import { h, JuniorError, nowOf, parse, userId, uuidParam } from "../../lib/junior/http";
import { recordHistory } from "../../lib/junior/history";
import { assertGuardian, requireGymStaff, getActiveStaff } from "../../lib/junior/authz";
import { hashToken, newToken, normEmail } from "./identity";
import { deleteChildren } from "../../lib/junior/deleteChildren";
import { sendMail } from "../../lib/mailer";
import { boardName } from "../../lib/junior/stats";

const router: IRouter = Router();
const INVITE_TTL_MS = 7 * 24 * 3600 * 1000;

const childBody = z.object({
  displayName: z.string().trim().min(1).max(60),
  birthYearMonth: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Use YYYY-MM"),
});

/** Parent creates a child profile and becomes its first guardian (also marks the parent role as a UI preference). */
router.post(
  "/children",
  h(async (req, res) => {
    const uid = userId(req);
    const b = parse(childBody, req.body);
    const child = await db.transaction(async (tx) => {
      const [c] = await tx.insert(childrenTable).values({ displayName: b.displayName, birthYearMonth: b.birthYearMonth, createdBy: uid }).returning();
      await tx.insert(guardianLinksTable).values({ childId: c!.id, userId: uid, invitedBy: uid });
      await tx
        .insert(userRolesTable)
        .values({ userId: uid, role: "parent" })
        .onConflictDoUpdate({ target: [userRolesTable.userId, userRolesTable.role], set: { lastActiveAt: new Date() } });
      await recordHistory(tx, { childId: c!.id, actorUserId: uid, actorRole: "parent", entity: "child", entityId: c!.id, action: "created" });
      return c!;
    });
    res.status(201).json({ child });
  }),
);

router.get(
  "/children/:childId",
  h(async (req, res) => {
    const childId = uuidParam(req, "childId");
    await assertGuardian(userId(req), childId);
    const [child] = await db.select().from(childrenTable).where(eq(childrenTable.id, childId));
    res.json({ child });
  }),
);

router.patch(
  "/children/:childId",
  h(async (req, res) => {
    const uid = userId(req);
    const childId = uuidParam(req, "childId");
    await assertGuardian(uid, childId);
    const b = parse(childBody.partial(), req.body);
    await db.transaction(async (tx) => {
      const [before] = await tx.select().from(childrenTable).where(eq(childrenTable.id, childId));
      await tx.update(childrenTable).set(b).where(eq(childrenTable.id, childId));
      await recordHistory(tx, { childId, actorUserId: uid, actorRole: "parent", entity: "child", entityId: childId, action: "updated", before: { displayName: before?.displayName }, after: b });
    });
    res.json({ ok: true });
  }),
);

// ── Export everything held about the child (guardian only) ───────────────────
router.get(
  "/children/:childId/export",
  h(async (req, res) => {
    const childId = uuidParam(req, "childId");
    await assertGuardian(userId(req), childId);
    const [child] = await db.select().from(childrenTable).where(eq(childrenTable.id, childId));
    const logs = await db.select().from(attendanceLogsTable).where(eq(attendanceLogsTable.childId, childId));
    const wellbeing = await db.select().from(wellbeingEntriesTable).where(eq(wellbeingEntriesTable.childId, childId));
    // Shared observations only: private coach notes are the gym's, not the family's.
    const observations = await db
      .select({ id: observationsTable.id, body: observationsTable.body, createdAt: observationsTable.createdAt })
      .from(observationsTable)
      .where(and(eq(observationsTable.childId, childId), eq(observationsTable.visibility, "shared"), eq(observationsTable.status, "active")));
    res.json({ child, attendance: logs, wellbeing, observations });
  }),
);

router.delete(
  "/children/:childId",
  h(async (req, res) => {
    const uid = userId(req);
    const childId = uuidParam(req, "childId");
    await assertGuardian(uid, childId);
    await db.transaction((tx) => deleteChildren(tx, [childId], uid));
    res.json({ ok: true });
  }),
);

// ── Guardians ────────────────────────────────────────────────────────────────
const inviteBody = z.object({ email: z.string().trim().email() });

router.post(
  "/children/:childId/guardian-invites",
  h(async (req, res) => {
    const uid = userId(req);
    const childId = uuidParam(req, "childId");
    await assertGuardian(uid, childId);
    const { email } = parse(inviteBody, req.body);
    const token = newToken();
    await db.insert(guardianInvitesTable).values({
      childId,
      email: normEmail(email),
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + INVITE_TTL_MS),
      createdBy: uid,
    });
    try {
      await sendMail({ to: normEmail(email), subject: "You have been invited to follow a child on FRAME", text: `Open FRAME, sign up as a parent with this email and enter code: ${token}` } as Parameters<typeof sendMail>[0]);
    } catch {
      /* best effort */
    }
    res.status(201).json({ inviteToken: token });
  }),
);

router.post(
  "/guardian-invites/accept",
  h(async (req, res) => {
    const uid = userId(req);
    const { token } = parse(z.object({ token: z.string().min(10).max(200) }), req.body);
    const [me] = await db.select({ email: usersTable.email }).from(usersTable).where(eq(usersTable.id, uid));
    const childId = await db.transaction(async (tx) => {
      const [inv] = await tx.select().from(guardianInvitesTable).where(eq(guardianInvitesTable.tokenHash, hashToken(token))).for("update");
      if (!inv || inv.acceptedAt || inv.declinedAt || inv.cancelledAt || inv.expiresAt.getTime() < nowOf(req).getTime() || normEmail(inv.email) !== normEmail(me?.email ?? "")) {
        throw new JuniorError(400, "INVALID_INVITE", "This invite is invalid, expired or for a different email");
      }
      await tx.update(guardianInvitesTable).set({ acceptedAt: new Date() }).where(eq(guardianInvitesTable.id, inv.id));
      await tx
        .insert(guardianLinksTable)
        .values({ childId: inv.childId, userId: uid, invitedBy: inv.createdBy })
        .onConflictDoUpdate({ target: [guardianLinksTable.childId, guardianLinksTable.userId], set: { status: "active", revokedAt: null, revokedBy: null } });
      await tx
        .insert(userRolesTable)
        .values({ userId: uid, role: "parent" })
        .onConflictDoUpdate({ target: [userRolesTable.userId, userRolesTable.role], set: { lastActiveAt: new Date() } });
      await recordHistory(tx, { childId: inv.childId, actorUserId: uid, actorRole: "parent", entity: "guardian_link", entityId: uid, action: "invite_accepted" });
      return inv.childId;
    });
    res.json({ ok: true, childId });
  }),
);

router.get(
  "/children/:childId/guardians",
  h(async (req, res) => {
    const childId = uuidParam(req, "childId");
    await assertGuardian(userId(req), childId);
    const rows = await db
      .select({ userId: guardianLinksTable.userId, relationship: guardianLinksTable.relationship, email: usersTable.email, name: usersTable.displayName })
      .from(guardianLinksTable)
      .innerJoin(usersTable, eq(usersTable.id, guardianLinksTable.userId))
      .where(and(eq(guardianLinksTable.childId, childId), eq(guardianLinksTable.status, "active")));
    res.json({ guardians: rows });
  }),
);

router.post(
  "/children/:childId/guardians/:guardianUserId/revoke",
  h(async (req, res) => {
    const uid = userId(req);
    const childId = uuidParam(req, "childId");
    await assertGuardian(uid, childId);
    const target = String(req.params["guardianUserId"]);
    await db.transaction(async (tx) => {
      const active = await tx
        .select({ id: guardianLinksTable.id, userId: guardianLinksTable.userId })
        .from(guardianLinksTable)
        .where(and(eq(guardianLinksTable.childId, childId), eq(guardianLinksTable.status, "active")))
        .for("update");
      const row = active.find((a) => a.userId === target);
      if (!row) throw new JuniorError(404, "NOT_FOUND", "Not found");
      if (active.length <= 1) throw new JuniorError(409, "LAST_GUARDIAN", "A child needs at least one guardian. Delete the child instead.");
      await tx.update(guardianLinksTable).set({ status: "revoked", revokedAt: new Date(), revokedBy: uid }).where(eq(guardianLinksTable.id, row.id));
      await recordHistory(tx, { childId, actorUserId: uid, actorRole: "parent", entity: "guardian_link", entityId: target, action: "revoked" });
    });
    res.json({ ok: true });
  }),
);

// ── Gym membership: parent requests, staff decides ───────────────────────────
router.post(
  "/children/:childId/membership-requests",
  h(async (req, res) => {
    const uid = userId(req);
    const childId = uuidParam(req, "childId");
    await assertGuardian(uid, childId);
    const { gymId } = parse(z.object({ gymId: z.string().uuid() }), req.body);
    const [gym] = await db.select({ id: gymsTable.id }).from(gymsTable).where(and(eq(gymsTable.id, gymId), eq(gymsTable.status, "active")));
    if (!gym) throw new JuniorError(404, "NOT_FOUND", "Not found");
    const out = await db.transaction(async (tx) => {
      const rows = await tx
        .insert(childGymMembershipsTable)
        .values({ childId, gymId, status: "pending", requestedBy: uid })
        .onConflictDoNothing()
        .returning();
      if (rows[0]) await recordHistory(tx, { gymId, childId, actorUserId: uid, actorRole: "parent", entity: "membership", entityId: rows[0].id, action: "requested" });
      return rows[0] ?? null;
    });
    res.status(out ? 201 : 200).json({ ok: true, alreadyOpen: !out });
  }),
);

router.get(
  "/gyms/:gymId/membership-requests",
  h(async (req, res) => {
    const gymId = uuidParam(req, "gymId");
    await requireGymStaff(userId(req), gymId, "coach");
    const rows = await db
      .select({ id: childGymMembershipsTable.id, childId: childGymMembershipsTable.childId, displayName: childrenTable.displayName, birthYearMonth: childrenTable.birthYearMonth, createdAt: childGymMembershipsTable.createdAt })
      .from(childGymMembershipsTable)
      .innerJoin(childrenTable, eq(childrenTable.id, childGymMembershipsTable.childId))
      .where(and(eq(childGymMembershipsTable.gymId, gymId), eq(childGymMembershipsTable.status, "pending")));
    // Adult members asking to join: first name + initial only (no email, no birth data).
    const adults = await db
      .select({ id: gymMembershipsTable.id, name: usersTable.displayName, createdAt: gymMembershipsTable.createdAt })
      .from(gymMembershipsTable)
      .innerJoin(usersTable, eq(usersTable.id, gymMembershipsTable.userId))
      .where(and(eq(gymMembershipsTable.gymId, gymId), eq(gymMembershipsTable.status, "pending")));
    res.json({
      requests: [
        ...rows.map((r) => ({ ...r, kind: "junior" as const })),
        ...adults.map((a) => ({ id: a.id, childId: null as string | null, displayName: boardName(a.name || "New member"), birthYearMonth: null as string | null, createdAt: a.createdAt, kind: "member" as const })),
      ],
    });
  }),
);

const decideBody = z.object({ decision: z.enum(["approve", "reject"]), groupId: z.string().uuid().optional() });

router.post(
  "/gyms/:gymId/membership-requests/:membershipId/decide",
  h(async (req, res) => {
    const gymId = uuidParam(req, "gymId");
    const mid = uuidParam(req, "membershipId");
    const uid = userId(req);
    const staff = await requireGymStaff(uid, gymId, "coach");
    const b = parse(decideBody, req.body);
    await db.transaction(async (tx) => {
      const actorRole = staff.role === "admin" ? "admin" : "coach";
      const [m] = await tx
        .select()
        .from(childGymMembershipsTable)
        .where(and(eq(childGymMembershipsTable.id, mid), eq(childGymMembershipsTable.gymId, gymId)))
        .for("update");
      if (!m) {
        // Not a junior request: an adult member's request to this gym?
        const [a] = await tx
          .select()
          .from(gymMembershipsTable)
          .where(and(eq(gymMembershipsTable.id, mid), eq(gymMembershipsTable.gymId, gymId)))
          .for("update");
        if (!a) throw new JuniorError(404, "NOT_FOUND", "Not found");
        if (a.status !== "pending") throw new JuniorError(409, "ALREADY_DECIDED", "Already decided");
        await tx
          .update(gymMembershipsTable)
          .set({ status: b.decision === "approve" ? "approved" : "rejected", decidedBy: uid, decidedAt: new Date() })
          .where(eq(gymMembershipsTable.id, mid));
        await recordHistory(tx, { gymId, actorUserId: uid, actorRole, entity: "gym_membership", entityId: mid, action: b.decision === "approve" ? "approved" : "rejected" });
        return;
      }
      if (m.status !== "pending") throw new JuniorError(409, "ALREADY_DECIDED", "Already decided");
      if (b.decision === "approve") {
        await tx.update(childGymMembershipsTable).set({ status: "approved", decidedBy: uid, decidedAt: new Date() }).where(eq(childGymMembershipsTable.id, mid));
        if (b.groupId) await setGroup(tx, gymId, m.childId, b.groupId);
      } else {
        await tx.update(childGymMembershipsTable).set({ status: "rejected", decidedBy: uid, decidedAt: new Date() }).where(eq(childGymMembershipsTable.id, mid));
      }
      await recordHistory(tx, { gymId, childId: m.childId, actorUserId: uid, actorRole, entity: "membership", entityId: mid, action: b.decision === "approve" ? "approved" : "rejected" });
    });
    res.json({ ok: true });
  }),
);

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
async function setGroup(tx: Tx, gymId: string, childId: string, groupId: string) {
  const [g] = await tx.select({ id: classGroupsTable.id }).from(classGroupsTable).where(and(eq(classGroupsTable.id, groupId), eq(classGroupsTable.gymId, gymId), eq(classGroupsTable.active, true)));
  if (!g) throw new JuniorError(422, "BAD_GROUP", "Group does not belong to this gym");
  await tx.update(groupMembershipsTable).set({ effectiveTo: new Date() }).where(and(eq(groupMembershipsTable.childId, childId), isNull(groupMembershipsTable.effectiveTo)));
  await tx.insert(groupMembershipsTable).values({ childId, groupId });
}

router.post(
  "/gyms/:gymId/children/:childId/group",
  h(async (req, res) => {
    const gymId = uuidParam(req, "gymId");
    const childId = uuidParam(req, "childId");
    const uid = userId(req);
    const staff = await requireGymStaff(uid, gymId, "coach");
    const { groupId } = parse(z.object({ groupId: z.string().uuid() }), req.body);
    await db.transaction(async (tx) => {
      const [m] = await tx
        .select({ id: childGymMembershipsTable.id })
        .from(childGymMembershipsTable)
        .where(and(eq(childGymMembershipsTable.gymId, gymId), eq(childGymMembershipsTable.childId, childId), eq(childGymMembershipsTable.status, "approved")));
      if (!m) throw new JuniorError(404, "NOT_FOUND", "Not found");
      await setGroup(tx, gymId, childId, groupId);
      await recordHistory(tx, { gymId, childId, actorUserId: uid, actorRole: staff.role === "admin" ? "admin" : "coach", entity: "group_membership", action: "moved", after: { groupId } });
    });
    res.json({ ok: true });
  }),
);

/** Staff ends an approved membership (e.g. child left the gym). Logged history stays with the family. */
router.post(
  "/gyms/:gymId/children/:childId/end-membership",
  h(async (req, res) => {
    const gymId = uuidParam(req, "gymId");
    const childId = uuidParam(req, "childId");
    const uid = userId(req);
    await requireGymStaff(uid, gymId, "admin");
    await db.transaction(async (tx) => {
      const rows = await tx
        .update(childGymMembershipsTable)
        .set({ status: "ended", endedAt: new Date(), endReason: "gym_ended" })
        .where(and(eq(childGymMembershipsTable.gymId, gymId), eq(childGymMembershipsTable.childId, childId), eq(childGymMembershipsTable.status, "approved")))
        .returning({ id: childGymMembershipsTable.id });
      if (!rows.length) throw new JuniorError(404, "NOT_FOUND", "Not found");
      await tx.update(groupMembershipsTable).set({ effectiveTo: new Date() }).where(and(eq(groupMembershipsTable.childId, childId), isNull(groupMembershipsTable.effectiveTo)));
      await recordHistory(tx, { gymId, childId, actorUserId: uid, actorRole: "admin", entity: "membership", entityId: rows[0]!.id, action: "ended" });
    });
    res.json({ ok: true });
  }),
);

export { getActiveStaff };
export default router;
