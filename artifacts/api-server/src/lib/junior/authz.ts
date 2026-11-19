import { and, desc, eq, isNull } from "drizzle-orm";
import {
  db,
  childGymMembershipsTable,
  childrenTable,
  groupMembershipsTable,
  guardianLinksTable,
  gymStaffTable,
  gymsTable,
} from "@workspace/db";
import { JuniorError } from "./http";
import type { DbLike } from "./history";

/**
 * The authorisation layer for every /api/junior route. Roles are NEVER read from the JWT:
 * every check below reads the database on each request, so a revoked guardian or staff row stops
 * working on the very next call.
 *
 *  - Staff permission comes only from an ACTIVE gym_staff row (user_roles grants nothing).
 *  - Parent permission comes only from an ACTIVE guardian_links row; gym-sourced data
 *    additionally needs an APPROVED child_gym_memberships row.
 *  - "No access" and "does not exist" look identical (404) so ids cannot be probed.
 */

export type StaffRole = "coach" | "admin";
export interface StaffRow {
  id: string;
  gymId: string;
  userId: string;
  role: StaffRole;
}

export async function getActiveStaff(userId: string, gymId: string, conn: DbLike = db): Promise<StaffRow | null> {
  const [row] = await conn
    .select({ id: gymStaffTable.id, gymId: gymStaffTable.gymId, userId: gymStaffTable.userId, role: gymStaffTable.role })
    .from(gymStaffTable)
    .innerJoin(gymsTable, eq(gymsTable.id, gymStaffTable.gymId))
    .where(and(eq(gymStaffTable.gymId, gymId), eq(gymStaffTable.userId, userId), eq(gymStaffTable.status, "active"), eq(gymsTable.status, "active")))
    .limit(1);
  return row ? { ...row, role: row.role as StaffRole } : null;
}

/** requireGymStaff(gymId, minRole): active staff row at that gym (admin satisfies coach). 404 otherwise. */
export async function requireGymStaff(userId: string, gymId: string, min: StaffRole = "coach", conn: DbLike = db): Promise<StaffRow> {
  const staff = await getActiveStaff(userId, gymId, conn);
  if (!staff) throw new JuniorError(404, "NOT_FOUND", "Not found");
  if (min === "admin" && staff.role !== "admin") throw new JuniorError(403, "ADMIN_REQUIRED", "Gym admin only");
  return staff;
}

export interface GuardianLink {
  id: string;
  childId: string;
  userId: string;
}

export async function getActiveGuardianLink(userId: string, childId: string, conn: DbLike = db): Promise<GuardianLink | null> {
  const [row] = await conn
    .select({ id: guardianLinksTable.id, childId: guardianLinksTable.childId, userId: guardianLinksTable.userId })
    .from(guardianLinksTable)
    .innerJoin(childrenTable, eq(childrenTable.id, guardianLinksTable.childId))
    .where(
      and(
        eq(guardianLinksTable.childId, childId),
        eq(guardianLinksTable.userId, userId),
        eq(guardianLinksTable.status, "active"),
        eq(childrenTable.status, "active"),
      ),
    )
    .limit(1);
  return row ?? null;
}

export interface ApprovedMembership {
  id: string;
  gymId: string;
  groupId: string | null;
}

/** The child's approved gym membership (pilot: one gym; if several, the most recently approved) with current group. */
export async function getApprovedMembership(childId: string, conn: DbLike = db): Promise<ApprovedMembership | null> {
  const [m] = await conn
    .select({ id: childGymMembershipsTable.id, gymId: childGymMembershipsTable.gymId })
    .from(childGymMembershipsTable)
    .innerJoin(gymsTable, eq(gymsTable.id, childGymMembershipsTable.gymId))
    .where(and(eq(childGymMembershipsTable.childId, childId), eq(childGymMembershipsTable.status, "approved"), eq(gymsTable.status, "active")))
    .orderBy(desc(childGymMembershipsTable.decidedAt))
    .limit(1);
  if (!m) return null;
  const groupId = await getCurrentGroupId(childId, conn);
  return { ...m, groupId };
}

export async function getCurrentGroupId(childId: string, conn: DbLike = db): Promise<string | null> {
  const [g] = await conn
    .select({ groupId: groupMembershipsTable.groupId })
    .from(groupMembershipsTable)
    .where(and(eq(groupMembershipsTable.childId, childId), isNull(groupMembershipsTable.effectiveTo)))
    .limit(1);
  return g?.groupId ?? null;
}

/** Parent-side, child-profile-only access (no gym data): active guardian link. */
export async function assertGuardian(userId: string, childId: string, conn: DbLike = db): Promise<GuardianLink> {
  const link = await getActiveGuardianLink(userId, childId, conn);
  if (!link) throw new JuniorError(404, "NOT_FOUND", "Not found");
  return link;
}

/** Parent-side access to GYM-SOURCED data (timetable, focus, observations): guardian + approved membership. */
export async function assertGuardianWithGym(userId: string, childId: string, conn: DbLike = db) {
  const link = await assertGuardian(userId, childId, conn);
  const membership = await getApprovedMembership(childId, conn);
  if (!membership) throw new JuniorError(403, "MEMBERSHIP_NOT_APPROVED", "The gym has not approved this child yet");
  return { link, membership };
}

/** Staff-side access to a child: active staff at a gym where the child has an APPROVED membership. */
export async function assertStaffForChild(userId: string, childId: string, min: StaffRole = "coach", conn: DbLike = db) {
  const memberships = await conn
    .select({ id: childGymMembershipsTable.id, gymId: childGymMembershipsTable.gymId })
    .from(childGymMembershipsTable)
    .innerJoin(childrenTable, eq(childrenTable.id, childGymMembershipsTable.childId))
    .where(and(eq(childGymMembershipsTable.childId, childId), eq(childGymMembershipsTable.status, "approved"), eq(childrenTable.status, "active")));
  for (const m of memberships) {
    const staff = await getActiveStaff(userId, m.gymId, conn);
    if (staff) {
      if (min === "admin" && staff.role !== "admin") throw new JuniorError(403, "ADMIN_REQUIRED", "Gym admin only");
      return { staff, gymId: m.gymId, membershipId: m.id };
    }
  }
  throw new JuniorError(404, "NOT_FOUND", "Not found");
}

export type AccessPurpose = "profile" | "gym_data" | "private_notes";

/**
 * canAccessChild(userId, childId, purpose): one decision point for tests and routes.
 *  - profile: guardian (the child's own profile; works while membership is pending).
 *  - gym_data: guardian with approved membership, or staff of the approved gym.
 *  - private_notes: staff only (never a parent).
 */
export async function canAccessChild(
  userId: string,
  childId: string,
  purpose: AccessPurpose,
  conn: DbLike = db,
): Promise<{ as: "guardian" | "staff"; gymId?: string } | null> {
  if (purpose !== "private_notes") {
    const link = await getActiveGuardianLink(userId, childId, conn);
    if (link) {
      if (purpose === "profile") return { as: "guardian" };
      const m = await getApprovedMembership(childId, conn);
      if (m) return { as: "guardian", gymId: m.gymId };
    }
  }
  try {
    const s = await assertStaffForChild(userId, childId, "coach", conn);
    return { as: "staff", gymId: s.gymId };
  } catch {
    return null;
  }
}
