-- Junior Portal (lean pilot). Additive and idempotent: only CREATE ... IF NOT EXISTS, nothing dropped or altered.
-- Apply: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -1 -f lib/db/migrations/0015_junior_portal.sql

-- UI preference only: which views a person has opened. Grants NOTHING (permissions come from
-- guardian_links and gym_staff).
CREATE TABLE IF NOT EXISTS "user_roles" (
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "role" text NOT NULL CHECK ("role" IN ('athlete','parent','coach')),
  "last_active_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY ("user_id","role")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "gyms" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "slug" text NOT NULL,
  "location" text DEFAULT '' NOT NULL,
  "timezone" text DEFAULT 'Asia/Bangkok' NOT NULL,
  "status" text DEFAULT 'active' NOT NULL CHECK ("status" IN ('active','inactive')),
  "logging_window_days" integer DEFAULT 30 NOT NULL,
  "show_recognition_to_team" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "gyms_slug_uq" ON "gyms" ("slug");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "gym_staff" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "gym_id" uuid NOT NULL REFERENCES "gyms"("id") ON DELETE CASCADE,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "role" text NOT NULL CHECK ("role" IN ('coach','admin')),
  "status" text DEFAULT 'active' NOT NULL CHECK ("status" IN ('active','revoked')),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "revoked_at" timestamp with time zone,
  "revoked_by" text
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "gym_staff_gym_user_uq" ON "gym_staff" ("gym_id","user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "gym_staff_user_idx" ON "gym_staff" ("user_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "staff_invites" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "gym_id" uuid NOT NULL REFERENCES "gyms"("id") ON DELETE CASCADE,
  "email" text NOT NULL,
  "role" text NOT NULL CHECK ("role" IN ('coach','admin')),
  "token_hash" text NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "accepted_at" timestamp with time zone,
  "created_by" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "staff_invites_token_uq" ON "staff_invites" ("token_hash");
--> statement-breakpoint
-- Minimum child data: nickname + birth year-month. No photo, no surname required.
CREATE TABLE IF NOT EXISTS "children" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "display_name" text NOT NULL,
  "birth_year_month" text NOT NULL CHECK ("birth_year_month" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  "created_by" text,
  "status" text DEFAULT 'active' NOT NULL CHECK ("status" IN ('active','deleted')),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "guardian_links" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "child_id" uuid NOT NULL REFERENCES "children"("id") ON DELETE CASCADE,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "relationship" text DEFAULT 'parent' NOT NULL,
  "status" text DEFAULT 'active' NOT NULL CHECK ("status" IN ('active','revoked')),
  "invited_by" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "revoked_at" timestamp with time zone,
  "revoked_by" text
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "guardian_links_child_user_uq" ON "guardian_links" ("child_id","user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "guardian_links_user_idx" ON "guardian_links" ("user_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "guardian_invites" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "child_id" uuid NOT NULL REFERENCES "children"("id") ON DELETE CASCADE,
  "email" text NOT NULL,
  "token_hash" text NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "accepted_at" timestamp with time zone,
  "created_by" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "guardian_invites_token_uq" ON "guardian_invites" ("token_hash");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "child_gym_memberships" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "child_id" uuid NOT NULL REFERENCES "children"("id") ON DELETE CASCADE,
  "gym_id" uuid NOT NULL REFERENCES "gyms"("id") ON DELETE CASCADE,
  "status" text DEFAULT 'pending' NOT NULL CHECK ("status" IN ('pending','approved','rejected','ended')),
  "requested_by" text,
  "decided_by" text,
  "decided_at" timestamp with time zone,
  "ended_at" timestamp with time zone,
  "end_reason" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "child_gym_memberships_open_uq"
  ON "child_gym_memberships" ("child_id","gym_id") WHERE "status" IN ('pending','approved');
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "class_groups" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "gym_id" uuid NOT NULL REFERENCES "gyms"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "age_band" text DEFAULT '' NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "group_memberships" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "child_id" uuid NOT NULL REFERENCES "children"("id") ON DELETE CASCADE,
  "group_id" uuid NOT NULL REFERENCES "class_groups"("id") ON DELETE CASCADE,
  "effective_from" timestamp with time zone DEFAULT now() NOT NULL,
  "effective_to" timestamp with time zone
);
--> statement-breakpoint
-- A child is in at most one group at a time (open row = effective_to IS NULL).
CREATE UNIQUE INDEX IF NOT EXISTS "group_memberships_open_uq" ON "group_memberships" ("child_id") WHERE "effective_to" IS NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "class_schedules" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "gym_id" uuid NOT NULL REFERENCES "gyms"("id") ON DELETE CASCADE,
  "group_id" uuid NOT NULL REFERENCES "class_groups"("id") ON DELETE CASCADE,
  "title" text NOT NULL,
  "weekday" integer NOT NULL CHECK ("weekday" BETWEEN 0 AND 6),
  "start_local" text NOT NULL CHECK ("start_local" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  "end_local" text NOT NULL CHECK ("end_local" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  "coach_user_id" text,
  "effective_from" date NOT NULL,
  "effective_to" date,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "class_occurrences" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "gym_id" uuid NOT NULL REFERENCES "gyms"("id") ON DELETE CASCADE,
  "group_id" uuid NOT NULL REFERENCES "class_groups"("id") ON DELETE CASCADE,
  "schedule_id" uuid REFERENCES "class_schedules"("id") ON DELETE SET NULL,
  "original_date" date NOT NULL,
  "starts_at" timestamp with time zone NOT NULL,
  "ends_at" timestamp with time zone NOT NULL,
  "title" text NOT NULL,
  "coach_user_id" text,
  "status" text DEFAULT 'scheduled' NOT NULL CHECK ("status" IN ('scheduled','cancelled')),
  "edited" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "class_occurrences_schedule_date_uq"
  ON "class_occurrences" ("schedule_id","original_date") WHERE "schedule_id" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "class_occurrences_gym_start_idx" ON "class_occurrences" ("gym_id","starts_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "focus_categories" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "gym_id" uuid NOT NULL REFERENCES "gyms"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "sort" integer DEFAULT 0 NOT NULL,
  "active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "weekly_focuses" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "group_id" uuid NOT NULL REFERENCES "class_groups"("id") ON DELETE CASCADE,
  "week_start" date NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "weekly_focuses_group_week_uq" ON "weekly_focuses" ("group_id","week_start");
--> statement-breakpoint
-- Append-only: editing a focus inserts a new version.
CREATE TABLE IF NOT EXISTS "weekly_focus_versions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "weekly_focus_id" uuid NOT NULL REFERENCES "weekly_focuses"("id") ON DELETE CASCADE,
  "version" integer NOT NULL,
  "category_id" uuid REFERENCES "focus_categories"("id") ON DELETE SET NULL,
  "title" text NOT NULL,
  "practice_details" text DEFAULT '' NOT NULL,
  "created_by" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "weekly_focus_versions_uq" ON "weekly_focus_versions" ("weekly_focus_id","version");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "attendance_logs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "child_id" uuid NOT NULL REFERENCES "children"("id") ON DELETE CASCADE,
  "occurrence_id" uuid NOT NULL REFERENCES "class_occurrences"("id") ON DELETE CASCADE,
  "client_log_id" text NOT NULL,
  "status" text DEFAULT 'active' NOT NULL CHECK ("status" IN ('active','undone','removed')),
  "source" text DEFAULT 'parent' NOT NULL,
  "logged_by" text,
  "logged_at" timestamp with time zone DEFAULT now() NOT NULL,
  "occurrence_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "focus_version_id" uuid REFERENCES "weekly_focus_versions"("id") ON DELETE SET NULL,
  "undone_by" text,
  "undone_at" timestamp with time zone,
  "removed_by" text,
  "removed_at" timestamp with time zone,
  "removed_reason" text
);
--> statement-breakpoint
-- Idempotency (same pattern as messages.client_message_id): one row per client intent...
CREATE UNIQUE INDEX IF NOT EXISTS "attendance_logs_client_log_id_uq" ON "attendance_logs" ("client_log_id");
--> statement-breakpoint
-- ...and at most one ACTIVE log per child per class, however many guardians, taps or retries.
CREATE UNIQUE INDEX IF NOT EXISTS "attendance_logs_active_uq"
  ON "attendance_logs" ("child_id","occurrence_id") WHERE "status" = 'active';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "attendance_logs_child_idx" ON "attendance_logs" ("child_id","logged_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "wellbeing_entries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "child_id" uuid NOT NULL REFERENCES "children"("id") ON DELETE CASCADE,
  "local_date" date NOT NULL,
  "occurrence_id" uuid REFERENCES "class_occurrences"("id") ON DELETE SET NULL,
  "mood" integer CHECK ("mood" BETWEEN 1 AND 3),
  "energy" integer CHECK ("energy" BETWEEN 1 AND 3),
  "sleep" integer CHECK ("sleep" BETWEEN 1 AND 3),
  "note" text DEFAULT '' NOT NULL,
  "created_by" text,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "wellbeing_child_date_uq" ON "wellbeing_entries" ("child_id","local_date");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "observations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "child_id" uuid NOT NULL REFERENCES "children"("id") ON DELETE CASCADE,
  "gym_id" uuid NOT NULL REFERENCES "gyms"("id") ON DELETE CASCADE,
  "author_id" text,
  "visibility" text NOT NULL CHECK ("visibility" IN ('shared','private')),
  "body" text NOT NULL,
  "category_id" uuid REFERENCES "focus_categories"("id") ON DELETE SET NULL,
  "occurrence_id" uuid REFERENCES "class_occurrences"("id") ON DELETE SET NULL,
  "status" text DEFAULT 'active' NOT NULL CHECK ("status" IN ('active','withdrawn')),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "observations_child_idx" ON "observations" ("child_id","created_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "milestone_rules" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "gym_id" uuid NOT NULL REFERENCES "gyms"("id") ON DELETE CASCADE,
  "kind" text DEFAULT 'session_count' NOT NULL,
  "threshold" integer NOT NULL CHECK ("threshold" > 0),
  "label" text NOT NULL,
  "active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "milestone_rules_gym_threshold_uq" ON "milestone_rules" ("gym_id","kind","threshold");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "milestone_states" (
  "child_id" uuid NOT NULL REFERENCES "children"("id") ON DELETE CASCADE,
  "rule_id" uuid NOT NULL REFERENCES "milestone_rules"("id") ON DELETE CASCADE,
  "status" text NOT NULL CHECK ("status" IN ('reached','withdrawn')),
  "reached_at" timestamp with time zone NOT NULL,
  "withdrawn_at" timestamp with time zone,
  PRIMARY KEY ("child_id","rule_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "announcements" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "gym_id" uuid NOT NULL REFERENCES "gyms"("id") ON DELETE CASCADE,
  "group_id" uuid REFERENCES "class_groups"("id") ON DELETE CASCADE,
  "kind" text DEFAULT 'general' NOT NULL CHECK ("kind" IN ('timetable','general')),
  "title" text NOT NULL,
  "body" text DEFAULT '' NOT NULL,
  "occurrence_id" uuid REFERENCES "class_occurrences"("id") ON DELETE SET NULL,
  "published_by" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "announcements_gym_idx" ON "announcements" ("gym_id","created_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "announcement_reads" (
  "announcement_id" uuid NOT NULL REFERENCES "announcements"("id") ON DELETE CASCADE,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "read_at" timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY ("announcement_id","user_id")
);
--> statement-breakpoint
-- Server-granted entitlements. source pilot/admin = granted by a FRAME admin; revenuecat is reserved
-- for the later paid parent plan. The existing users.* columns keep serving frame_plus untouched.
CREATE TABLE IF NOT EXISTS "user_entitlements" (
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "entitlement" text NOT NULL,
  "source" text NOT NULL CHECK ("source" IN ('revenuecat','pilot','admin')),
  "status" text DEFAULT 'active' NOT NULL CHECK ("status" IN ('active','revoked','expired')),
  "product_id" text,
  "expires_at" timestamp with time zone,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY ("user_id","entitlement","source")
);
--> statement-breakpoint
-- Append-only audit trail. No foreign keys on purpose: history must outlive the rows it describes.
CREATE TABLE IF NOT EXISTS "change_history" (
  "id" bigserial PRIMARY KEY NOT NULL,
  "gym_id" uuid,
  "child_id" uuid,
  "actor_user_id" text,
  "actor_role" text NOT NULL,
  "entity" text NOT NULL,
  "entity_id" text,
  "action" text NOT NULL,
  "before" jsonb,
  "after" jsonb,
  "reason" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "change_history_child_idx" ON "change_history" ("child_id","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "change_history_gym_idx" ON "change_history" ("gym_id","created_at");
--> statement-breakpoint
-- UPDATE is always rejected. DELETE is rejected unless the transaction opted in with
-- SET LOCAL frame.allow_history_purge = 'on' (only the account/child deletion code does this).
CREATE OR REPLACE FUNCTION "change_history_guard"() RETURNS trigger AS $fn$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'change_history is append-only';
  END IF;
  IF TG_OP = 'DELETE' AND coalesce(current_setting('frame.allow_history_purge', true), '') <> 'on' THEN
    RAISE EXCEPTION 'change_history is append-only';
  END IF;
  RETURN OLD;
END;
$fn$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS "change_history_guard_trg" ON "change_history";
--> statement-breakpoint
CREATE TRIGGER "change_history_guard_trg" BEFORE UPDATE OR DELETE ON "change_history"
  FOR EACH ROW EXECUTE FUNCTION "change_history_guard"();
