ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "legal_consent_version" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "legal_consent_at" timestamp with time zone;