import { Router, type IRouter } from "express";
import crypto from "node:crypto";
import { z } from "zod/v4";
import { and, desc, eq, inArray } from "drizzle-orm";
import {
  db,
  childGymMembershipsTable,
  childrenTable,
  guardianLinksTable,
  gymStaffTable,
  gymsTable,
  milestoneRulesTable,
  staffInvitesTable,
  userEntitlementsTable,
  entitlementAuditTable,
  userRolesTable,
  usersTable,
} from "@workspace/db";
import { h, JuniorError, nowOf, parse, userId, uuidParam } from "../../lib/junior/http";
import { recordHistory } from "../../lib/junior/history";
import { requireGymStaff } from "../../lib/junior/authz";
import { DEFAULT_MILESTONES } from "../../lib/junior/milestones";
import { PARENT_ENTITLEMENT, userHasParentEntitlement } from "../../lib/junior/entitlement";
import { isValidTimeZone } from "../../lib/localTime";
import { sendMail } from "../../lib/mailer";

const router: IRouter = Router();

const INVITE_TTL_MS = 7 * 24 * 3600 * 1000;
export const normEmail = (e: string) => e.trim().toLowerCase();
export const newToken = () => crypto.randomBytes(24).toString("base64url");
export const hashToken = (t: string) => crypto.createHash("sha256").update(t).digest("hex");

export async function requireFrameAdmin(uid: string): Promise<void> {
  const [u] = await db.select({ isAdmin: usersTable.isAdmin }).from(usersTable).where(eq(usersTable.id, uid)).limit(1);
  if (!u?.isAdmin) throw new JuniorError(403, "FRAME_ADMIN_REQUIRED", "FRAME admin only");
}

const roleBody = z.object({ role: z.enum(["athlete", "parent", "coach"]) });

// ── Who am I, in the junior portal ───────────────────────────────────────────
router.get(
  "/me",
  h(async (req, res) => {
    const uid = userId(req);
    const roles = await db.select().from(userRolesTable).where(eq(userRolesTable.userId, uid)).orderBy(desc(userRolesTable.lastActiveAt));
    const staff = await db
      .select({ gymId: gymStaffTable.gymId, role: gymStaffTable.role, gymName: gymsTable.name })
      .from(gymStaffTable)
      .innerJoin(gymsTable, eq(gymsTable.id, gymStaffTable.gymId))
      .where(and(eq(gymStaffTable.userId, uid), eq(gymStaffTable.status, "active")));
    const kids = await db
      .select({ id: childrenTable.id, displayName: childrenTable.displayName, birthYearMonth: childrenTable.birthYearMonth })
      .from(guardianLinksTable)
      .innerJoin(childrenTable, eq(childrenTable.id, guardianLinksTable.childId))
      .where(and(eq(guardianLinksTable.userId, uid), eq(guardianLinksTable.status, "active"), eq(childrenTable.status, "active")));
    const memberships = kids.length
      ? await db
          .select({
            childId: childGymMembershipsTable.childId,
            status: childGymMembershipsTable.status,
            gymId: childGymMembershipsTable.gymId,
            gymName: gymsTable.name,
          })
          .from(childGymMembershipsTable)
          .innerJoin(gymsTable, eq(gymsTable.id, childGymMembershipsTable.gymId))
          .where(
            and(inArray(childGymMembershipsTable.childId, kids.map((k) => k.id)), inArray(childGymMembershipsTable.status, ["pending", "approved", "rejected"])),
          )
      : [];
    res.json({
      roles: roles.map((r) => r.role),
      activeRole: roles[0]?.role ?? null,
      // Staff rows (not roles) are what grant coach access: an empty list means "ask your gym to invite you".
      staff,
      children: kids.map((k) => ({
        ...k,
        membership: memberships.find((m) => m.childId === k.id) ?? null,
      })),
      parentEntitlement: await userHasParentEntitlement(uid, nowOf(req)),
    });
  }),
);

// Choosing a view only records a UI preference. It grants nothing (acceptance #13).
router.post(
  "/roles",
  h(async (req, res) => {
    const uid = userId(req);
    const { role } = parse(roleBody, req.body);
    await db
      .insert(userRolesTable)
      .values({ userId: uid, role })
      .onConflictDoUpdate({ target: [userRolesTable.userId, userRolesTable.role], set: { lastActiveAt: new Date() } });
    const roles = await db.select().from(userRolesTable).where(eq(userRolesTable.userId, uid));
    res.json({
      roles: roles.map((r) => r.role),
      activeRole: role,
      ...(role === "coach" ? { note: "Ask your gym to invite you. Choosing Coach does not grant access." } : {}),
    });
  }),
);

// ── Gym directory (single gym in the pilot; name + id only) ──────────────────
router.get(
  "/gyms",
  h(async (_req, res) => {
    const rows = await db
      .select({ id: gymsTable.id, name: gymsTable.name, slug: gymsTable.slug, location: gymsTable.location })
      .from(gymsTable)
      .where(eq(gymsTable.status, "active"));
    res.json({ gyms: rows });
  }),
);

