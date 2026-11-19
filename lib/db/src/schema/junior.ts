import {
  pgTable,
  text,
  uuid,
  integer,
  boolean,
  date,
  timestamp,
  jsonb,
  bigserial,
  primaryKey,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { usersTable } from "./users";

// Junior Portal (lean pilot). Mirrors migration 0015_junior_portal.sql.
// Permissions come ONLY from guardian_links (parent -> child) and gym_staff (staff -> gym).
// user_roles is a UI preference and grants nothing.

const ts = (name: string) => timestamp(name, { withTimezone: true });

export const userRolesTable = pgTable(
  "user_roles",
  {
    userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    role: text("role").notNull(), // athlete | parent | coach
    lastActiveAt: ts("last_active_at").notNull().defaultNow(),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.role] })],
);

export const gymsTable = pgTable(
  "gyms",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    location: text("location").notNull().default(""),
    timezone: text("timezone").notNull().default("Asia/Bangkok"),
    status: text("status").notNull().default("active"),
    loggingWindowDays: integer("logging_window_days").notNull().default(30),
    showRecognitionToTeam: boolean("show_recognition_to_team").notNull().default(false),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("gyms_slug_uq").on(t.slug)],
);

export const gymStaffTable = pgTable(
  "gym_staff",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    gymId: uuid("gym_id").notNull().references(() => gymsTable.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    role: text("role").notNull(), // coach | admin
    status: text("status").notNull().default("active"), // active | revoked
    createdAt: ts("created_at").notNull().defaultNow(),
    revokedAt: ts("revoked_at"),
    revokedBy: text("revoked_by"),
  },
  (t) => [uniqueIndex("gym_staff_gym_user_uq").on(t.gymId, t.userId), index("gym_staff_user_idx").on(t.userId)],
);

export const staffInvitesTable = pgTable(
  "staff_invites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    gymId: uuid("gym_id").notNull().references(() => gymsTable.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: text("role").notNull(),
    tokenHash: text("token_hash").notNull(),
    expiresAt: ts("expires_at").notNull(),
    acceptedAt: ts("accepted_at"),
    declinedAt: ts("declined_at"),
    cancelledAt: ts("cancelled_at"),
    createdBy: text("created_by"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("staff_invites_token_uq").on(t.tokenHash)],
);

