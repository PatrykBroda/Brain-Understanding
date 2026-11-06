-- Injury / soreness log (Nov 2026). Idempotent: safe to run twice. Additive only.
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