// ── FRAME admin: seed gym + first admin, grant pilot entitlement ─────────────
const gymBody = z.object({
  name: z.string().trim().min(2).max(120),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9-]{2,60}$/),
  location: z.string().trim().max(160).default(""),
  timezone: z.string().refine(isValidTimeZone, "Invalid timezone").default("Asia/Bangkok"),
  adminEmail: z.string().trim().email().optional(),
});

async function addStaffOrInvite(gymId: string, email: string, role: "coach" | "admin", byUserId: string, actorRole: "frame_admin" | "admin") {
  const e = normEmail(email);
  const [user] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, e)).limit(1);
  if (user) {
    await db.transaction(async (tx) => {
      await tx
        .insert(gymStaffTable)
        .values({ gymId, userId: user.id, role })
        .onConflictDoUpdate({
          target: [gymStaffTable.gymId, gymStaffTable.userId],
          set: { role, status: "active", revokedAt: null, revokedBy: null },
        });
      await recordHistory(tx, { gymId, actorUserId: byUserId, actorRole, entity: "gym_staff", entityId: user.id, action: "added", after: { role } });
    });
    return { added: true as const, userId: user.id };
  }
  const token = newToken();
  await db.transaction(async (tx) => {
    const [inv] = await tx
      .insert(staffInvitesTable)
      .values({ gymId, email: e, role, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + INVITE_TTL_MS), createdBy: byUserId })
      .returning({ id: staffInvitesTable.id });
    await recordHistory(tx, { gymId, actorUserId: byUserId, actorRole, entity: "staff_invite", entityId: inv!.id, action: "invited", after: { role } });
  });
  try {
    await sendMail({
      to: e,
      subject: "You have been invited to coach on FRAME",
      text: `Open FRAME, create an account with this email, then enter this invite code under Coach: ${token}\nIt expires in 7 days.`,
    } as Parameters<typeof sendMail>[0]);
  } catch {
    /* mail is best effort; the code is also returned to the inviter */
  }
  return { added: false as const, inviteToken: token };
}

router.post(
  "/admin/gyms",
  h(async (req, res) => {
    const uid = userId(req);
    await requireFrameAdmin(uid);
    const b = parse(gymBody, req.body);
    const gym = await db.transaction(async (tx) => {
      const [g] = await tx
        .insert(gymsTable)
        .values({ name: b.name, slug: b.slug, location: b.location, timezone: b.timezone })
        .onConflictDoNothing()
        .returning();
      if (!g) throw new JuniorError(409, "SLUG_TAKEN", "A gym with that slug already exists");
      await tx.insert(milestoneRulesTable).values(DEFAULT_MILESTONES.map((m) => ({ gymId: g.id, threshold: m.threshold, label: m.label })));
      await recordHistory(tx, { gymId: g.id, actorUserId: uid, actorRole: "frame_admin", entity: "gym", entityId: g.id, action: "created", after: { name: g.name } });
      return g;
    });
    const first = b.adminEmail ? await addStaffOrInvite(gym.id, b.adminEmail, "admin", uid, "frame_admin") : null;
    res.status(201).json({ gym, firstAdmin: first });
  }),
);

const grantBody = z
  .object({
    email: z.string().trim().email().optional(),
    userId: z.string().min(1).optional(),
    source: z.enum(["pilot", "admin"]).default("pilot"),
    expiresAt: z.coerce.date().optional(),
  })
  .refine((b) => b.email || b.userId, "email or userId required");

router.post(
  "/admin/entitlements",
  h(async (req, res) => {
    const uid = userId(req);
    await requireFrameAdmin(uid);
    const b = parse(grantBody, req.body);
    const [target] = b.userId
      ? await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.id, b.userId)).limit(1)
      : await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, normEmail(b.email!))).limit(1);
    if (!target) throw new JuniorError(404, "USER_NOT_FOUND", "No such user");
    await db.transaction(async (tx) => {
      await tx
        .insert(userEntitlementsTable)
        .values({ userId: target.id, entitlement: PARENT_ENTITLEMENT, source: b.source, status: "active", expiresAt: b.expiresAt ?? null })
        .onConflictDoUpdate({
          target: [userEntitlementsTable.userId, userEntitlementsTable.entitlement, userEntitlementsTable.source],
          set: { status: "active", expiresAt: b.expiresAt ?? null, updatedAt: new Date() },
        });
      await recordHistory(tx, {
        actorUserId: uid,
        actorRole: "frame_admin",
        entity: "entitlement",
        entityId: target.id,
        action: "granted",
        after: { entitlement: PARENT_ENTITLEMENT, source: b.source, expiresAt: b.expiresAt ?? null },
      });
      await tx.insert(entitlementAuditTable).values({ targetUserId: target.id, action: "granted", source: b.source, expiresAt: b.expiresAt ?? null, actorUserId: uid });
    });
    res.status(201).json({ ok: true, userId: target.id });
  }),
);

