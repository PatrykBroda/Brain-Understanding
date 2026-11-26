import { Router, type IRouter } from "express";
import { z } from "zod/v4";
import { and, asc, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { db, childGymMembershipsTable, childrenTable, guardianLinksTable, gymMembershipsTable, gymStaffTable, gymsTable } from "@workspace/db";
import { h, JuniorError, nowOf, parse, userId, uuidParam } from "../../lib/junior/http";
import { recordHistory } from "../../lib/junior/history";
import { assertGuardian } from "../../lib/junior/authz";
import { rateLimitCheck, type RateBucket } from "../auth";

/**
 * "Join a gym" for ANY account: search the public gym list, request to join (an adult as a member, or a
 * parent for their junior), see the status, cancel while pending. The gym's coach / admin decides in the
 * existing approvals list (families.ts), which handles both kinds.
 */
const router: IRouter = Router();

export const _searchStore = new Map<string, RateBucket>();
export const _joinStore = new Map<string, RateBucket>();
const SEARCH_MAX = 40;
const SEARCH_WINDOW_MS = 60 * 1000;
const JOIN_MAX = 10;
const JOIN_WINDOW_MS = 60 * 60 * 1000;

function limited(ok: boolean, windowMs: number) {
  if (!ok) throw new JuniorError(429, "RATE_LIMITED", "Too many requests. Try again shortly.", { retryAfterSeconds: Math.round(windowMs / 1000) });
}

/** Escape LIKE wildcards so a search for "%" is a literal search. */
const likeEscape = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

const searchQuery = z.object({
  q: z.string().trim().max(60).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
  offset: z.coerce.number().int().min(0).max(5000).optional(),
});

// Public gym fields ONLY: name and city (the gym's location text). No staff, members, slugs of private data, ids of people.
router.get(
  "/gym-search",
  h(async (req, res) => {
    const uid = userId(req);
    limited(rateLimitCheck(`gs:${uid}`, SEARCH_MAX, SEARCH_WINDOW_MS, _searchStore), SEARCH_WINDOW_MS);
    const { q, limit = 20, offset = 0 } = parse(searchQuery, req.query);
    const conds = [eq(gymsTable.status, "active")];
    if (q) {
      const pat = `%${likeEscape(q)}%`;
      conds.push(or(ilike(gymsTable.name, pat), ilike(gymsTable.location, pat))!);
    }
    const rows = await db
      .select({ id: gymsTable.id, name: gymsTable.name, city: gymsTable.location })
      .from(gymsTable)
      .where(and(...conds))
      .orderBy(asc(sql`lower(${gymsTable.name})`), asc(gymsTable.id))
      .limit(limit)
      .offset(offset);
    res.json({ gyms: rows, limit, offset });
  }),
);

const joinBody = z.object({ gymId: z.string().uuid(), childId: z.string().uuid().optional() });

router.post(
  "/gym-join-requests",
  h(async (req, res) => {
    const uid = userId(req);
    limited(rateLimitCheck(`gj:${uid}`, JOIN_MAX, JOIN_WINDOW_MS, _joinStore), JOIN_WINDOW_MS);
    const b = parse(joinBody, req.body);
    const [gym] = await db.select({ id: gymsTable.id, name: gymsTable.name }).from(gymsTable).where(and(eq(gymsTable.id, b.gymId), eq(gymsTable.status, "active")));
    if (!gym) throw new JuniorError(404, "NOT_FOUND", "Not found");

    if (b.childId) {
      await assertGuardian(uid, b.childId);
      const out = await db.transaction(async (tx) => {
        const rows = await tx
          .insert(childGymMembershipsTable)
          .values({ childId: b.childId!, gymId: b.gymId, status: "pending", requestedBy: uid })
          .onConflictDoNothing()
          .returning();
        if (rows[0]) await recordHistory(tx, { gymId: b.gymId, childId: b.childId, actorUserId: uid, actorRole: "parent", entity: "membership", entityId: rows[0].id, action: "requested" });
        return rows[0] ?? null;
      });
      res.status(out ? 201 : 200).json({ ok: true, alreadyOpen: !out, request: out ? { id: out.id, kind: "junior", status: "pending", gymId: gym.id, gymName: gym.name } : null });
      return;
    }

    const [staff] = await db
      .select({ id: gymStaffTable.id })
      .from(gymStaffTable)
      .where(and(eq(gymStaffTable.gymId, b.gymId), eq(gymStaffTable.userId, uid), eq(gymStaffTable.status, "active")));
    if (staff) throw new JuniorError(409, "ALREADY_STAFF", "You already work at this gym");
    const out = await db.transaction(async (tx) => {
      const rows = await tx.insert(gymMembershipsTable).values({ gymId: b.gymId, userId: uid, status: "pending" }).onConflictDoNothing().returning();
      if (rows[0]) await recordHistory(tx, { gymId: b.gymId, actorUserId: uid, actorRole: "system", entity: "gym_membership", entityId: rows[0].id, action: "requested" });
      return rows[0] ?? null;
    });
    res.status(out ? 201 : 200).json({ ok: true, alreadyOpen: !out, request: out ? { id: out.id, kind: "member", status: "pending", gymId: gym.id, gymName: gym.name } : null });
  }),
);

const shown = (s: string) => (s === "rejected" ? "declined" : s);

/** My requests: my own (member) and those I made for juniors I am a guardian of. */
router.get(
  "/gym-join-requests",
  h(async (req, res) => {
    const uid = userId(req);
    const mine = await db
      .select({
        id: gymMembershipsTable.id,
        status: gymMembershipsTable.status,
        gymId: gymsTable.id,
        gymName: gymsTable.name,
        city: gymsTable.location,
        requestedAt: gymMembershipsTable.createdAt,
        decidedAt: gymMembershipsTable.decidedAt,
        showOnBoard: gymMembershipsTable.showOnBoard,
      })
      .from(gymMembershipsTable)
      .innerJoin(gymsTable, eq(gymsTable.id, gymMembershipsTable.gymId))
      .where(and(eq(gymMembershipsTable.userId, uid), inArray(gymMembershipsTable.status, ["pending", "approved", "rejected", "cancelled"])))
      .orderBy(desc(gymMembershipsTable.createdAt))
      .limit(50);
    const kids = await db
      .select({
        id: childGymMembershipsTable.id,
        status: childGymMembershipsTable.status,
        gymId: gymsTable.id,
        gymName: gymsTable.name,
        city: gymsTable.location,
        childId: childrenTable.id,
        childName: childrenTable.displayName,
        requestedAt: childGymMembershipsTable.createdAt,
        decidedAt: childGymMembershipsTable.decidedAt,
      })
      .from(childGymMembershipsTable)
      .innerJoin(gymsTable, eq(gymsTable.id, childGymMembershipsTable.gymId))
      .innerJoin(childrenTable, eq(childrenTable.id, childGymMembershipsTable.childId))
      .innerJoin(guardianLinksTable, and(eq(guardianLinksTable.childId, childrenTable.id), eq(guardianLinksTable.userId, uid), eq(guardianLinksTable.status, "active")))
      .where(and(eq(childrenTable.status, "active"), inArray(childGymMembershipsTable.status, ["pending", "approved", "rejected", "cancelled"])))
      .orderBy(desc(childGymMembershipsTable.createdAt))
      .limit(50);
    const requests = [
      ...mine.map((r) => ({ ...r, kind: "member" as const, status: shown(r.status), childId: null as string | null, childName: null as string | null })),
      ...kids.map((r) => ({ ...r, kind: "junior" as const, status: shown(r.status), showOnBoard: null as boolean | null })),
    ].sort((a, b) => b.requestedAt.getTime() - a.requestedAt.getTime());
    res.json({ requests });
  }),
);

/** Cancel while still pending. Decided requests cannot be cancelled (leave the gym instead). */
router.post(
  "/gym-join-requests/:id/cancel",
  h(async (req, res) => {
    const uid = userId(req);
    const id = uuidParam(req, "id");
    const done = await db.transaction(async (tx) => {
      const [m] = await tx.select().from(gymMembershipsTable).where(and(eq(gymMembershipsTable.id, id), eq(gymMembershipsTable.userId, uid))).for("update");
      if (m) {
        if (m.status !== "pending") throw new JuniorError(409, "NOT_PENDING", "Only a pending request can be cancelled");
        await tx.update(gymMembershipsTable).set({ status: "cancelled" }).where(eq(gymMembershipsTable.id, id));
        await recordHistory(tx, { gymId: m.gymId, actorUserId: uid, actorRole: "system", entity: "gym_membership", entityId: id, action: "cancelled" });
        return true;
      }
      const [c] = await tx.select().from(childGymMembershipsTable).where(eq(childGymMembershipsTable.id, id)).for("update");
      if (!c) return false;
      await assertGuardian(uid, c.childId, tx);
      if (c.status !== "pending") throw new JuniorError(409, "NOT_PENDING", "Only a pending request can be cancelled");
      await tx.update(childGymMembershipsTable).set({ status: "cancelled" }).where(eq(childGymMembershipsTable.id, id));
      await recordHistory(tx, { gymId: c.gymId, childId: c.childId, actorUserId: uid, actorRole: "parent", entity: "membership", entityId: id, action: "cancelled" });
      return true;
    });
    if (!done) throw new JuniorError(404, "NOT_FOUND", "Not found");
    res.json({ ok: true });
  }),
);

/** An approved adult member leaves a gym (their request row becomes "ended"). */
router.post(
  "/gym-join-requests/:id/leave",
  h(async (req, res) => {
    const uid = userId(req);
    const id = uuidParam(req, "id");
    const rows = await db
      .update(gymMembershipsTable)
      .set({ status: "ended", endedAt: nowOf(req) })
      .where(and(eq(gymMembershipsTable.id, id), eq(gymMembershipsTable.userId, uid), eq(gymMembershipsTable.status, "approved")))
      .returning({ id: gymMembershipsTable.id, gymId: gymMembershipsTable.gymId });
    if (!rows.length) throw new JuniorError(404, "NOT_FOUND", "Not found");
    res.json({ ok: true });
  }),
);

/** An adult member chooses whether they appear by name on the gym board (default off). */
router.put(
  "/gym-memberships/:id/board",
  h(async (req, res) => {
    const uid = userId(req);
    const id = uuidParam(req, "id");
    const { showOnBoard } = parse(z.object({ showOnBoard: z.boolean() }), req.body);
    const rows = await db
      .update(gymMembershipsTable)
      .set({ showOnBoard })
      .where(and(eq(gymMembershipsTable.id, id), eq(gymMembershipsTable.userId, uid), eq(gymMembershipsTable.status, "approved")))
      .returning({ id: gymMembershipsTable.id });
    if (!rows.length) throw new JuniorError(404, "NOT_FOUND", "Not found");
    res.json({ ok: true, showOnBoard });
  }),
);

export default router;