export const childrenTable = pgTable("children", {
  id: uuid("id").primaryKey().defaultRandom(),
  displayName: text("display_name").notNull(),
  birthYearMonth: text("birth_year_month").notNull(), // YYYY-MM
  createdBy: text("created_by"),
  status: text("status").notNull().default("active"),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const guardianLinksTable = pgTable(
  "guardian_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    childId: uuid("child_id").notNull().references(() => childrenTable.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    relationship: text("relationship").notNull().default("parent"),
    status: text("status").notNull().default("active"), // active | revoked
    invitedBy: text("invited_by"),
    createdAt: ts("created_at").notNull().defaultNow(),
    revokedAt: ts("revoked_at"),
    revokedBy: text("revoked_by"),
  },
  (t) => [uniqueIndex("guardian_links_child_user_uq").on(t.childId, t.userId), index("guardian_links_user_idx").on(t.userId)],
);

export const guardianInvitesTable = pgTable(
  "guardian_invites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    childId: uuid("child_id").notNull().references(() => childrenTable.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    tokenHash: text("token_hash").notNull(),
    expiresAt: ts("expires_at").notNull(),
    acceptedAt: ts("accepted_at"),
    declinedAt: ts("declined_at"),
    cancelledAt: ts("cancelled_at"),
    createdBy: text("created_by"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("guardian_invites_token_uq").on(t.tokenHash)],
);

export const childGymMembershipsTable = pgTable(
  "child_gym_memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    childId: uuid("child_id").notNull().references(() => childrenTable.id, { onDelete: "cascade" }),
    gymId: uuid("gym_id").notNull().references(() => gymsTable.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("pending"), // pending | approved | rejected | ended
    requestedBy: text("requested_by"),
    decidedBy: text("decided_by"),
    decidedAt: ts("decided_at"),
    endedAt: ts("ended_at"),
    endReason: text("end_reason"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("child_gym_memberships_open_uq")
      .on(t.childId, t.gymId)
      .where(sql`${t.status} IN ('pending','approved')`),
  ],
);

export const classGroupsTable = pgTable("class_groups", {
  id: uuid("id").primaryKey().defaultRandom(),
  gymId: uuid("gym_id").notNull().references(() => gymsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  ageBand: text("age_band").notNull().default(""),
  active: boolean("active").notNull().default(true),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const groupMembershipsTable = pgTable(
  "group_memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    childId: uuid("child_id").notNull().references(() => childrenTable.id, { onDelete: "cascade" }),
    groupId: uuid("group_id").notNull().references(() => classGroupsTable.id, { onDelete: "cascade" }),
    effectiveFrom: ts("effective_from").notNull().defaultNow(),
    effectiveTo: ts("effective_to"),
  },
  (t) => [uniqueIndex("group_memberships_open_uq").on(t.childId).where(sql`${t.effectiveTo} IS NULL`)],
);

export const classSchedulesTable = pgTable("class_schedules", {
  id: uuid("id").primaryKey().defaultRandom(),
  gymId: uuid("gym_id").notNull().references(() => gymsTable.id, { onDelete: "cascade" }),
  groupId: uuid("group_id").notNull().references(() => classGroupsTable.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  weekday: integer("weekday").notNull(), // 0 = Sunday
  startLocal: text("start_local").notNull(), // HH:MM in gym tz
  endLocal: text("end_local").notNull(),
  coachUserId: text("coach_user_id"),
  effectiveFrom: date("effective_from", { mode: "string" }).notNull(),
  effectiveTo: date("effective_to", { mode: "string" }),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const classOccurrencesTable = pgTable(
  "class_occurrences",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    gymId: uuid("gym_id").notNull().references(() => gymsTable.id, { onDelete: "cascade" }),
    groupId: uuid("group_id").notNull().references(() => classGroupsTable.id, { onDelete: "cascade" }),
    scheduleId: uuid("schedule_id").references(() => classSchedulesTable.id, { onDelete: "set null" }),
    originalDate: date("original_date", { mode: "string" }).notNull(),
    startsAt: ts("starts_at").notNull(),
    endsAt: ts("ends_at").notNull(),
    title: text("title").notNull(),
    coachUserId: text("coach_user_id"),
    status: text("status").notNull().default("scheduled"), // scheduled | cancelled
    edited: boolean("edited").notNull().default(false),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("class_occurrences_schedule_date_uq").on(t.scheduleId, t.originalDate).where(sql`${t.scheduleId} IS NOT NULL`),
    index("class_occurrences_gym_start_idx").on(t.gymId, t.startsAt),
  ],
);

export const focusCategoriesTable = pgTable("focus_categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  gymId: uuid("gym_id").notNull().references(() => gymsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  sort: integer("sort").notNull().default(0),
  active: boolean("active").notNull().default(true),
});

export const weeklyFocusesTable = pgTable(
  "weekly_focuses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    groupId: uuid("group_id").notNull().references(() => classGroupsTable.id, { onDelete: "cascade" }),
    weekStart: date("week_start", { mode: "string" }).notNull(),
  },
  (t) => [uniqueIndex("weekly_focuses_group_week_uq").on(t.groupId, t.weekStart)],
);

export const weeklyFocusVersionsTable = pgTable(
  "weekly_focus_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    weeklyFocusId: uuid("weekly_focus_id").notNull().references(() => weeklyFocusesTable.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    categoryId: uuid("category_id").references(() => focusCategoriesTable.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    practiceDetails: text("practice_details").notNull().default(""),
    createdBy: text("created_by"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("weekly_focus_versions_uq").on(t.weeklyFocusId, t.version)],
);

export const attendanceLogsTable = pgTable(
  "attendance_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    childId: uuid("child_id").notNull().references(() => childrenTable.id, { onDelete: "cascade" }),
    occurrenceId: uuid("occurrence_id").notNull().references(() => classOccurrencesTable.id, { onDelete: "cascade" }),
    clientLogId: text("client_log_id").notNull(),
    status: text("status").notNull().default("active"), // active | undone | removed
    source: text("source").notNull().default("parent"),
    loggedBy: text("logged_by"),
    loggedAt: ts("logged_at").notNull().defaultNow(),
    occurrenceSnapshot: jsonb("occurrence_snapshot").$type<Record<string, unknown>>().notNull().default({}),
    focusVersionId: uuid("focus_version_id").references(() => weeklyFocusVersionsTable.id, { onDelete: "set null" }),
    undoneBy: text("undone_by"),
    undoneAt: ts("undone_at"),
    removedBy: text("removed_by"),
    removedAt: ts("removed_at"),
    removedReason: text("removed_reason"),
  },
  (t) => [
    uniqueIndex("attendance_logs_client_log_id_uq").on(t.clientLogId),
    uniqueIndex("attendance_logs_active_uq").on(t.childId, t.occurrenceId).where(sql`${t.status} = 'active'`),
    index("attendance_logs_child_idx").on(t.childId, t.loggedAt),
  ],
);

export const wellbeingEntriesTable = pgTable(
  "wellbeing_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    childId: uuid("child_id").notNull().references(() => childrenTable.id, { onDelete: "cascade" }),
    localDate: date("local_date", { mode: "string" }).notNull(),
    occurrenceId: uuid("occurrence_id").references(() => classOccurrencesTable.id, { onDelete: "set null" }),
    mood: integer("mood"),
    energy: integer("energy"),
    sleep: integer("sleep"),
    note: text("note").notNull().default(""),
    createdBy: text("created_by"),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("wellbeing_child_date_uq").on(t.childId, t.localDate)],
);

export const observationsTable = pgTable(
  "observations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    childId: uuid("child_id").notNull().references(() => childrenTable.id, { onDelete: "cascade" }),
    gymId: uuid("gym_id").notNull().references(() => gymsTable.id, { onDelete: "cascade" }),
    authorId: text("author_id"),
    visibility: text("visibility").notNull(), // shared | private
    body: text("body").notNull(),
    categoryId: uuid("category_id").references(() => focusCategoriesTable.id, { onDelete: "set null" }),
    occurrenceId: uuid("occurrence_id").references(() => classOccurrencesTable.id, { onDelete: "set null" }),
    status: text("status").notNull().default("active"), // active | withdrawn
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("observations_child_idx").on(t.childId, t.createdAt)],
);

export const milestoneRulesTable = pgTable(
  "milestone_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    gymId: uuid("gym_id").notNull().references(() => gymsTable.id, { onDelete: "cascade" }),
    kind: text("kind").notNull().default("session_count"),
    threshold: integer("threshold").notNull(),
    label: text("label").notNull(),
    active: boolean("active").notNull().default(true),
  },
  (t) => [uniqueIndex("milestone_rules_gym_threshold_uq").on(t.gymId, t.kind, t.threshold)],
);

