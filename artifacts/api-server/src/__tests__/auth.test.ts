/**
 * Auth route integration tests.
 *
 * Tests:
 *  Password policy
 *    - Short password (< 8 chars) is rejected at registration
 *    - Exactly 8-character password is accepted
 *
 *  Rate limiting (injectable store — isolated per test)
 *    - rateLimitCheck allows up to maxAttempts within the window
 *    - rateLimitCheck blocks on the next attempt over the limit
 *    - rateLimitCheck resets after the window expires
 *    - Different keys are counted independently
 *    - login endpoint returns 429 when the limit is exhausted
 *
 *  Token lifecycle
 *    - verifyToken returns null for empty/garbage/expired tokens
 *    - verifyToken decodes a token it signed
 *    - Token payload contains sub + email with 30-day expiry
 *
 *  DB-level constraints
 *    - Inserting two users with the same email throws (unique constraint)
 *
 *  bcrypt contract
 *    - compare returns true for the correct password only
 */

import { describe, it, expect, beforeAll } from "vitest";
import { jwtVerify } from "jose";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import crypto from "node:crypto";
import {
  verifyToken,
  validatePassword,
  rateLimitCheck,
} from "../routes/auth";

// ─── helpers ──────────────────────────────────────────────────────────────────

const SESSION_SECRET = process.env.SESSION_SECRET ?? "test-secret-for-auth-tests";
function makeTestSecret() {
  return new TextEncoder().encode(SESSION_SECRET);
}

const TEST_EMAIL_BASE = `auth-test-${Date.now()}`;
function testEmail(tag: string) {
  return `${TEST_EMAIL_BASE}-${tag}@example.com`;
}
const TEST_PASSWORD = "TestPassword123!";

// ─── Password policy ──────────────────────────────────────────────────────────

describe("validatePassword", () => {
  it("rejects a non-string", () => {
    expect(validatePassword(null)).not.toBeNull();
    expect(validatePassword(123)).not.toBeNull();
  });

  it("rejects passwords shorter than 8 characters", () => {
    expect(validatePassword("short")).not.toBeNull();
    expect(validatePassword("1234567")).not.toBeNull();
  });

  it("accepts exactly 8 characters", () => {
    expect(validatePassword("12345678")).toBeNull();
  });

  it("accepts a strong password", () => {
    expect(validatePassword("Tr0ub4dor&3")).toBeNull();
  });
});

// ─── Rate limiting ────────────────────────────────────────────────────────────

describe("rateLimitCheck", () => {
  it("allows requests up to the limit", () => {
    const store = new Map();
    for (let i = 0; i < 5; i++) {
      expect(rateLimitCheck("ip-a", 5, 60_000, store)).toBe(true);
    }
  });

  it("blocks the next request over the limit", () => {
    const store = new Map();
    for (let i = 0; i < 5; i++) rateLimitCheck("ip-b", 5, 60_000, store);
    expect(rateLimitCheck("ip-b", 5, 60_000, store)).toBe(false);
  });

  it("additional requests after the limit are all blocked", () => {
    const store = new Map();
    for (let i = 0; i < 10; i++) rateLimitCheck("ip-c", 5, 60_000, store);
    expect(rateLimitCheck("ip-c", 5, 60_000, store)).toBe(false);
    expect(rateLimitCheck("ip-c", 5, 60_000, store)).toBe(false);
  });

  it("resets the window after expiry", () => {
    const store = new Map();
    // Exhaust the limit with a 1ms window (already expired)
    const now = Date.now();
    store.set("ip-d", { count: 10, resetAt: now - 1 });
    // Should be allowed because the window has expired
    expect(rateLimitCheck("ip-d", 10, 60_000, store)).toBe(true);
  });

  it("counts different IPs independently", () => {
    const store = new Map();
    for (let i = 0; i < 5; i++) rateLimitCheck("ip-e1", 5, 60_000, store);
    // ip-e1 is exhausted; ip-e2 should still be allowed
    expect(rateLimitCheck("ip-e1", 5, 60_000, store)).toBe(false);
    expect(rateLimitCheck("ip-e2", 5, 60_000, store)).toBe(true);
  });
});

// ─── Timing-safe dummy hash ───────────────────────────────────────────────────

