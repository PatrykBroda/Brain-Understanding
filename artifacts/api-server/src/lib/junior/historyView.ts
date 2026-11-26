
/**
 * Role-aware views over change_history. The table itself is the full audit trail; what each role
 * may SEE of it is decided here, in one place:
 *  - parent: only events about their own child that a parent is entitled to know. Private coach notes,
 *    other families, staff changes and raw before/after payloads never reach a parent.
 *  - coach: events about the child at their gym; not the family's own account events (guardians, profile).
 *  - gym admin: the whole gym feed (existing /gyms/:id/history).
 */

export interface HistoryRow {
  id: number;
  gymId: string | null;
  childId: string | null;
  actorUserId: string | null;
  actorRole: string;
  entity: string;
  entityId: string | null;
  action: string;
  before: unknown;
  after: unknown;
  reason: string | null;
  createdAt: Date;
}

const LABELS: Record<string, string> = {
  "child.created": "Child profile created",
  "child.updated": "Child profile updated",
  "guardian_link.invite_accepted": "A guardian accepted an invitation",
  "guardian_link.revoked": "A guardian's access was removed",
  "membership.requested": "Gym membership requested",
  "membership.approved": "Gym membership approved",
  "membership.rejected": "Gym membership was not approved",
  "membership.ended": "Gym membership ended",
  "group_membership.moved": "Moved to a different class group",
  "attendance_log.created": "Session logged",
  "attendance_log.undone": "Session log undone",
  "attendance_log.removed": "Session log removed",
  "milestone.reached": "Milestone reached",
  "milestone.withdrawn": "Milestone updated after a correction",
  "observation.created": "Coach note added",
  "observation.withdrawn": "Coach note withdrawn",
  "star_award.created": "Star of the Week awarded",
  "star_award.withdrawn": "Star of the Week withdrawn",
  "individual_focus.set": "Individual focus set",
  "individual_focus.ended": "Individual focus ended",
};

const label = (r: HistoryRow) => LABELS[`${r.entity}.${r.action}`] ?? `${r.entity} ${r.action}`;

const PARENT_KEYS = new Set([
  "child.created",
  "child.updated",
  "guardian_link.invite_accepted",
  "guardian_link.revoked",
  "membership.requested",
  "membership.approved",
  "membership.rejected",
  "membership.ended",
  "group_membership.moved",
  "attendance_log.created",
  "attendance_log.undone",
  "attendance_log.removed",
  "milestone.reached",
  "milestone.withdrawn",
  "star_award.created",
  "star_award.withdrawn",
  "individual_focus.set",
  "individual_focus.ended",
]);

function isSharedObservationCreated(r: HistoryRow): boolean {
  return r.entity === "observation" && r.action === "created" && (r.after as { visibility?: string } | null)?.visibility === "shared";
}

export function parentCanSee(r: HistoryRow): boolean {
  if (PARENT_KEYS.has(`${r.entity}.${r.action}`)) return true;
  return isSharedObservationCreated(r);
}

export interface ParentHistoryItem {
  id: number;
  at: Date;
  label: string;
  /** Who did it, as a role only (never another family's name or a coach's id). */
  by: "you" | "guardian" | "gym" | "system";
  reason: string | null;
}

export function toParentItem(r: HistoryRow, viewerId: string): ParentHistoryItem {
  const by = r.actorUserId === viewerId ? "you" : r.actorRole === "parent" ? "guardian" : r.actorRole === "system" ? "system" : "gym";
  return { id: r.id, at: r.createdAt, label: label(r), by, reason: r.reason };
}

const COACH_HIDDEN_ENTITIES = new Set(["child", "guardian_link"]);

export function coachCanSee(r: HistoryRow): boolean {
  return !COACH_HIDDEN_ENTITIES.has(r.entity);
}

export interface CoachHistoryItem {
  id: number;
  at: Date;
  label: string;
  actorRole: string;
  actorName: string | null;
  reason: string | null;
}

export function toCoachItem(r: HistoryRow, names: Map<string, string | null>): CoachHistoryItem {
  return { id: r.id, at: r.createdAt, label: label(r), actorRole: r.actorRole, actorName: r.actorUserId ? names.get(r.actorUserId) ?? null : null, reason: r.reason };
}

