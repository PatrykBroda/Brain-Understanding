-- Behaviour-triggered server push (Nov 2026). Idempotent: safe to run twice.
-- Additive only; old api-server builds ignore these tables.

CREATE TABLE IF NOT EXISTS "push_tokens" (
  "id" serial PRIMARY KEY,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "token" text NOT NULL,
  "platform" text NOT NULL DEFAULT '',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "push_tokens_token_uq" ON "push_tokens" ("token");
CREATE INDEX IF NOT EXISTS "push_tokens_user_idx" ON "push_tokens" ("user_id");

CREATE TABLE IF NOT EXISTS "push_preferences" (
  "user_id" text PRIMARY KEY REFERENCES "users"("id") ON DELETE CASCADE,
  "enabled" boolean NOT NULL DEFAULT true,
  "quiet_start_min" integer NOT NULL DEFAULT 1260,
  "quiet_end_min" integer NOT NULL DEFAULT 480,
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "push_sent" (
  "id" serial PRIMARY KEY,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "kind" text NOT NULL,
  "dedupe_key" text NOT NULL,
  "sent_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "push_sent_user_key_uq" ON "push_sent" ("user_id", "dedupe_key");
