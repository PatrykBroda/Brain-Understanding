import crypto from "node:crypto";
import { Router, type IRouter } from "express";
import { z } from "zod/v4";
import { and, desc, eq, inArray, lt, sql } from "drizzle-orm";
import {
  db,
  childGymMembershipsTable,
  childrenTable,
  entitlementAuditTable,
  guardianLinksTable,
  gymsTable,
  userEntitlementsTable,
  usersTable,
} from "@workspace/db";
import { h, JuniorError, nowOf, parse, userId, uuidParam } from "../../lib/junior/http";
import { recordHistory, type DbLike } from "../../lib/junior/history";
import { PARENT_ENTITLEMENT } from "../../lib/junior/entitlement";
import { requireFrameAdmin } from "./identity";

/**
 * Pilot entitlement admin tooling (FRAME admin only). Server-granted access only:
 * this never touches RevenueCat and never charges anyone. Every change writes an
 * append-only entitlement_audit row in the same transaction.
 */
const router: IRouter = Router();

const grantBody = z.object({
  source: z.enum(["pilot", "admin"]).default("pilot"),
  expiresAt: z.coerce.date().optional(),
  reason: z.string().trim().max(300).optional(),
});
const revokeBody = z.object({ reason: z.string().trim().max(300).optional() });

async function guardiansOfGym(gymId: string, conn: DbLike = db): Promise<string[]> {
  const rows = await conn
    .selectDistinct({ userId: guardianLinksTable.userId })
    .from(guardianLinksTable)
    .innerJoin(childGymMembershipsTable, eq(childGymMembershipsTable.childId, guardianLinksTable.childId))
    .where(and(eq(childGymMembershipsTable.gymId, gymId), eq(childGymMembershipsTable.status, "approved"), eq(guardianLinksTable.status, "active")));
  return rows.map((r) => r.userId);
}

async function guardiansOfChild(childId: string, conn: DbLike = db): Promise<string[]> {
  const rows = await conn.select({ userId: guardianLinksTable.userId }).from(guardianLinksTable).where(and(eq(guardianLinksTable.childId, childId), eq(guardianLinksTable.status, "active")));
  return rows.map((r) => r.userId);
}

async function grantMany(users: string[], opts: { source: "pilot" | "admin"; expiresAt: Date | null; actor: string; gymId?: string; childId?: string; reason?: string | null }) {
  const batchId = crypto.randomUUID();
  await db.transaction(async (tx) => {
    for (const u of users) {
      await tx
        .insert(userEntitlementsTable)
        .values({ userId: u, entitlement: PARENT_ENTITLEMENT, source: opts.source, status: "active", expiresAt: opts.expiresAt })
        .onConflictDoUpdate({ target: [userEntitlementsTable.userId, userEntitlementsTable.entitlement, userEntitlementsTable.source], set: { status: "active", expiresAt: opts.expiresAt, updatedAt: new Date() } });
      await tx.insert(entitlementAuditTable).values({ targetUserId: u, gymId: opts.gymId ?? null, childId: opts.childId ?? null, batchId, action: "granted", source: opts.source, expiresAt: opts.expiresAt, actorUserId: opts.actor, reason: opts.reason ?? null });
    }
    await recordHistory(tx, { gymId: opts.gymId, childId: opts.childId, actorUserId: opts.actor, actorRole: "frame_admin", entity: "entitlement_batch", entityId: batchId, action: "granted", after: { users: users.length, source: opts.source } });
  });
  return batchId;
}

/** Revokes only server-granted sources (pilot/admin). A paid RevenueCat entitlement is never touched here. */
async function revokeMany(users: string[], opts: { actor: string; gymId?: string; childId?: string; reason?: string | null }) {
  const batchId = crypto.randomUUID();
  let changed = 0;
  await db.transaction(async (tx) => {
    for (const u of users) {
      const rows = await tx
        .update(userEntitlementsTable)
        .set({ status: "revoked", updatedAt: new Date() })
        .where(and(eq(userEntitlementsTable.userId, u), eq(userEntitlementsTable.entitlement, PARENT_ENTITLEMENT), inArray(userEntitlementsTable.source, ["pilot", "admin"]), eq(userEntitlementsTable.status, "active")))
        .returning({ source: userEntitlementsTable.source });
      for (const r of rows) {
        changed++;
        await tx.insert(entitlementAuditTable).values({ targetUserId: u, gymId: opts.gymId ?? null, childId: opts.childId ?? null, batchId, action: "revoked", source: r.source, actorUserId: opts.actor, reason: opts.reason ?? null });
      }
    }
    await recordHistory(tx, { gymId: opts.gymId, childId: opts.childId, actorUserId: opts.actor, actorRole: "frame_admin", entity: "entitlement_batch", entityId: batchId, action: "revoked", after: { grantsRevoked: changed } });
  });
  return { batchId, changed };
}

