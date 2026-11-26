-- Junior accounts + gym join requests + gym performance. Additive and idempotent; drops nothing.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "is_junior" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "child_gym_memberships" DROP CONSTRAINT IF EXISTS "child_gym_memberships_status_check";
--> statement-breakpoint
ALTER TABLE "child_gym_memberships" ADD CONSTRAINT "child_gym_memberships_status_check" CHECK ("status" IN ('pending','approved','rejected','ended','cancelled'));
--> statement-breakpoint
ALTER TABLE "child_privacy_settings" ADD COLUMN IF NOT EXISTS "show_on_gym_board" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
-- A junior account: a FRAME login (users row, is_junior) LINKED to a child record. The parent link is guardian_links.
CREATE TABLE IF NOT EXISTS "junior_accounts" (
  "child_id" uuid PRIMARY KEY REFERENCES "children"("id") ON DELETE CASCADE,
  "user_id" text UNIQUE REFERENCES "users"("id") ON DELETE SET NULL,
  "username" text UNIQUE,
  "birth_date" date NOT NULL,
  "age_band" text NOT NULL,
  "status" text DEFAULT 'active' NOT NULL CHECK ("status" IN ('pending_setup','active','paused','parent_managed')),
  "ai_enabled" boolean DEFAULT false NOT NULL,
  "chat_enabled" boolean DEFAULT false NOT NULL,
  "created_by" text NOT NULL,
  "invite_token_hash" text,
  "invite_expires_at" timestamp with time zone,
  "activated_at" timestamp with time zone,
  "last_login_at" timestamp with time zone,
  "paused_at" timestamp with time zone,
  "paused_by" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "junior_accounts_invite_uq" ON "junior_accounts" ("invite_token_hash") WHERE "invite_token_hash" IS NOT NULL;
--> statement-breakpoint
-- Who consented, when, to which version. Append-only in spirit: withdrawing sets withdrawn_at, never deletes.
CREATE TABLE IF NOT EXISTS "junior_consents" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "child_id" uuid NOT NULL REFERENCES "children"("id") ON DELETE CASCADE,
  "guardian_user_id" text NOT NULL,
  "version" text NOT NULL,
  "age_band" text NOT NULL,
  "statement" text NOT NULL,
  "consented_at" timestamp with time zone DEFAULT now() NOT NULL,
  "withdrawn_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "junior_consents_child_idx" ON "junior_consents" ("child_id");
--> statement-breakpoint
-- Adult (athlete / member) requests to join a gym. Juniors keep using child_gym_memberships.
CREATE TABLE IF NOT EXISTS "gym_memberships" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "gym_id" uuid NOT NULL REFERENCES "gyms"("id") ON DELETE CASCADE,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "status" text DEFAULT 'pending' NOT NULL CHECK ("status" IN ('pending','approved','rejected','ended','cancelled')),
  "show_on_board" boolean DEFAULT false NOT NULL,
  "decided_by" text,
  "decided_at" timestamp with time zone,
  "ended_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "gym_memberships_open_uq" ON "gym_memberships" ("gym_id","user_id") WHERE "status" IN ('pending','approved');
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "gym_memberships_user_idx" ON "gym_memberships" ("user_id");