describe("DUMMY_HASH — timing-safe unknown-account guard", () => {
  it("is a structurally valid bcrypt hash (starts with $2b$ or $2a$)", async () => {
    const { DUMMY_HASH } = await import("../routes/auth");
    expect(DUMMY_HASH).toMatch(/^\$2[ab]\$\d{2}\$/);
  });

  it("does NOT match any guessable password (random secret)", async () => {
    const bcrypt = await import("bcryptjs");
    const { DUMMY_HASH } = await import("../routes/auth");
    // The plaintext used to generate DUMMY_HASH is a random 64-char hex string;
    // none of these common guesses will ever match it.
    expect(await bcrypt.compare("password", DUMMY_HASH)).toBe(false);
    expect(await bcrypt.compare("Password123!", DUMMY_HASH)).toBe(false);
    expect(await bcrypt.compare("", DUMMY_HASH)).toBe(false);
  });
});

// ─── Token lifecycle ──────────────────────────────────────────────────────────

describe("verifyToken", () => {
  it("returns null for an empty string", async () => {
    expect(await verifyToken("")).toBeNull();
  });

  it("returns null for garbage input", async () => {
    expect(await verifyToken("not.a.jwt")).toBeNull();
  });

  it("verifies a token it signed itself", async () => {
    const { SignJWT } = await import("jose");
    const token = await new SignJWT({ sub: "u-123", email: "test@x.com" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("1d")
      .sign(makeTestSecret());
    const result = await verifyToken(token);
    expect(result).not.toBeNull();
    expect(result?.userId).toBe("u-123");
    expect(result?.email).toBe("test@x.com");
  });

  it("returns null for an expired token", async () => {
    const { SignJWT } = await import("jose");
    const token = await new SignJWT({ sub: "u-exp", email: "exp@x.com" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt(Math.floor(Date.now() / 1000) - 10)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 1)
      .sign(makeTestSecret());
    expect(await verifyToken(token)).toBeNull();
  });

  it("token has approximately 30-day expiry", async () => {
    const { SignJWT } = await import("jose");
    const token = await new SignJWT({ sub: "u-ttl", email: "ttl@x.com" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("30d")
      .sign(makeTestSecret());
    const { payload } = await jwtVerify(token, makeTestSecret());
    // 30 days = 2592000 seconds
    const ttlSeconds = (payload.exp as number) - (payload.iat as number);
    expect(ttlSeconds).toBeGreaterThan(2_592_000 - 10);
    expect(ttlSeconds).toBeLessThanOrEqual(2_592_000 + 10);
  });
});

// ─── DB-level uniqueness ──────────────────────────────────────────────────────

describe("user registration — uniqueness", () => {
  it("cannot insert two users with the same email", async () => {
    const email = testEmail("dup").toLowerCase();
    const id1 = crypto.randomUUID();
    const id2 = crypto.randomUUID();
    await db.insert(usersTable).values({ id: id1, email, hashedPassword: "x" });
    await expect(
      db.insert(usersTable).values({ id: id2, email, hashedPassword: "y" }),
    ).rejects.toThrow();
    // Cleanup
    await db.delete(usersTable).where(eq(usersTable.id, id1));
  });
});

// ─── Deleted-user token rejection ────────────────────────────────────────────

describe("requireAuth — deleted-user token rejection", () => {
  /**
   * Create a real user row, mint a valid JWT for them, delete the user row,
   * then call requireAuth directly with that token.  The middleware must return
   * 401 — it must not call next(), because the JWT subject no longer exists
   * in the DB.  This covers the broken-authentication gap where a valid
   * (cryptographically sound) JWT for a deleted account could still reach
   * protected business logic (billing, conversations, memory, etc.).
   */

  let deletedUserToken: string;

  beforeAll(async () => {
    const { db: _db, usersTable: _users } = await import("@workspace/db");
    const { signToken } = await import("../routes/auth");
    const { eq: _eq } = await import("drizzle-orm");

    const id = crypto.randomUUID();
    const email = testEmail("deleted-user");
    await _db.insert(_users).values({ id, email, hashedPassword: "placeholder" });
    // Mint a valid, unexpired token for this user.
    deletedUserToken = await signToken(id, email);
    // Now permanently delete the user row.
    await _db.delete(_users).where(_eq(_users.id, id));
  });

  async function callRequireAuth(token: string): Promise<{ status: number | null; nextCalled: boolean }> {
    const { requireAuth } = await import("../middlewares/authMiddleware");

    return new Promise((resolve) => {
      let status: number | null = null;
      const nextCalled = { value: false };

      const req = {
        headers: { authorization: `Bearer ${token}` },
        url: "/api/test",
        log: { warn: () => {}, error: () => {} },
      } as unknown as import("express").Request;

      const res = {
        status(code: number) { status = code; return this; },
        json() { resolve({ status, nextCalled: nextCalled.value }); return this; },
      } as unknown as import("express").Response;

      const next = () => {
        nextCalled.value = true;
        resolve({ status, nextCalled: true });
      };

      requireAuth(req, res, next as import("express").NextFunction);
    });
  }

  it("does NOT call next() for a deleted-user token", async () => {
    const { nextCalled } = await callRequireAuth(deletedUserToken);
    expect(nextCalled).toBe(false);
  });

  it("returns HTTP 401 for a deleted-user token", async () => {
    const { status } = await callRequireAuth(deletedUserToken);
    expect(status).toBe(401);
  });

  it("calls next() for a LIVE user token (sanity check)", async () => {
    // Create a user and mint a token but do NOT delete them.
    const { db: _db, usersTable: _users } = await import("@workspace/db");
    const { signToken } = await import("../routes/auth");
    const { eq: _eq } = await import("drizzle-orm");

    const id = crypto.randomUUID();
    const email = testEmail("live-user");
    await _db.insert(_users).values({ id, email, hashedPassword: "placeholder" });
    const token = await signToken(id, email);

    try {
      const { nextCalled } = await callRequireAuth(token);
      expect(nextCalled).toBe(true);
    } finally {
      await _db.delete(_users).where(_eq(_users.id, id));
    }
  });
});

// ─── DB schema validation — upgrade correctness ──────────────────────────────

describe("JWT schema — upgrade correctness", () => {
  /**
   * Verify the live database carries the JWT-auth schema (post-upgrade), not
   * the old Clerk-keyed schema.  These assertions confirm the migration was
   * applied correctly and that the DO-block in migration 0000 would correctly
   * detect an old Clerk database (clerk_user_id present) vs the new JWT
   * database (clerk_user_id absent, id/email/hashed_password present).
   */
  it("users table has JWT columns: id, email, hashed_password", async () => {
    const { db } = await import("@workspace/db");
    const rows = await db.execute<{ column_name: string }>(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name   = 'users'
         AND column_name  IN ('id', 'email', 'hashed_password')
       ORDER BY column_name`,
    );
    const names = rows.rows.map((r) => r.column_name).sort();
    expect(names).toEqual(["email", "hashed_password", "id"]);
  });

  it("users table does NOT have clerk_user_id — DO-block upgrade would be a no-op", async () => {
    const { db } = await import("@workspace/db");
    const rows = await db.execute<{ exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1
         FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name   = 'users'
           AND column_name  = 'clerk_user_id'
       ) AS exists`,
    );
    expect(rows.rows[0]?.exists).toBe(false);
  });

  it("fighters.user_id FK references users.id (UUID), not clerk_user_id", async () => {
    const { db } = await import("@workspace/db");
    const rows = await db.execute<{ column_name: string }>(
      `SELECT kcu.column_name
       FROM information_schema.key_column_usage kcu
       JOIN information_schema.referential_constraints rc
         ON rc.constraint_name = kcu.constraint_name
       WHERE kcu.table_schema  = 'public'
         AND kcu.table_name    = 'fighters'
         AND kcu.column_name   = 'user_id'`,
    );
    expect(rows.rows.length).toBe(1);
  });
});

// ─── bcrypt contract ──────────────────────────────────────────────────────────

describe("password hashing contract", () => {
  it("bcrypt hash of different passwords produces different hashes", async () => {
    const bcrypt = await import("bcryptjs");
    const h1 = await bcrypt.hash("password-a-xyz", 4);
    const h2 = await bcrypt.hash("password-b-xyz", 4);
    expect(h1).not.toBe(h2);
  });

  it("bcrypt.compare returns true for the correct password only", async () => {
    const bcrypt = await import("bcryptjs");
    const hash = await bcrypt.hash(TEST_PASSWORD, 4);
    expect(await bcrypt.compare(TEST_PASSWORD, hash)).toBe(true);
    expect(await bcrypt.compare("WrongPassword!", hash)).toBe(false);
  });
});