export const milestoneStatesTable = pgTable(
  "milestone_states",
  {
    childId: uuid("child_id").notNull().references(() => childrenTable.id, { onDelete: "cascade" }),
    ruleId: uuid("rule_id").notNull().references(() => milestoneRulesTable.id, { onDelete: "cascade" }),
    status: text("status").notNull(), // reached | withdrawn
    reachedAt: ts("reached_at").notNull(),
    withdrawnAt: ts("withdrawn_at"),
  },
  (t) => [primaryKey({ columns: [t.childId, t.ruleId] })],
);

export const announcementsTable = pgTable(
  "announcements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    gymId: uuid("gym_id").notNull().references(() => gymsTable.id, { onDelete: "cascade" }),
    groupId: uuid("group_id").references(() => classGroupsTable.id, { onDelete: "cascade" }),
    kind: text("kind").notNull().default("general"), // timetable | general
    title: text("title").notNull(),
    body: text("body").notNull().default(""),
    occurrenceId: uuid("occurrence_id").references(() => classOccurrencesTable.id, { onDelete: "set null" }),
    publishedBy: text("published_by"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("announcements_gym_idx").on(t.gymId, t.createdAt)],
);

export const announcementReadsTable = pgTable(
  "announcement_reads",
  {
    announcementId: uuid("announcement_id").notNull().references(() => announcementsTable.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    readAt: ts("read_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.announcementId, t.userId] })],
);

export const userEntitlementsTable = pgTable(
  "user_entitlements",
  {
    userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    entitlement: text("entitlement").notNull(), // frame_parent
    source: text("source").notNull(), // revenuecat | pilot | admin
    status: text("status").notNull().default("active"), // active | revoked | expired
    productId: text("product_id"),
    expiresAt: ts("expires_at"),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.entitlement, t.source] })],
);

