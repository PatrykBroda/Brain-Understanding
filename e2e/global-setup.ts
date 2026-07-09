import { clerkSetup } from "@clerk/testing/playwright";
import { createClerkClient } from "@clerk/backend";
import { Client } from "pg";

export const TEST_MAIN_EMAIL = "frame-smoke-main@example.com";
export const TEST_FRESH_EMAIL = "frame-smoke-fresh@example.com";

async function getOrCreateClerkUser(
  clerk: ReturnType<typeof createClerkClient>,
  email: string
): Promise<string> {
  const { data: existing } = await clerk.users.getUserList({ emailAddress: [email] });
  if (existing.length > 0) {
    return existing[0].id;
  }
  const user = await clerk.users.createUser({
    emailAddress: [email],
    password: "FrameSmoke2024!",
    firstName: "Smoke",
    lastName: "Test",
  });
  console.log(`[smoke-setup] Created Clerk user: ${email}`);
  return user.id;
}

async function ensureUsersRow(db: Client, clerkUserId: string): Promise<void> {
  await db.query(
    `INSERT INTO users ("clerk_user_id") VALUES ($1) ON CONFLICT DO NOTHING`,
    [clerkUserId]
  );
}

async function ensureMainFighter(db: Client, clerkUserId: string): Promise<void> {
  const existing = await db.query(
    `SELECT id FROM fighters WHERE user_id = $1 LIMIT 1`,
    [clerkUserId]
  );
  if (existing.rows.length > 0) {
    return;
  }
  await db.query(
    `INSERT INTO fighters
       (user_id, name, date_of_birth, age, art, primary_sport, level, training_frequency)
     VALUES ($1, 'Smoke Test Fighter', '1990-06-15', 35, 'bjj', 'bjj', 'white', '3-4')`,
    [clerkUserId]
  );
  console.log(`[smoke-setup] Created fighter row for main test user`);
}

/**
 * Grant the MAIN smoke user FRAME+ so the analyse pipeline test can exercise
 * video analysis (a FRAME+ feature). Uses the server's billing-cache path:
 * with a stripe customer id set but no synced stripe.subscriptions row, the
 * entitlement service honors the users-row cache when plan=frame_plus and
 * current_period_end is in the future (the sync-lag guard).
 */
async function ensureMainFramePlus(db: Client, clerkUserId: string): Promise<void> {
  await db.query(
    `UPDATE users
       SET stripe_customer_id = COALESCE(stripe_customer_id, 'cus_smoke_test_frame_plus'),
           plan = 'frame_plus',
           subscription_status = 'active',
           current_period_end = NOW() + INTERVAL '1 year'
     WHERE clerk_user_id = $1`,
    [clerkUserId]
  );
}

/** The FRESH smoke user must stay on the free plan (gate tests depend on it). */
async function ensureFreshFreePlan(db: Client, clerkUserId: string): Promise<void> {
  await db.query(
    `UPDATE users
       SET stripe_customer_id = NULL,
           plan = 'free',
           subscription_status = NULL,
           current_period_end = NULL
     WHERE clerk_user_id = $1`,
    [clerkUserId]
  );
}

async function deleteFreshFighter(db: Client, clerkUserId: string): Promise<void> {
  const res = await db.query(
    `DELETE FROM fighters WHERE user_id = $1 RETURNING id`,
    [clerkUserId]
  );
  if (res.rowCount && res.rowCount > 0) {
    console.log(`[smoke-setup] Deleted fresh user's fighter (will re-run onboarding)`);
  }
}

export default async function globalSetup(): Promise<void> {
  await clerkSetup();

  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) throw new Error("CLERK_SECRET_KEY is required for smoke tests");

  const clerk = createClerkClient({ secretKey });

  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();

  try {
    const mainId = await getOrCreateClerkUser(clerk, TEST_MAIN_EMAIL);
    const freshId = await getOrCreateClerkUser(clerk, TEST_FRESH_EMAIL);

    await ensureUsersRow(db, mainId);
    await ensureUsersRow(db, freshId);

    await ensureMainFighter(db, mainId);
    await ensureMainFramePlus(db, mainId);
    await ensureFreshFreePlan(db, freshId);
    await deleteFreshFighter(db, freshId);

    process.env.TEST_MAIN_USER_ID = mainId;
    process.env.TEST_FRESH_USER_ID = freshId;
  } finally {
    await db.end();
  }
}