router.post(
  "/admin/entitlements/gym/:gymId/grant",
  h(async (req, res) => {
    const uid = userId(req);
    await requireFrameAdmin(uid);
    const gymId = uuidParam(req, "gymId");
    const [g] = await db.select({ id: gymsTable.id }).from(gymsTable).where(eq(gymsTable.id, gymId));
    if (!g) throw new JuniorError(404, "NOT_FOUND", "Not found");
    const b = parse(grantBody, req.body ?? {});
    const users = await guardiansOfGym(gymId);
    const batchId = await grantMany(users, { source: b.source, expiresAt: b.expiresAt ?? null, actor: uid, gymId, reason: b.reason });
    res.status(201).json({ batchId, granted: users.length });
  }),
);

router.post(
  "/admin/entitlements/gym/:gymId/revoke",
  h(async (req, res) => {
    const uid = userId(req);
    await requireFrameAdmin(uid);
    const gymId = uuidParam(req, "gymId");
    const b = parse(revokeBody, req.body ?? {});
    const r = await revokeMany(await guardiansOfGym(gymId), { actor: uid, gymId, reason: b.reason });
    res.json({ batchId: r.batchId, revoked: r.changed });
  }),
);

router.post(
  "/admin/entitlements/family/:childId/grant",
  h(async (req, res) => {
    const uid = userId(req);
    await requireFrameAdmin(uid);
    const childId = uuidParam(req, "childId");
    const [c] = await db.select({ id: childrenTable.id }).from(childrenTable).where(eq(childrenTable.id, childId));
    if (!c) throw new JuniorError(404, "NOT_FOUND", "Not found");
    const b = parse(grantBody, req.body ?? {});
    const users = await guardiansOfChild(childId);
    const batchId = await grantMany(users, { source: b.source, expiresAt: b.expiresAt ?? null, actor: uid, childId, reason: b.reason });
    res.status(201).json({ batchId, granted: users.length });
  }),
);

router.post(
  "/admin/entitlements/family/:childId/revoke",
  h(async (req, res) => {
    const uid = userId(req);
    await requireFrameAdmin(uid);
    const childId = uuidParam(req, "childId");
    const b = parse(revokeBody, req.body ?? {});
    const r = await revokeMany(await guardiansOfChild(childId), { actor: uid, childId, reason: b.reason });
    res.json({ batchId: r.batchId, revoked: r.changed });
  }),
);

router.get(
  "/admin/entitlements",
  h(async (req, res) => {
    await requireFrameAdmin(userId(req));
    const q = parse(z.object({ gymId: z.string().uuid().optional(), status: z.enum(["active", "revoked", "expired"]).optional() }), req.query);
    const now = nowOf(req);
    const conds = [eq(userEntitlementsTable.entitlement, PARENT_ENTITLEMENT)];
    if (q.status) conds.push(eq(userEntitlementsTable.status, q.status));
    if (q.gymId) {
      const ids = await guardiansOfGym(q.gymId);
      if (!ids.length) return void res.json({ entitlements: [] });
      conds.push(inArray(userEntitlementsTable.userId, ids));
    }
    const rows = await db
      .select({ userId: userEntitlementsTable.userId, email: usersTable.email, name: usersTable.displayName, source: userEntitlementsTable.source, status: userEntitlementsTable.status, expiresAt: userEntitlementsTable.expiresAt })
      .from(userEntitlementsTable)
      .innerJoin(usersTable, eq(usersTable.id, userEntitlementsTable.userId))
      .where(and(...conds))
      .orderBy(desc(userEntitlementsTable.updatedAt))
      .limit(500);
    res.json({ entitlements: rows.map((r) => ({ ...r, effective: r.status === "active" && (!r.expiresAt || r.expiresAt > now) })) });
  }),
);

router.get(
  "/admin/entitlements/audit",
  h(async (req, res) => {
    await requireFrameAdmin(userId(req));
    const q = parse(z.object({ userId: z.string().optional(), gymId: z.string().uuid().optional(), batchId: z.string().optional(), before: z.coerce.number().int().optional(), limit: z.coerce.number().int().min(1).max(200).default(50) }), req.query);
    const conds = [];
    if (q.userId) conds.push(eq(entitlementAuditTable.targetUserId, q.userId));
    if (q.gymId) conds.push(eq(entitlementAuditTable.gymId, q.gymId));
    if (q.batchId) conds.push(eq(entitlementAuditTable.batchId, q.batchId));
    if (q.before) conds.push(lt(entitlementAuditTable.id, q.before));
    const rows = await db.select().from(entitlementAuditTable).where(conds.length ? and(...conds) : sql`true`).orderBy(desc(entitlementAuditTable.id)).limit(q.limit);
    res.json({ audit: rows, nextBefore: rows.length === q.limit ? rows[rows.length - 1]!.id : null });
  }),
);

export default router;
