/**
 * Smoke test global setup — provisions two stable test accounts directly in
 * the database using bcryptjs (no Clerk dependency).
 *
 * MAIN user  — has a fighter + FRAME+ plan. Used by most tests.
 * FRESH user — free plan, no fighter (deleted each run) for gate/onboarding tests.
 */
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { Client } from "pg";

export const TEST_MAIN_EMAIL = "frame-smoke-main@example.com";
export const TEST_FRESH_EMAIL = "frame-smoke-fresh@example.com";
export const TEST_PASSWORD = "FrameSmoke2024!";

const BCRYPT_ROUNDS = 10;

async function upsertUser(
  db: Client,
  email: string,
): Promise<string> {
  const existing = await db.query<{ id: string }>(
    `SELECT id FROM users WHERE email = $1 LIMIT 1`,
    [email],
  );
  if (existing.rows.length > 0) {
    return existing.rows[0]!.id;
  }
  const id = crypto.randomUUID();
  const hashedPassword = await bcrypt.hash(TEST_PASSWORD, BCRYPT_ROUNDS);
  await db.query(
    `INSERT INTO users (id, email, hashed_password) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
    [id, email, hashedPassword],
  );
  return id;
}

async function ensureMainFighter(db: Client, userId: string): Promise<void> {
  const existing = await db.query(
    `SELECT id FROM fighters WHERE user_id = $1 LIMIT 1`,
    [userId],
  );
  if (existing.rows.length > 0) return;
  await db.query(
    `INSERT INTO fighters
       (user_id, name, date_of_birth, age, art, primary_sport, level, training_frequency)
     VALUES ($1, 'Smoke Test Fighter', '1990-06-15', 35, 'bjj', 'bjj', 'white', '3-4')`,
    [userId],
  );
  console.log(`[smoke-setup] Created fighter row for main test user`);
}

async function ensureMainFramePlus(db: Client, userId: string): Promise<void> {
  await db.query(
    `UPDATE users
       SET stripe_customer_id = COALESCE(stripe_customer_id, 'cus_smoke_test_frame_plus'),
           plan = 'frame_plus',
           subscription_status = 'active',
           current_period_end = NOW() + INTERVAL '1 year'
     WHERE id = $1`,
    [userId],
  );
}

async function ensureFreshFreePlan(db: Client, userId: string): Promise<void> {
  await db.query(
    `UPDATE users
       SET stripe_customer_id = NULL,
           plan = 'free',
           subscription_status = NULL,
           current_period_end = NULL
     WHERE id = $1`,
    [userId],
  );
}

async function deleteFreshFighter(db: Client, userId: string): Promise<void> {
  const res = await db.query(
    `DELETE FROM fighters WHERE user_id = $1 RETURNING id`,
    [userId],
  );
  if (res.rowCount && res.rowCount > 0) {
    console.log(`[smoke-setup] Deleted fresh user's fighter (will re-run onboarding)`);
  }
}

export default async function globalSetup(): Promise<void> {
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();

  try {
    const mainId = await upsertUser(db, TEST_MAIN_EMAIL);
    const freshId = await upsertUser(db, TEST_FRESH_EMAIL);

    await ensureMainFighter(db, mainId);
    await ensureMainFramePlus(db, mainId);
    await ensureFreshFreePlan(db, freshId);
    await deleteFreshFighter(db, freshId);

    process.env.TEST_MAIN_USER_ID = mainId;
    process.env.TEST_FRESH_USER_ID = freshId;
    console.log(`[smoke-setup] Users provisioned OK (main=${mainId.slice(0, 8)}…)`);
  } finally {
    await db.end();
  }
}
