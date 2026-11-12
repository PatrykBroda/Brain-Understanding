-- Injury log v2 (Nov 2026): type, status (active/recovered) and resolved date.
-- Idempotent and additive only: safe to run twice, and safe on a database where 0012 was never applied
-- (it creates injury_logs first if it is missing, so this one file is enough). No drops, no deletes.
CREATE TABLE IF NOT EXISTS "injury_logs" (
  "id" serial PRIMARY KEY,
  "fighter_id" integer NOT NULL REFERENCES "fighters"("id") ON DELETE CASCADE,
  "log_date" date NOT NULL,
  "area" text NOT NULL,
  "severity" integer NOT NULL,
  "note" text NOT NULL DEFAULT '',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "injury_logs_fighter_day_area_uq" ON "injury_logs" ("fighter_id", "log_date", "area");
CREATE INDEX IF NOT EXISTS "injury_logs_fighter_date_idx" ON "injury_logs" ("fighter_id", "log_date");
ALTER TABLE "injury_logs" ADD COLUMN IF NOT EXISTS "kind" text NOT NULL DEFAULT 'other';
ALTER TABLE "injury_logs" ADD COLUMN IF NOT EXISTS "status" text NOT NULL DEFAULT 'active';
ALTER TABLE "injury_logs" ADD COLUMN IF NOT EXISTS "resolved_at" date;
