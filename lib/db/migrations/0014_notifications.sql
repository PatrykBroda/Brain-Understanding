CREATE TABLE IF NOT EXISTS "notifications" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "kind" text NOT NULL,
  "dedupe_key" text NOT NULL,
  "title" text NOT NULL,
  "body" text NOT NULL,
  "data" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "read_at" timestamp with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "notifications_user_dedupe_uq"
  ON "notifications" USING btree ("user_id", "dedupe_key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notifications_user_created_idx"
  ON "notifications" USING btree ("user_id", "created_at");
