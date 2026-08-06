-- ============================================================================
-- Migration 0001: Upgrade existing Clerk-keyed database to JWT auth schema
-- ============================================================================
-- PURPOSE
--   Databases that already have migration 0000 (Clerk-era) in their Drizzle
--   journal will skip the new migration 0000 (JWT baseline).  This migration
--   runs AFTER 0000, so it executes on both old and new installations:
--
--   A) Old Clerk-keyed database (users has clerk_user_id PK)
--      DO block detects clerk_user_id → drops all tables → CREATE TABLE
--      creates the full JWT schema.
--      DATA LOSS: all accounts and athlete data are deleted.
--      This is intentional — Clerk credentials cannot be ported.
--      After migration: re-register all users via POST /api/auth/register.
--
--   B) Already on JWT schema (0000 ran on a fresh DB, or was manually applied)
--      DO block finds no clerk_user_id → no-op.  CREATE TABLE statements are
--      preceded by a schema-check guard and skipped if tables already exist.
--
-- OPERATOR NOTE
--   This migration runs automatically via: pnpm --filter @workspace/db run migrate
--   No manual pre-step required.  scripts/reset-schema.sql is a manual
--   alternative for operators who prefer an explicit out-of-band reset.
-- ============================================================================

DO $$
BEGIN
  -- ── Case A: Old Clerk schema detected ──────────────────────────────────────
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'users'
      AND column_name  = 'clerk_user_id'
  ) THEN
    -- DATA LOSS ACCEPTED (see header).  Drop every application table so the
    -- subsequent CREATE TABLE statements build the JWT schema from scratch.
    DROP TABLE IF EXISTS "model_snapshots"              CASCADE;
    DROP TABLE IF EXISTS "google_oauth_states"          CASCADE;
    DROP TABLE IF EXISTS "daily_checkins"               CASCADE;
    DROP TABLE IF EXISTS "training_sessions"            CASCADE;
    DROP TABLE IF EXISTS "video_analyses"               CASCADE;
    DROP TABLE IF EXISTS "weekly_plan_item_completions" CASCADE;
    DROP TABLE IF EXISTS "weekly_plans"                 CASCADE;
    DROP TABLE IF EXISTS "attachments"                  CASCADE;
    DROP TABLE IF EXISTS "messages"                     CASCADE;
    DROP TABLE IF EXISTS "athlete_facts"                CASCADE;
    DROP TABLE IF EXISTS "athlete_signals"              CASCADE;
    DROP TABLE IF EXISTS "calibrations"                 CASCADE;
    DROP TABLE IF EXISTS "competitions"                 CASCADE;
    DROP TABLE IF EXISTS "conversations"                CASCADE;
    DROP TABLE IF EXISTS "google_calendar_connections"  CASCADE;
    DROP TABLE IF EXISTS "fighters"                     CASCADE;
    DROP TABLE IF EXISTS "users"                        CASCADE;

  -- ── Case B: Already on JWT schema — nothing to do ──────────────────────────
  -- The CREATE TABLE IF NOT EXISTS statements below are no-ops.
  END IF;
END $$;
--> statement-breakpoint

