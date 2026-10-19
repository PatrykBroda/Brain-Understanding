import { dateOfBirthFromParts, type DateOfBirthParts } from "./dateOfBirth";
import { SPORTS, LEGACY_SPORTS } from "./fighterOptions";

// Helpers for the ONBOARDING QUESTIONS section on Profile. There is no onboarding flow any more
// (sign-up goes straight into the app); the questions are answered and edited on the Profile tab.

/** The save must never leave the athlete on a spinner forever. */
export const SAVE_TIMEOUT_MS = 20_000;

// ── Validation ───────────────────────────────────────────────────────────────

/** Specific inline message for the date-of-birth field, or null when valid. */
export function dobStepError(parts: DateOfBirthParts, today = new Date()): string | null {
  const { day, month, year } = parts;
  if (!day || !month || !year) return "Enter your day, month and four-digit year.";
  if (year.length !== 4) return "Enter the year as four digits, like 1995.";
  const y = Number(year);
  if (y < 1900) return "Check the year. It looks too far back.";
  if (y > today.getUTCFullYear()) return "That year is in the future.";
  const m = Number(month);
  if (m < 1 || m > 12) return "The month should be between 1 and 12.";
  if (dateOfBirthFromParts(parts, today) == null) {
    const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const d = Number(day);
    if (d >= 1 && d <= daysInMonth) return "That date is in the future.";
    return `That month only has ${daysInMonth} days.`;
  }
  return null;
}

// ── Errors ───────────────────────────────────────────────────────────────────

function statusOf(error: unknown): number | null {
  const s = (error as { status?: unknown } | null)?.status;
  return typeof s === "number" ? s : null;
}

/** Plain-English reason saving the answers failed, never a raw server string. Answers stay on screen for a retry. */
export function describeSaveFailure(error: unknown): string {
  const status = statusOf(error);
  const raw = error instanceof Error ? error.message : "";

  if (status === 401 || status === 403) return "Your session has expired. Sign in again, then save again.";
  if (status === 400) {
    if (/date of birth|dateOfBirth/i.test(raw)) return "That date of birth wasn't accepted. Check it and tap Save again.";
    return "Something in your answers wasn't accepted. Check each answer and tap Save again.";
  }
  if (status === 429) return "Too many attempts. Wait a minute, then tap Save again.";
  if (status != null && status >= 500) {
    return "Our server hit a problem saving your answers. Your answers are kept. Tap Save to try again.";
  }
  if (/timed out|timeout|abort|network|failed to fetch|offline|connection/i.test(raw) || status == null) {
    return "We couldn't reach FRAME. Check your connection, then tap Save to try again. Your answers are kept.";
  }
  return "We couldn't save your answers. Tap Save to try again.";
}

/** Reject if `p` has not settled within `ms`, so a hung request cannot spin forever. */
export function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("Request timed out")), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

// ── Display ──────────────────────────────────────────────────────────────────

/** "bjj" -> "BJJ", "muay_thai" -> "Muay Thai", unknown keys title-cased. */
export function sportDisplayName(key: string | null | undefined): string {
  if (!key) return "";
  const hit = [...SPORTS, ...LEGACY_SPORTS].find((s) => s.key === key.trim().toLowerCase());
  if (hit) return hit.label;
  return key
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/(^|\s)\S/g, (c) => c.toUpperCase());
}

/** "BJJ BELT" -> "BJJ belt" (lib labels are shouty; screens use sentence case). */
export function sentenceCaseLabel(s: string): string {
  const lower = s.toLowerCase();
  return (lower.charAt(0).toUpperCase() + lower.slice(1)).replace(/\bbjj\b/gi, "BJJ");
}
