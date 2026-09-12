/**
 * Custom auth routes — no Clerk, no email verification.
 * POST /api/auth/register  — create account, return JWT
 * POST /api/auth/login     — verify password, return JWT
 * POST /api/auth/logout    — 200 (client drops token)
 * GET  /api/auth/me        — return { userId, email } from JWT
 *
 * Security controls
 *   Password policy  : 8 character minimum, enforced server-side.
 *   Rate limiting    : 10 login attempts per IP, plus 5 register attempts per
 *                      normalized email/IP pair and 25 register attempts per IP
 *                      per 15 minutes. Uses injectable in-process stores so
 *                      tests can isolate windows without spawning a process.
 *   Token TTL        : 30 days (down from 90; bearer tokens are long-lived and
 *                      not revocable at this point — shorter TTL is the primary
 *                      control; force-reissue on password change is next step).
 *   Generic errors   : login always returns "Incorrect email or password"
 *                      whether the account exists or not.
 */

import { Router, type Request, type Response } from "express";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { LEGAL_CONSENT_VERSION } from "../lib/legalConsent";
import { AI_CONSENT_VERSION } from "../lib/aiConsent";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

const BCRYPT_ROUNDS = 10;
const TOKEN_TTL = "30d";
const MIN_PASSWORD_LENGTH = 8;

/**
 * Precomputed bcrypt hash used as the comparison target when the account
 * does not exist. This ensures bcrypt.compare() performs its full cost-10
 * work regardless of whether the email is registered, preventing timing-based
 * account enumeration.  hashSync runs ONCE at module load (~100ms).
 * Exported so tests can assert it is a structurally valid bcrypt hash.
 */
// Use a random plaintext so no attacker can pre-compute a matching input.
// Computed once at module load (~100ms at cost=10 is acceptable at startup).
export const DUMMY_HASH = bcrypt.hashSync(
  `dummy-${crypto.randomBytes(32).toString("hex")}`,
  BCRYPT_ROUNDS,
);

// ─── Rate limiting ────────────────────────────────────────────────────────────
// In-process sliding-window counter.  The store is exported so tests can inject
// an isolated Map per test and avoid cross-test interference.

interface RateBucket {
  count: number;
  resetAt: number;
}

/** Global stores — used by production code paths. */
export const _loginStore = new Map<string, RateBucket>();
/** Five attempts per normalized email/IP pair. */
export const _registerStore = new Map<string, RateBucket>();
/** A separate ceiling prevents bypassing the identity limit by rotating emails. */
export const _registerIpStore = new Map<string, RateBucket>();

const REGISTER_IDENTITY_MAX_ATTEMPTS = 5;
const REGISTER_IP_MAX_ATTEMPTS = 25;
const REGISTER_WINDOW_MS = 15 * 60 * 1000;

/** Normalize the identity used by registration throttling and account storage. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Checks whether `key` has exceeded `maxAttempts` within `windowMs`.
 * Returns true if the request should proceed, false if it should be throttled.
 * Accepts an injectable `store` for test isolation.
 */
export function rateLimitCheck(
  key: string,
  maxAttempts: number,
  windowMs: number,
  store: Map<string, RateBucket> = _loginStore,
): boolean {
  const now = Date.now();
  const existing = store.get(key);
  if (!existing || now > existing.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (existing.count >= maxAttempts) return false;
  existing.count += 1;
  return true;
}

/**
 * Apply both registration limits:
 * - each normalized email/IP pair gets the original five-attempt allowance;
 * - each IP gets a larger aggregate allowance so shared networks do not
 *   unnecessarily share the original five-attempt bucket.
 *
 * The aggregate limit is checked first so a caller cannot evade throttling by
 * changing the email on every request. An attempt that fails the identity
 * limit still counts against the aggregate IP budget.
 */
export function registrationRateLimitCheck(
  ip: string,
  email: string,
  identityStore: Map<string, RateBucket> = _registerStore,
  ipStore: Map<string, RateBucket> = _registerIpStore,
): boolean {
  if (!rateLimitCheck(ip, REGISTER_IP_MAX_ATTEMPTS, REGISTER_WINDOW_MS, ipStore)) {
    return false;
  }

  return rateLimitCheck(
    `${ip}\u0000${normalizeEmail(email)}`,
    REGISTER_IDENTITY_MAX_ATTEMPTS,
    REGISTER_WINDOW_MS,
    identityStore,
  );
}

// ─── JWT helpers ──────────────────────────────────────────────────────────────

function jwtSecret(): Uint8Array {
  const s = process.env["SESSION_SECRET"];
  if (!s) throw new Error("SESSION_SECRET is not set");
  return new TextEncoder().encode(s);
}

export async function signToken(userId: string, email: string): Promise<string> {
  return new SignJWT({ sub: userId, email })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(TOKEN_TTL)
    .sign(jwtSecret());
}

export async function verifyToken(
  token: string,
): Promise<{ userId: string; email: string } | null> {
  try {
    const { payload } = await jwtVerify(token, jwtSecret());
    const userId = payload.sub;
    const email = payload.email;
    if (typeof userId !== "string" || typeof email !== "string") return null;
    return { userId, email };
  } catch {
    return null;
  }
}

/** Verify both JWT integrity and that its account still exists. */
export async function verifyLiveUserToken(
  token: string,
): Promise<{ userId: string; email: string } | null> {
  const payload = await verifyToken(token);
  if (!payload) return null;
  const [user] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.id, payload.userId))
    .limit(1);
  return user ? payload : null;
}