-- Create all JWT-schema tables.  IF NOT EXISTS makes each statement safe to
-- run when the table was already created by migration 0000 on a fresh database.
CREATE TABLE IF NOT EXISTS "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"hashed_password" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"subscription_status" text,
	"plan" text DEFAULT 'free' NOT NULL,
	"current_period_end" timestamp with time zone,
	"is_admin" boolean DEFAULT false NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "fighters" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"age" integer NOT NULL,
	"date_of_birth" date,
	"art" text NOT NULL,
	"primary_sport" text DEFAULT '' NOT NULL,
	"level" text NOT NULL,
	"training_frequency" text NOT NULL,
	"gym" text DEFAULT '' NOT NULL,
	"head_coach" text DEFAULT '' NOT NULL,
	"height_cm" integer,
	"weight_kg" integer,
	"reach_cm" integer,
	"weight_class" text DEFAULT '' NOT NULL,
	"stance" text DEFAULT '' NOT NULL,
	"record" text DEFAULT '' NOT NULL,
	"hero_image_url" text DEFAULT '' NOT NULL,
	"hero_pos_x" integer DEFAULT 50 NOT NULL,
	"hero_pos_y" integer DEFAULT 50 NOT NULL,
	"hero_zoom" integer DEFAULT 100 NOT NULL,
	"goals" text DEFAULT '' NOT NULL,
	"weaknesses" text DEFAULT '' NOT NULL,
	"competes" boolean DEFAULT false NOT NULL,
	"personality" text DEFAULT '' NOT NULL,
	"training_background" text DEFAULT '' NOT NULL,
	"bio" text DEFAULT '' NOT NULL,
	"spirit_animal" text DEFAULT '' NOT NULL,
	"spirit_animal_tagline" text DEFAULT '' NOT NULL,
	"vocabulary_level" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fighters_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "conversations" (
	"id" serial PRIMARY KEY NOT NULL,
	"fighter_id" integer NOT NULL,
	"ai_provider" text DEFAULT 'claude' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"conversation_id" integer NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "calibrations" (
	"id" serial PRIMARY KEY NOT NULL,
	"fighter_id" integer NOT NULL,
	"prompt_key" text NOT NULL,
	"prompt_text" text NOT NULL,
	"answer" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "athlete_signals" (
	"id" serial PRIMARY KEY NOT NULL,
	"fighter_id" integer NOT NULL,
	"signal" text NOT NULL,
	"source" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "athlete_facts" (
	"id" serial PRIMARY KEY NOT NULL,
	"fighter_id" integer NOT NULL,
	"category" text NOT NULL,
	"topic" text NOT NULL,
	"content" text NOT NULL,
	"confidence" integer DEFAULT 3 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"source" text DEFAULT 'chat' NOT NULL,
	"sources" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"evidence_count" integer DEFAULT 1 NOT NULL,
	"last_confirmed_at" timestamp with time zone,
	"subcategory" text,
	"superseded_by_id" integer,
	"resolved_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "attachments" (
	"id" serial PRIMARY KEY NOT NULL,
	"conversation_id" integer NOT NULL,
	"message_id" integer,
	"kind" text NOT NULL,
	"mime_type" text NOT NULL,
	"filename" text NOT NULL,
	"file_path" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "weekly_plan_item_completions" (
	"id" serial PRIMARY KEY NOT NULL,
	"plan_id" integer NOT NULL,
	"item_key" text NOT NULL,
	"completed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "weekly_plans" (
	"id" serial PRIMARY KEY NOT NULL,
	"fighter_id" integer NOT NULL,
	"week_start" timestamp with time zone NOT NULL,
	"ai_provider" text DEFAULT 'claude' NOT NULL,
	"items" jsonb NOT NULL,
	"rationale" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "video_analyses" (
	"id" serial PRIMARY KEY NOT NULL,
	"fighter_id" integer NOT NULL,
	"camp_id" integer,
	"subject" text DEFAULT 'self' NOT NULL,
	"opponent_name" text DEFAULT '' NOT NULL,
	"kind" text NOT NULL,
	"focus" text DEFAULT '' NOT NULL,
	"nervous_system_load" text NOT NULL,
	"fragmentation_risk" text DEFAULT 'low' NOT NULL,
	"session_score" integer DEFAULT 0 NOT NULL,
	"style_profile" text DEFAULT '' NOT NULL,
	"ai_comment" text DEFAULT '' NOT NULL,
	"summary" text NOT NULL,
	"findings" jsonb NOT NULL,
	"scores" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"style_parallels" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"detected_events" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"comparison" jsonb,
	"matchup" jsonb,
	"metrics" jsonb NOT NULL,
	"keyframes" jsonb NOT NULL,
	"keyframe_notes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"review_question" text DEFAULT '' NOT NULL,
	"review_answer" text DEFAULT '' NOT NULL,
	"replay_moments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"duration_sec" real DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "competitions" (
	"id" serial PRIMARY KEY NOT NULL,
	"fighter_id" integer NOT NULL,
	"event_name" text NOT NULL,
	"discipline" text DEFAULT '' NOT NULL,
	"event_date" timestamp with time zone NOT NULL,
	"weigh_in_date" timestamp with time zone,
	"target_weight" text DEFAULT '' NOT NULL,
	"current_weight" text DEFAULT '' NOT NULL,
	"opponent" text DEFAULT '' NOT NULL,
	"promotion" text DEFAULT '' NOT NULL,
	"weight_class" text DEFAULT '' NOT NULL,
	"rounds" integer,
	"location" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "training_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"camp_id" integer NOT NULL,
	"fighter_id" integer NOT NULL,
	"session_type" text NOT NULL,
	"session_date" date NOT NULL,
	"start_time" text,
	"duration_min" integer,
	"coach" text DEFAULT '' NOT NULL,
	"objective" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"completed" boolean DEFAULT false NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"external_event_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "google_calendar_connections" (
	"user_id" text PRIMARY KEY NOT NULL,
	"google_email" text DEFAULT '' NOT NULL,
	"enc_access_token" text,
	"enc_refresh_token" text,
	"expiry_date" timestamp with time zone,
	"scope" text DEFAULT '' NOT NULL,
	"calendar_id" text DEFAULT 'primary' NOT NULL,
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "daily_checkins" (
	"id" serial PRIMARY KEY NOT NULL,
	"fighter_id" integer NOT NULL,
	"checkin_date" date NOT NULL,
	"sleep" integer NOT NULL,
	"energy" integer NOT NULL,
	"soreness" integer NOT NULL,
	"stress" integer NOT NULL,
	"resting_hr" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "google_oauth_states" (
	"state" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "model_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"fighter_id" integer NOT NULL,
	"week_start" date NOT NULL,
	"completeness" integer DEFAULT 0 NOT NULL,
	"fact_count" integer DEFAULT 0 NOT NULL,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- Add foreign-key and unique constraints only when they do not already exist.
-- This guards against duplicate constraint errors when running on a database
-- that was already initialised by migration 0000 (fresh-DB path).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fighters_user_id_users_id_fk'             AND table_name = 'fighters')             THEN ALTER TABLE "fighters"                     ADD CONSTRAINT "fighters_user_id_users_id_fk"                     FOREIGN KEY ("user_id")          REFERENCES "public"."users"("id")         ON DELETE cascade ON UPDATE no action; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'conversations_fighter_id_fighters_id_fk'   AND table_name = 'conversations')         THEN ALTER TABLE "conversations"                 ADD CONSTRAINT "conversations_fighter_id_fighters_id_fk"         FOREIGN KEY ("fighter_id")       REFERENCES "public"."fighters"("id")      ON DELETE cascade ON UPDATE no action; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'messages_conversation_id_conversations_id_fk' AND table_name = 'messages')           THEN ALTER TABLE "messages"                     ADD CONSTRAINT "messages_conversation_id_conversations_id_fk"     FOREIGN KEY ("conversation_id")  REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'calibrations_fighter_id_fighters_id_fk'    AND table_name = 'calibrations')         THEN ALTER TABLE "calibrations"                 ADD CONSTRAINT "calibrations_fighter_id_fighters_id_fk"          FOREIGN KEY ("fighter_id")       REFERENCES "public"."fighters"("id")      ON DELETE cascade ON UPDATE no action; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'athlete_signals_fighter_id_fighters_id_fk' AND table_name = 'athlete_signals')      THEN ALTER TABLE "athlete_signals"              ADD CONSTRAINT "athlete_signals_fighter_id_fighters_id_fk"       FOREIGN KEY ("fighter_id")       REFERENCES "public"."fighters"("id")      ON DELETE cascade ON UPDATE no action; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'athlete_facts_fighter_id_fighters_id_fk'   AND table_name = 'athlete_facts')        THEN ALTER TABLE "athlete_facts"                ADD CONSTRAINT "athlete_facts_fighter_id_fighters_id_fk"         FOREIGN KEY ("fighter_id")       REFERENCES "public"."fighters"("id")      ON DELETE cascade ON UPDATE no action; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'attachments_conversation_id_conversations_id_fk' AND table_name = 'attachments')   THEN ALTER TABLE "attachments"                  ADD CONSTRAINT "attachments_conversation_id_conversations_id_fk"  FOREIGN KEY ("conversation_id")  REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'attachments_message_id_messages_id_fk'     AND table_name = 'attachments')         THEN ALTER TABLE "attachments"                  ADD CONSTRAINT "attachments_message_id_messages_id_fk"           FOREIGN KEY ("message_id")       REFERENCES "public"."messages"("id")      ON DELETE cascade ON UPDATE no action; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'weekly_plan_item_completions_plan_id_weekly_plans_id_fk' AND table_name = 'weekly_plan_item_completions') THEN ALTER TABLE "weekly_plan_item_completions" ADD CONSTRAINT "weekly_plan_item_completions_plan_id_weekly_plans_id_fk" FOREIGN KEY ("plan_id")          REFERENCES "public"."weekly_plans"("id")  ON DELETE cascade ON UPDATE no action; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'weekly_plans_fighter_id_fighters_id_fk'    AND table_name = 'weekly_plans')         THEN ALTER TABLE "weekly_plans"                 ADD CONSTRAINT "weekly_plans_fighter_id_fighters_id_fk"          FOREIGN KEY ("fighter_id")       REFERENCES "public"."fighters"("id")      ON DELETE cascade ON UPDATE no action; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'video_analyses_fighter_id_fighters_id_fk'  AND table_name = 'video_analyses')       THEN ALTER TABLE "video_analyses"               ADD CONSTRAINT "video_analyses_fighter_id_fighters_id_fk"        FOREIGN KEY ("fighter_id")       REFERENCES "public"."fighters"("id")      ON DELETE cascade ON UPDATE no action; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'video_analyses_camp_id_competitions_id_fk' AND table_name = 'video_analyses')       THEN ALTER TABLE "video_analyses"               ADD CONSTRAINT "video_analyses_camp_id_competitions_id_fk"       FOREIGN KEY ("camp_id")          REFERENCES "public"."competitions"("id")  ON DELETE set null ON UPDATE no action; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'competitions_fighter_id_fighters_id_fk'    AND table_name = 'competitions')         THEN ALTER TABLE "competitions"                 ADD CONSTRAINT "competitions_fighter_id_fighters_id_fk"          FOREIGN KEY ("fighter_id")       REFERENCES "public"."fighters"("id")      ON DELETE cascade ON UPDATE no action; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'training_sessions_camp_id_competitions_id_fk' AND table_name = 'training_sessions') THEN ALTER TABLE "training_sessions"            ADD CONSTRAINT "training_sessions_camp_id_competitions_id_fk"    FOREIGN KEY ("camp_id")          REFERENCES "public"."competitions"("id")  ON DELETE cascade ON UPDATE no action; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'training_sessions_fighter_id_fighters_id_fk' AND table_name = 'training_sessions')  THEN ALTER TABLE "training_sessions"            ADD CONSTRAINT "training_sessions_fighter_id_fighters_id_fk"     FOREIGN KEY ("fighter_id")       REFERENCES "public"."fighters"("id")      ON DELETE cascade ON UPDATE no action; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'google_calendar_connections_user_id_users_id_fk' AND table_name = 'google_calendar_connections') THEN ALTER TABLE "google_calendar_connections" ADD CONSTRAINT "google_calendar_connections_user_id_users_id_fk" FOREIGN KEY ("user_id")          REFERENCES "public"."users"("id")         ON DELETE cascade ON UPDATE no action; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'daily_checkins_fighter_id_fighters_id_fk'  AND table_name = 'daily_checkins')       THEN ALTER TABLE "daily_checkins"               ADD CONSTRAINT "daily_checkins_fighter_id_fighters_id_fk"        FOREIGN KEY ("fighter_id")       REFERENCES "public"."fighters"("id")      ON DELETE cascade ON UPDATE no action; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'model_snapshots_fighter_id_fighters_id_fk' AND table_name = 'model_snapshots')      THEN ALTER TABLE "model_snapshots"              ADD CONSTRAINT "model_snapshots_fighter_id_fighters_id_fk"       FOREIGN KEY ("fighter_id")       REFERENCES "public"."fighters"("id")      ON DELETE cascade ON UPDATE no action; END IF;
END $$;
--> statement-breakpoint

-- Unique indexes — only created when missing (idempotent on already-JWT schema).
CREATE UNIQUE INDEX IF NOT EXISTS "weekly_plan_completions_plan_item_uq" ON "weekly_plan_item_completions" USING btree ("plan_id","item_key");
CREATE UNIQUE INDEX IF NOT EXISTS "weekly_plans_fighter_week_uq"         ON "weekly_plans"                 USING btree ("fighter_id","week_start");
CREATE UNIQUE INDEX IF NOT EXISTS "training_sessions_camp_external_uq"   ON "training_sessions"            USING btree ("camp_id","external_event_id");
CREATE UNIQUE INDEX IF NOT EXISTS "daily_checkins_fighter_day_uq"        ON "daily_checkins"               USING btree ("fighter_id","checkin_date");
CREATE UNIQUE INDEX IF NOT EXISTS "model_snapshots_fighter_week_unq"     ON "model_snapshots"              USING btree ("fighter_id","week_start");
