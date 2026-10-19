-- Onboarding funnel events (analytics only). Idempotent: safe to run twice.
-- Apply BEFORE deploying the new api-server build, or with `pnpm --filter db push`.
CREATE TABLE IF NOT EXISTS "onboarding_events" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "app" text NOT NULL,
  "step" text NOT NULL,
  "event" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "onboarding_events_user_idx" ON "onboarding_events" ("user_id");
CREATE INDEX IF NOT EXISTS "onboarding_events_app_step_idx" ON "onboarding_events" ("app", "step");