// ─── Password policy ──────────────────────────────────────────────────────────

export function validatePassword(password: unknown): string | null {
  if (typeof password !== "string") return "Password must be a string";
  if (password.length < MIN_PASSWORD_LENGTH)
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
  return null; // valid
}

// ─── Routes ───────────────────────────────────────────────────────────────────

// POST /api/auth/register
router.post("/auth/register", async (req: Request, res: Response) => {
  const ip = req.ip ?? "unknown";
  const {
    email,
    password,
    acceptedTerms,
    acceptedPrivacy,
    acceptedAiConsent,
    aiConsentVersion,
  } = (req.body ?? {}) as {
    email?: unknown;
    password?: unknown;
    acceptedTerms?: unknown;
    acceptedPrivacy?: unknown;
    acceptedAiConsent?: unknown;
    aiConsentVersion?: unknown;
  };
  const emailForRateLimit = typeof email === "string" ? email : "<invalid>";
  if (!registrationRateLimitCheck(ip, emailForRateLimit)) {
    res
      .set("Retry-After", "900")
      .status(429)
      .json({ error: "Too many requests. Try again later." });
    return;
  }

  if (typeof email !== "string" || !email.includes("@")) {
    res.status(400).json({ error: "Valid email required" });
    return;
  }
  const normalizedEmail = normalizeEmail(email);
  const pwError = validatePassword(password);
  if (pwError) {
    res.status(400).json({ error: pwError });
    return;
  }
  if (acceptedTerms !== true || acceptedPrivacy !== true) {
    res.status(400).json({
      error: "You must accept the Terms of Service and Privacy Policy to create an account",
      code: "LEGAL_CONSENT_REQUIRED",
    });
    return;
  }
  if (
    acceptedAiConsent !== true ||
    aiConsentVersion !== AI_CONSENT_VERSION
  ) {
    res.status(400).json({
      error:
        "You must review and agree to FRAME's current AI data use before creating an account",
      code: "AI_CONSENT_REQUIRED",
      version: AI_CONSENT_VERSION,
    });
    return;
  }

  // Reject if email already registered.
  const [existing] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.email, normalizedEmail))
    .limit(1);
  if (existing) {
    res.status(409).json({ error: "An account with that email already exists" });
    return;
  }

  const id = crypto.randomUUID();
  const hashedPassword = await bcrypt.hash(password as string, BCRYPT_ROUNDS);
  const acceptedAt = new Date();
  await db.insert(usersTable).values({
    id,
    email: normalizedEmail,
    hashedPassword,
    legalConsentVersion: LEGAL_CONSENT_VERSION,
    legalConsentAt: acceptedAt,
    aiAnalysisConsentVersion: AI_CONSENT_VERSION,
    aiAnalysisConsentAt: acceptedAt,
  });

  const token = await signToken(id, normalizedEmail);
  res.status(201).json({ token, userId: id });
});

// POST /api/auth/login
router.post("/auth/login", async (req: Request, res: Response) => {
  const ip = req.ip ?? "unknown";
  if (!rateLimitCheck(ip, 10, 15 * 60 * 1000, _loginStore)) {
    // Generic message — do not reveal whether the account exists.
    res
      .set("Retry-After", "900")
      .status(429)
      .json({ error: "Too many requests. Try again later." });
    return;
  }

  const { email, password } = (req.body ?? {}) as { email?: unknown; password?: unknown };
  if (typeof email !== "string" || typeof password !== "string") {
    res.status(400).json({ error: "Email and password required" });
    return;
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, normalizeEmail(email)))
    .limit(1);

  // Always run bcrypt.compare — full cost-10 work regardless of account existence,
  // so response timing does not reveal whether an email is registered.
  const hashToCompare = user?.hashedPassword ?? DUMMY_HASH;
  const passwordMatches = await bcrypt.compare(password, hashToCompare);
  const valid = user !== undefined && passwordMatches;

  if (!valid) {
    res.status(401).json({ error: "Incorrect email or password" });
    return;
  }

  const token = await signToken(user!.id, user!.email);
  res.json({ token, userId: user!.id });
});

// POST /api/auth/logout — client-side token drop; server is stateless
router.post("/auth/logout", (_req: Request, res: Response) => {
  res.json({ ok: true });
});

// GET /api/auth/me — returns identity from the Bearer token
router.get("/auth/me", async (req: Request, res: Response) => {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const payload = await verifyLiveUserToken(auth.slice(7));
  if (!payload) {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }
  res.json({ userId: payload.userId, email: payload.email });
});

export default router;
