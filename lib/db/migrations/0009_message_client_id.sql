-- Chat idempotency (Oct 2026). Idempotent: safe to run twice.
-- Apply BEFORE deploying the new api-server build, or with `pnpm --filter db push`.
-- Additive only; old api-server builds keep working against the new schema.

-- The id the app generates for each send (a retry reuses it). On a user row it
-- identifies the send; on an assistant row it marks the complete reply to it.
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "client_message_id" text;
CREATE INDEX IF NOT EXISTS "messages_conversation_client_message_id_idx"
  ON "messages" ("conversation_id", "client_message_id");
