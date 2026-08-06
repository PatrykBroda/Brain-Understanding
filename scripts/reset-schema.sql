-- ============================================================================
-- DESTRUCTIVE RESET SCRIPT — for operator use only
-- ============================================================================
-- PURPOSE
--   Wipes the entire database schema so the application can be bootstrapped
--   from scratch against the current JWT-auth schema.  Used when migrating
--   from the old Clerk-keyed schema (where a non-destructive upgrade is not
--   feasible because Clerk credentials cannot be ported to bcrypt hashes).
--
-- THIS SCRIPT IS NOT PART OF THE AUTOMATIC MIGRATION PATH.
-- Running `pnpm run migrate` does NOT execute this file.
--
-- WHEN TO RUN
--   • One-time migration from the Clerk-keyed schema to the JWT schema.
--   • Developer environment reset.
--
-- OPERATOR CHECKLIST BEFORE RUNNING
--   1. Back up any athlete data you want to preserve (fighter records,
--      analyses, conversations, camps, facts, check-ins, billing cache).
--   2. Confirm affected environment (dev / staging / prod).
--   3. Run this script ONCE, manually:
--        psql "$DATABASE_URL" -f scripts/reset-schema.sql
--   4. Immediately follow with:
--        pnpm --filter @workspace/db run migrate
--   5. Re-register all users via POST /api/auth/register.
-- ============================================================================

-- Drop ALL tables.  CASCADE removes FK-dependent rows automatically.
-- Safe on a clean DB (IF EXISTS).
DROP TABLE IF EXISTS "model_snapshots" CASCADE;
DROP TABLE IF EXISTS "google_oauth_states" CASCADE;
DROP TABLE IF EXISTS "daily_checkins" CASCADE;
DROP TABLE IF EXISTS "training_sessions" CASCADE;
DROP TABLE IF EXISTS "video_analyses" CASCADE;
DROP TABLE IF EXISTS "weekly_plan_item_completions" CASCADE;
DROP TABLE IF EXISTS "weekly_plans" CASCADE;
DROP TABLE IF EXISTS "attachments" CASCADE;
DROP TABLE IF EXISTS "messages" CASCADE;
DROP TABLE IF EXISTS "athlete_facts" CASCADE;
DROP TABLE IF EXISTS "athlete_signals" CASCADE;
DROP TABLE IF EXISTS "calibrations" CASCADE;
DROP TABLE IF EXISTS "competitions" CASCADE;
DROP TABLE IF EXISTS "conversations" CASCADE;
DROP TABLE IF EXISTS "google_calendar_connections" CASCADE;
DROP TABLE IF EXISTS "fighters" CASCADE;
DROP TABLE IF EXISTS "users" CASCADE;

-- Also drop the drizzle migrations journal so the next `migrate` run applies
-- all migrations from scratch on the clean database.
DROP TABLE IF EXISTS "__drizzle_migrations" CASCADE;
