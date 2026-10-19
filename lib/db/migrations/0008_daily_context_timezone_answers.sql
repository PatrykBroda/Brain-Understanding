-- Intelligence loop (Oct 2026). Idempotent: safe to run twice.
-- Apply BEFORE deploying the new api-server build, or with `pnpm --filter db push`.
-- All three changes are additive; old api-server builds keep working against the new schema.

-- 1. The athlete's IANA timezone, so State / Today's Focus / check-ins roll over at THEIR midnight.
ALTER TABLE "fighters" ADD COLUMN IF NOT EXISTS "timezone" text NOT NULL DEFAULT '';

-- 2. The four behavioural onboarding answers (question id -> option index), editable from Profile.
--    No backfill is possible (only the composed `personality` text was stored before);
--    athletes who have no stored answers see the questions unanswered on Profile.
ALTER TABLE "fighters" ADD COLUMN IF NOT EXISTS "onboarding_answers" jsonb NOT NULL DEFAULT '{}'::jsonb;

-- 3. One State + Today's Focus row per athlete per local day (written only on days with fresh information).
CREATE TABLE IF NOT EXISTS "daily_context" (
  "id" serial PRIMARY KEY NOT NULL,
  "fighter_id" integer NOT NULL REFERENCES "fighters"("id") ON DELETE CASCADE,
  "local_date" date NOT NULL,
  "timezone" text NOT NULL DEFAULT 'UTC',
  "state" text NOT NULL,
  "state_source" text NOT NULL DEFAULT '',
  "focus" jsonb NOT NULL,
  "inputs_hash" text NOT NULL DEFAULT '',
  "generated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "daily_context_fighter_day_uq" ON "daily_context" ("fighter_id", "local_date");
