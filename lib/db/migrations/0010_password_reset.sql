-- Emailed password reset (Oct 2026). Idempotent: safe to run twice.
-- Apply BEFORE deploying the new api-server build, or with `pnpm --filter db push`.
-- Additive only; old api-server builds keep working against the new schema.

-- Sessions issued before this moment are rejected (set on password reset).
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "password_changed_at" timestamptz;

CREATE TABLE IF NOT EXISTS "password_reset_tokens" (
  "id" serial PRIMARY KEY,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "token_hash" text NOT NULL,
  "expires_at" timestamptz NOT NULL,
  "used_at" timestamptz,
  "attempts" integer NOT NULL DEFAULT 0,
  "request_ip" text,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "password_reset_tokens_user_idx"
  ON "password_reset_tokens" ("user_id");
