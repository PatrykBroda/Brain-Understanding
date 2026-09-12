import type { AthleteFact, Fighter } from "@workspace/db";
import { db, usersTable } from "@workspace/db";
import {
  AI_CONSENT_DISCLOSURE,
  AI_CONSENT_VERSION,
} from "@workspace/ai-consent";
import { eq } from "drizzle-orm";
import type { NextFunction, Request, Response } from "express";

export { AI_CONSENT_DISCLOSURE, AI_CONSENT_VERSION };
// SDK-level retries cannot re-check consent between network attempts. Keep them
// disabled so every retry is explicit and passes through a fresh DB check.
export const AI_PROVIDER_MAX_RETRIES = 0;

// API/source compatibility for clients and code that still use the old
// analysis-specific names.  The contract is now intentionally broader.
export const AI_ANALYSIS_CONSENT_VERSION = AI_CONSENT_VERSION;
export const AI_ANALYSIS_DISCLOSURE = AI_CONSENT_DISCLOSURE;

export function hasCurrentAiConsent(
  version: string | null | undefined,
  acceptedAt: Date | string | null | undefined,
): boolean {
  if (version !== AI_CONSENT_VERSION || acceptedAt == null) return false;
  const date = acceptedAt instanceof Date ? acceptedAt : new Date(acceptedAt);
  return !Number.isNaN(date.getTime());
}

export async function getAiConsent(userId: string) {
  const [consent] = await db
    .select({
      version: usersTable.aiAnalysisConsentVersion,
      acceptedAt: usersTable.aiAnalysisConsentAt,
    })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  return consent;
}

/** Reusable DB-backed guard for every feature that can transmit data to AI. */
export async function hasAiConsentForUser(userId: string): Promise<boolean> {
  const consent = await getAiConsent(userId);
  return hasCurrentAiConsent(consent?.version, consent?.acceptedAt);
}

export class AiConsentRequiredError extends Error {
  readonly code = "AI_CONSENT_REQUIRED" as const;

  constructor() {
    super("AI consent is required before using this feature.");
    this.name = "AiConsentRequiredError";
  }
}

/**
 * Interactive-route guard.  It intentionally returns JSON (rather than
 * redirecting) so mobile/web clients can open the consent screen.
 */
export async function requireAiConsent(req: Request, res: Response): Promise<boolean> {
  const userId = req.userId;
  if (userId && (await hasAiConsentForUser(userId))) return true;
  sendAiConsentRequired(res);
  return false;
}

function sendAiConsentRequired(res: Response): void {
  res.status(403).json({
    error: "AI consent is required before using this feature.",
    code: "AI_CONSENT_REQUIRED",
    version: AI_CONSENT_VERSION,
  });
}

/**
 * Authenticated FRAME routes are unavailable until the account has accepted
 * the current disclosure. This is mounted only after the public/auth routes
 * and the authenticated consent and account-deletion routes, so a user can
 * always review/update consent or permanently delete the account.
 *
 * Provider-boundary callers still use requireAiConsent immediately before
 * their provider request. This route guard is not a replacement for those
 * checks: it protects authenticated navigation while the provider checks
 * protect each individual transmission and retry boundary.
 */
export async function requireCurrentAiConsent(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (req.userId && (await hasAiConsentForUser(req.userId))) {
    next();
    return;
  }
  sendAiConsentRequired(res);
}

const PERFORMANCE_FACT_CATEGORIES = new Set([
  "strength",
  "weakness",
  "technical_knowledge",
  "pattern",
  "goal",
]);

/**
 * Build the narrow athlete context allowed to leave FRAME for video analysis.
 * Direct identifiers and unrelated life/event/preference history are excluded.
 */
export function minimiseAnalysisContext(fighter: Fighter, facts: AthleteFact[]) {
  const safeFighter = {
    ...fighter,
    name: "",
    age: 0,
    gym: "",
    bio: "",
    goals: "",
    weaknesses: "",
    heightCm: null,
    weightKg: null,
  };
  const safeFacts = facts.filter((fact) => PERFORMANCE_FACT_CATEGORIES.has(fact.category));
  return { fighter: safeFighter, facts: safeFacts };
}