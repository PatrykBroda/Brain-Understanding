ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "ai_analysis_consent_version" text;
--> statement-breakpoint
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "ai_analysis_consent_at" timestamp with time zone;