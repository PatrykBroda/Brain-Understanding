/**
 * POST /api/auth/forgot-password  { email }                       — emails a 6-digit code
 * POST /api/auth/reset-password   { email, code, newPassword }    — sets the new password
 *
 * No account enumeration: forgot-password answers the same 200 whether or not the email is
 * registered (and holds a minimum response time), and every code failure is the same generic 400.
 * Both routes are throttled per IP and per email; the code itself is capped at 5 guesses.
 */

import { Router, type Request, type Response } from "express";
import { normalizeEmail, rateLimitCheck, validatePassword, type RateBucket } from "./auth";
import {
  CODE_RE,
  completePasswordReset,
  defaultResetDeps,
  requestPasswordReset,
  type ResetDeps,
} from "../lib/passwordReset";

const router = Router();

const WINDOW_MS = 15 * 60 * 1000;
const FORGOT_IP_MAX = 10;
const FORGOT_EMAIL_MAX = 3;
const RESET_IP_MAX = 20;
const RESET_EMAIL_MAX = 10;

export const _forgotIpStore = new Map<string, RateBucket>();
export const _forgotEmailStore = new Map<string, RateBucket>();
export const _resetIpStore = new Map<string, RateBucket>();
export const _resetEmailStore = new Map<string, RateBucket>();

/** Floor on forgot-password latency so "no such account" isn't measurably faster. Tests set it to 0. */
export const resetRuntime = { minResponseMs: 400, deps: defaultResetDeps as ResetDeps };

export const FORGOT_MESSAGE = "If that email is registered, we've sent a 6-digit code to it.";
export const INVALID_CODE_BODY = { error: "That code is invalid or has expired.", code: "INVALID_CODE" };

function tooMany(res: Response): void {
  res.set("Retry-After", "900").status(429).json({ error: "Too many requests. Try again later." });
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

router.post("/auth/forgot-password", async (req: Request, res: Response) => {
  const started = Date.now();
  const ip = req.ip ?? "unknown";
  const { email } = (req.body ?? {}) as { email?: unknown };
  const emailKey = typeof email === "string" ? normalizeEmail(email) : "<invalid>";

  // Both buckets are charged on every call, so the 429 never depends on the account existing.
  const ipOk = rateLimitCheck(ip, FORGOT_IP_MAX, WINDOW_MS, _forgotIpStore);
  const emailOk = rateLimitCheck(emailKey, FORGOT_EMAIL_MAX, WINDOW_MS, _forgotEmailStore);
  if (!ipOk || !emailOk) {
    tooMany(res);
    return;
  }

  if (typeof email !== "string" || !email.includes("@")) {
    res.status(400).json({ error: "Valid email required" });
    return;
  }

  try {
    await requestPasswordReset(emailKey, ip, resetRuntime.deps);
  } catch (err) {
    // Swallowed on purpose: a distinct error here would reveal that the account exists.
    req.log.error({ err }, "forgot-password failed");
  }
  const wait = resetRuntime.minResponseMs - (Date.now() - started);
  if (wait > 0) await sleep(wait);
  res.json({ ok: true, message: FORGOT_MESSAGE });
});

router.post("/auth/reset-password", async (req: Request, res: Response) => {
  const ip = req.ip ?? "unknown";
  const { email, code, newPassword } = (req.body ?? {}) as {
    email?: unknown;
    code?: unknown;
    newPassword?: unknown;
  };
  const emailKey = typeof email === "string" ? normalizeEmail(email) : "<invalid>";
  const ipOk = rateLimitCheck(ip, RESET_IP_MAX, WINDOW_MS, _resetIpStore);
  const emailOk = rateLimitCheck(emailKey, RESET_EMAIL_MAX, WINDOW_MS, _resetEmailStore);
  if (!ipOk || !emailOk) {
    tooMany(res);
    return;
  }

  if (typeof email !== "string" || typeof code !== "string") {
    res.status(400).json({ error: "Email, code and new password required" });
    return;
  }
  const pwError = validatePassword(newPassword);
  if (pwError) {
    res.status(400).json({ error: pwError, code: "INVALID_PASSWORD" });
    return;
  }
  if (!CODE_RE.test(code.trim())) {
    res.status(400).json(INVALID_CODE_BODY);
    return;
  }

  let ok = false;
  try {
    ok = await completePasswordReset(emailKey, code.trim(), newPassword as string, resetRuntime.deps);
  } catch (err) {
    req.log.error({ err }, "reset-password failed");
    res.status(500).json({ error: "Something went wrong. Please try again." });
    return;
  }
  if (!ok) {
    res.status(400).json(INVALID_CODE_BODY);
    return;
  }
  res.json({ ok: true });
});

export default router;