export const changeHistoryTable = pgTable(
  "change_history",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    gymId: uuid("gym_id"),
    childId: uuid("child_id"),
    actorUserId: text("actor_user_id"),
    actorRole: text("actor_role").notNull(),
    entity: text("entity").notNull(),
    entityId: text("entity_id"),
    action: text("action").notNull(),
    before: jsonb("before"),
    after: jsonb("after"),
    reason: text("reason"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("change_history_child_idx").on(t.childId, t.createdAt), index("change_history_gym_idx").on(t.gymId, t.createdAt)],
);

// -- Phase 2 (migration 0016_junior_phase2.sql) --------------------------------
export const childPrivacySettingsTable = pgTable("child_privacy_settings", {
  childId: uuid("child_id").primaryKey().references(() => childrenTable.id, { onDelete: "cascade" }),
  coachSeesWellbeing: boolean("coach_sees_wellbeing").notNull().default(false),
  teamSeesRecognition: boolean("team_sees_recognition").notNull().default(true),
  updatedBy: text("updated_by"),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const individualFocusesTable = pgTable(
  "individual_focuses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    childId: uuid("child_id").notNull().references(() => childrenTable.id, { onDelete: "cascade" }),
    gymId: uuid("gym_id").notNull().references(() => gymsTable.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id").references(() => focusCategoriesTable.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    details: text("details").notNull().default(""),
    status: text("status").notNull().default("active"), // active | ended
    createdBy: text("created_by"),
    createdAt: ts("created_at").notNull().defaultNow(),
    endedAt: ts("ended_at"),
  },
  (t) => [index("individual_focuses_child_idx").on(t.childId, t.status)],
);

export const starAwardsTable = pgTable(
  "star_awards",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    gymId: uuid("gym_id").notNull().references(() => gymsTable.id, { onDelete: "cascade" }),
    groupId: uuid("group_id").references(() => classGroupsTable.id, { onDelete: "set null" }),
    childId: uuid("child_id").notNull().references(() => childrenTable.id, { onDelete: "cascade" }),
    weekStart: date("week_start", { mode: "string" }).notNull(),
    note: text("note").notNull().default(""),
    status: text("status").notNull().default("active"), // active | withdrawn
    awardedBy: text("awarded_by"),
    createdAt: ts("created_at").notNull().defaultNow(),
    withdrawnAt: ts("withdrawn_at"),
  },
  (t) => [
    uniqueIndex("star_awards_active_uq").on(t.childId, t.weekStart).where(sql`${t.status} = 'active'`),
    index("star_awards_gym_idx").on(t.gymId, t.weekStart),
  ],
);

export const juniorNotificationPrefsTable = pgTable("junior_notification_prefs", {
  userId: text("user_id").primaryKey().references(() => usersTable.id, { onDelete: "cascade" }),
  timetable: boolean("timetable").notNull().default(true),
  observations: boolean("observations").notNull().default(true),
  recognition: boolean("recognition").notNull().default(true),
  announcements: boolean("announcements").notNull().default(true),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const entitlementAuditTable = pgTable(
  "entitlement_audit",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    targetUserId: text("target_user_id").notNull(),
    gymId: uuid("gym_id"),
    childId: uuid("child_id"),
    batchId: text("batch_id"),
    action: text("action").notNull(), // granted | revoked
    source: text("source").notNull(),
    expiresAt: ts("expires_at"),
    actorUserId: text("actor_user_id"),
    reason: text("reason"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("entitlement_audit_target_idx").on(t.targetUserId, t.createdAt), index("entitlement_audit_gym_idx").on(t.gymId, t.createdAt)],
);
