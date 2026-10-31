/**
 * Emailed password reset: 6-digit one-time code, 30 minute life, single use, 5 wrong guesses and
 * it is dead. Only an HMAC-SHA256 of the code is stored. The store is an interface so the rules
 * run against an in-memory fake in tests; `drizzleResetStore` is the production implementation.
 */

import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { db, usersTable, passwordResetTokensTable } from "@workspace/db";
import { logger } from "./logger";
import { passwordChangedEmail, resetCodeEmail, sendMail, type MailMessage } from "./mailer";

export const RESET_CODE_TTL_MINUTES = 30;
export const RESET_MAX_ATTEMPTS = 5;
const BCRYPT_ROUNDS = 10;

export const CODE_RE = /^\d{6}$/;

export function generateResetCode(): string {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
}

/** Keyed by SESSION_SECRET so a leaked table can't be brute-forced offline (10^6 codes is tiny). */
export function hashResetCode(userId: string, code: string): string {
  const key = process.env["SESSION_SECRET"] || "frame-password-reset";
  return crypto.createHmac("sha256", key).update(`${userId}:${code}`).digest("hex");
}

function hashesEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

export interface ResetUser {
  id: string;
  email: string;
}

export interface ResetStore {
  findUserByEmail(email: string): Promise<ResetUser | null>;
  /** Kill every unused code the user has. */
  invalidateUnused(userId: string, now: Date): Promise<void>;
  createToken(t: { userId: string; tokenHash: string; expiresAt: Date; requestIp: string | null }): Promise<void>;
  /**
   * Atomically count one guess against the user's live code (unused, unexpired, under the cap)
   * and return it; null when there is none.
   */
  claimAttempt(userId: string, now: Date): Promise<{ id: number; tokenHash: string } | null>;
  /** Mark the code used, set the new password + password_changed_at. False if it was already used. */
  completeReset(t: { tokenId: number; userId: string; hashedPassword: string; now: Date }): Promise<boolean>;
}

export const drizzleResetStore: ResetStore = {
  async findUserByEmail(email) {
    const [u] = await db
      .select({ id: usersTable.id, email: usersTable.email })
      .from(usersTable)
      .where(eq(usersTable.email, email))
      .limit(1);
    return u ?? null;
  },

  async invalidateUnused(userId, now) {
    await db
      .update(passwordResetTokensTable)
      .set({ usedAt: now })
      .where(and(eq(passwordResetTokensTable.userId, userId), isNull(passwordResetTokensTable.usedAt)));
  },

  async createToken(t) {
    await db.insert(passwordResetTokensTable).values(t);
  },

  async claimAttempt(userId, now) {
    const t = passwordResetTokensTable;
    const live = db
      .select({ id: t.id })
      .from(t)
      .where(
        and(
          eq(t.userId, userId),
          isNull(t.usedAt),
          gt(t.expiresAt, now),
          sql`${t.attempts} < ${RESET_MAX_ATTEMPTS}`,
        ),
      )
      .orderBy(desc(t.createdAt), desc(t.id))
      .limit(1);
    const [row] = await db
      .update(t)
      .set({ attempts: sql`${t.attempts} + 1` })
      .where(eq(t.id, sql`(${live})`))
      .returning({ id: t.id, tokenHash: t.tokenHash });
    return row ?? null;
  },

  async completeReset({ tokenId, userId, hashedPassword, now }) {
    return db.transaction(async (tx) => {
      const t = passwordResetTokensTable;
      const [claimed] = await tx
        .update(t)
        .set({ usedAt: now })
        .where(and(eq(t.id, tokenId), isNull(t.usedAt)))
        .returning({ id: t.id });
      if (!claimed) return false;
      await tx
        .update(usersTable)
        .set({ hashedPassword, passwordChangedAt: now })
        .where(eq(usersTable.id, userId));
      // Any other outstanding code for this account is now moot.
      await tx.update(t).set({ usedAt: now }).where(and(eq(t.userId, userId), isNull(t.usedAt)));
      return true;
    });
  },
};

export interface ResetDeps {
  store: ResetStore;
  send: (m: MailMessage) => Promise<unknown>;
  now: () => Date;
}

export const defaultResetDeps: ResetDeps = {
  store: drizzleResetStore,
  send: sendMail,
  now: () => new Date(),
};

function sendInBackground(deps: ResetDeps, msg: MailMessage): void {
  // Never await the SMTP round trip: it would make "account exists" visibly slower, and a mail
  // outage must not turn into an error response that tells the caller the account exists.
  deps.send(msg).catch((err) => {
    logger.error({ err: err instanceof Error ? err.message : String(err) }, "password reset email failed to send");
  });
}

/** Issue a code if the account exists. Returns nothing: callers respond identically either way. */
export async function requestPasswordReset(
  normalizedEmail: string,
  requestIp: string | null,
  deps: ResetDeps = defaultResetDeps,
): Promise<void> {
  const user = await deps.store.findUserByEmail(normalizedEmail);
  if (!user) return;
  const now = deps.now();
  const code = generateResetCode();
  await deps.store.invalidateUnused(user.id, now);
  await deps.store.createToken({
    userId: user.id,
    tokenHash: hashResetCode(user.id, code),
    expiresAt: new Date(now.getTime() + RESET_CODE_TTL_MINUTES * 60_000),
    requestIp,
  });
  sendInBackground(deps, resetCodeEmail(user.email, code, RESET_CODE_TTL_MINUTES));
}

/** True when the password was changed; false for any wrong / expired / used / exhausted code. */
export async function completePasswordReset(
  normalizedEmail: string,
  code: string,
  newPassword: string,
  deps: ResetDeps = defaultResetDeps,
): Promise<boolean> {
  const user = await deps.store.findUserByEmail(normalizedEmail);
  if (!user) return false;
  const now = deps.now();
  const token = await deps.store.claimAttempt(user.id, now);
  if (!token) return false;
  if (!hashesEqual(token.tokenHash, hashResetCode(user.id, code))) return false;
  const hashedPassword = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  const ok = await deps.store.completeReset({ tokenId: token.id, userId: user.id, hashedPassword, now });
  if (!ok) return false;
  sendInBackground(deps, passwordChangedEmail(user.email));
  return true;
}
