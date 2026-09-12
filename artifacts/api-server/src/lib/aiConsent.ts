import type { AthleteFact, Fighter } from "@workspace/db";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { Request, Response } from "express";

// This is deliberately a date rather than a semver: changing the disclosure
// requires the user to review and accept it again.  The database column names
// remain ai_analysis_consent_* for backwards compatibility with existing data.
export const AI_CONSENT_VERSION = "2026-09-12";
// SDK-level retries cannot re-check consent between network attempts. Keep them
// disabled so every retry is explicit and passes through a fresh DB check.
export const AI_PROVIDER_MAX_RETRIES = 0;

export const AI_CONSENT_DISCLOSURE = {
  providers: ["Anthropic (Claude)", "OpenAI"],
  provider: "Anthropic",
  service: "Claude",
  purpose: "to provide FRAME's AI coaching, planning, memory, spirit-animal and performance-analysis features",
  collectionMethod:
    "You choose to use an AI feature and submit chat messages, profile details, training or session information, images, selected video stills, and other information you provide to FRAME.",
  use:
    "FRAME sends the minimum context needed for the requested feature to Anthropic/Claude and/or OpenAI, depending on the selected feature and provider, to generate coaching, plans, memory suggestions, spirit-animal descriptions, or performance analysis.",
  retention:
    "FRAME retains account data and generated results according to the Privacy Policy and until you delete them or your account. Providers process submitted requests under their applicable service terms and data-processing commitments; FRAME does not sell this information or use it for advertising.",
  sharedData: [
    "chat messages and the conversation context needed to answer them",
    "training data, session reflections, movement signals, scores, session type and clip duration",
    "athlete profile and context, including sport, experience, goals, weaknesses and relevant performance observations",
    "uploaded images or selected video stills, where applicable to the requested feature",
    "other user-provided information included in the request or needed to provide the feature",
  ],
  notShared: [
    "your email address and account ID",
    "raw video files; analysis uses selected stills and derived movement data where applicable",
  ],
} as const;

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
  res.status(403).json({
    error: "AI consent is required before using this feature.",
    code: "AI_CONSENT_REQUIRED",
    version: AI_CONSENT_VERSION,
  });
  return false;
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