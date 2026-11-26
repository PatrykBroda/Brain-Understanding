-- Junior Portal phase 2. Additive and idempotent; drops nothing.
CREATE TABLE IF NOT EXISTS "child_privacy_settings" (
  "child_id" uuid PRIMARY KEY REFERENCES "children"("id") ON DELETE CASCADE,
  "coach_sees_wellbeing" boolean DEFAULT false NOT NULL,
  "team_sees_recognition" boolean DEFAULT true NOT NULL,
  "updated_by" text,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "individual_focuses" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "child_id" uuid NOT NULL REFERENCES "children"("id") ON DELETE CASCADE,
  "gym_id" uuid NOT NULL REFERENCES "gyms"("id") ON DELETE CASCADE,
  "category_id" uuid REFERENCES "focus_categories"("id") ON DELETE SET NULL,
  "title" text NOT NULL,
  "details" text DEFAULT '' NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "created_by" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "ended_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "individual_focuses_child_idx" ON "individual_focuses" ("child_id","status");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "star_awards" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "gym_id" uuid NOT NULL REFERENCES "gyms"("id") ON DELETE CASCADE,
  "group_id" uuid REFERENCES "class_groups"("id") ON DELETE SET NULL,
  "child_id" uuid NOT NULL REFERENCES "children"("id") ON DELETE CASCADE,
  "week_start" date NOT NULL,
  "note" text DEFAULT '' NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "awarded_by" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "withdrawn_at" timestamp with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "star_awards_active_uq" ON "star_awards" ("child_id","week_start") WHERE "status" = 'active';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "star_awards_gym_idx" ON "star_awards" ("gym_id","week_start");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "junior_notification_prefs" (
  "user_id" text PRIMARY KEY REFERENCES "users"("id") ON DELETE CASCADE,
  "timetable" boolean DEFAULT true NOT NULL,
  "observations" boolean DEFAULT true NOT NULL,
  "recognition" boolean DEFAULT true NOT NULL,
  "announcements" boolean DEFAULT true NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "entitlement_audit" (
  "id" bigserial PRIMARY KEY,
  "target_user_id" text NOT NULL,
  "gym_id" uuid,
  "child_id" uuid,
  "batch_id" text,
  "action" text NOT NULL,
  "source" text NOT NULL,
  "expires_at" timestamp with time zone,
  "actor_user_id" text,
  "reason" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "entitlement_audit_target_idx" ON "entitlement_audit" ("target_user_id","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "entitlement_audit_gym_idx" ON "entitlement_audit" ("gym_id","created_at");
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "entitlement_audit_guard"() RETURNS trigger AS $fn$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'entitlement_audit is append-only';
  END IF;
  IF TG_OP = 'DELETE' AND coalesce(current_setting('frame.allow_history_purge', true), '') <> 'on' THEN
    RAISE EXCEPTION 'entitlement_audit is append-only';
  END IF;
  RETURN OLD;
END;
$fn$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS "entitlement_audit_guard_trg" ON "entitlement_audit";
--> statement-breakpoint
CREATE TRIGGER "entitlement_audit_guard_trg" BEFORE UPDATE OR DELETE ON "entitlement_audit"
  FOR EACH ROW EXECUTE FUNCTION "entitlement_audit_guard"();
--> statement-breakpoint
ALTER TABLE "guardian_invites" ADD COLUMN IF NOT EXISTS "declined_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "guardian_invites" ADD COLUMN IF NOT EXISTS "cancelled_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "staff_invites" ADD COLUMN IF NOT EXISTS "declined_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "staff_invites" ADD COLUMN IF NOT EXISTS "cancelled_at" timestamp with time zone;