router.delete(
  "/admin/entitlements/:userId",
  h(async (req, res) => {
    const uid = userId(req);
    await requireFrameAdmin(uid);
    const target = String(req.params["userId"]);
    await db.transaction(async (tx) => {
      await tx
        .update(userEntitlementsTable)
        .set({ status: "revoked", updatedAt: new Date() })
        .where(and(eq(userEntitlementsTable.userId, target), eq(userEntitlementsTable.entitlement, PARENT_ENTITLEMENT)));
      await recordHistory(tx, { actorUserId: uid, actorRole: "frame_admin", entity: "entitlement", entityId: target, action: "revoked" });
      await tx.insert(entitlementAuditTable).values({ targetUserId: target, action: "revoked", source: "all", actorUserId: uid });
    });
    res.json({ ok: true });
  }),
);

// ── Gym staff management (gym admin) ─────────────────────────────────────────
const staffBody = z.object({ email: z.string().trim().email(), role: z.enum(["coach", "admin"]).default("coach") });

router.get(
  "/gyms/:gymId/staff",
  h(async (req, res) => {
    const gymId = uuidParam(req, "gymId");
    await requireGymStaff(userId(req), gymId, "admin");
    const rows = await db
      .select({ userId: gymStaffTable.userId, role: gymStaffTable.role, status: gymStaffTable.status, email: usersTable.email, name: usersTable.displayName })
      .from(gymStaffTable)
      .innerJoin(usersTable, eq(usersTable.id, gymStaffTable.userId))
      .where(eq(gymStaffTable.gymId, gymId));
    res.json({ staff: rows });
  }),
);

router.post(
  "/gyms/:gymId/staff",
  h(async (req, res) => {
    const gymId = uuidParam(req, "gymId");
    const uid = userId(req);
    await requireGymStaff(uid, gymId, "admin");
    const b = parse(staffBody, req.body);
    const out = await addStaffOrInvite(gymId, b.email, b.role, uid, "admin");
    res.status(201).json(out);
  }),
);

router.post(
  "/gyms/:gymId/staff/:staffUserId/revoke",
  h(async (req, res) => {
    const gymId = uuidParam(req, "gymId");
    const uid = userId(req);
    await requireGymStaff(uid, gymId, "admin");
    const target = String(req.params["staffUserId"]);
    await db.transaction(async (tx) => {
      const [row] = await tx
        .select()
        .from(gymStaffTable)
        .where(and(eq(gymStaffTable.gymId, gymId), eq(gymStaffTable.userId, target), eq(gymStaffTable.status, "active")))
        .for("update");
      if (!row) throw new JuniorError(404, "NOT_FOUND", "Not found");
      if (row.role === "admin") {
        const admins = await tx
          .select({ id: gymStaffTable.id })
          .from(gymStaffTable)
          .where(and(eq(gymStaffTable.gymId, gymId), eq(gymStaffTable.role, "admin"), eq(gymStaffTable.status, "active")));
        if (admins.length <= 1) throw new JuniorError(409, "LAST_ADMIN", "A gym needs at least one admin");
      }
      await tx.update(gymStaffTable).set({ status: "revoked", revokedAt: new Date(), revokedBy: uid }).where(eq(gymStaffTable.id, row.id));
      await recordHistory(tx, { gymId, actorUserId: uid, actorRole: "admin", entity: "gym_staff", entityId: target, action: "revoked", before: { role: row.role } });
    });
    res.json({ ok: true });
  }),
);

const acceptBody = z.object({ token: z.string().min(10).max(200) });

router.post(
  "/staff-invites/accept",
  h(async (req, res) => {
    const uid = userId(req);
    const { token } = parse(acceptBody, req.body);
    const [me] = await db.select({ email: usersTable.email }).from(usersTable).where(eq(usersTable.id, uid)).limit(1);
    await db.transaction(async (tx) => {
      const [inv] = await tx.select().from(staffInvitesTable).where(eq(staffInvitesTable.tokenHash, hashToken(token))).for("update");
      if (!inv || inv.acceptedAt || inv.declinedAt || inv.cancelledAt || inv.expiresAt.getTime() < nowOf(req).getTime() || normEmail(inv.email) !== normEmail(me?.email ?? "")) {
        throw new JuniorError(400, "INVALID_INVITE", "This invite is invalid, expired or for a different email");
      }
      await tx.update(staffInvitesTable).set({ acceptedAt: new Date() }).where(eq(staffInvitesTable.id, inv.id));
      await tx
        .insert(gymStaffTable)
        .values({ gymId: inv.gymId, userId: uid, role: inv.role })
        .onConflictDoUpdate({ target: [gymStaffTable.gymId, gymStaffTable.userId], set: { role: inv.role, status: "active", revokedAt: null, revokedBy: null } });
      await tx
        .insert(userRolesTable)
        .values({ userId: uid, role: "coach" })
        .onConflictDoUpdate({ target: [userRolesTable.userId, userRolesTable.role], set: { lastActiveAt: new Date() } });
      await recordHistory(tx, { gymId: inv.gymId, actorUserId: uid, actorRole: "coach", entity: "gym_staff", entityId: uid, action: "invite_accepted", after: { role: inv.role } });
    });
    res.json({ ok: true });
  }),
);

export default router;
