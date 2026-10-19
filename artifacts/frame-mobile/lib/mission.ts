// Weekly Mission: the shapes GET /planner/current and POST /planner/generate return, and
// the small pure helpers the screen uses. The mobile screen used to read a different,
// older shape (sections / content / focusSummary) and a toggle route the server does not
// have, which is why Weekly Mission spun forever and Generate did nothing on iOS.

import { addDaysTo, formatDay } from "./localDay";

export type PlanCategory = "fix" | "train" | "technique" | "regulate" | "goal_step";

export interface PlanItem {
  key: string;
  category: PlanCategory;
  title: string;
  detail: string;
  suggestedDays: string;
  sourceLabel: string;
  /** Free-tier preview stub: title + category only. */
  locked?: boolean;
}

export interface WeeklyPlan {
  id: number;
  weekStart: string;
  aiProvider: string;
  items: PlanItem[];
  rationale: string | null;
  createdAt: string;
}

export interface PlannerResponse {
  plan: WeeklyPlan | null;
  completions: string[];
  weekStart: string;
  canGenerate?: boolean;
  generating?: boolean;
  preview?: boolean;
}

export type MissionErrorCode =
  | "AI_CONSENT_REQUIRED"
  | "NO_SIGNALS"
  | "NO_FIGHTER"
  | "AI_BUSY"
  | "GENERATION_TIMEOUT"
  | "GENERATION_INVALID"
  | "GENERATION_FAILED"
  | "FRAME_PLUS_REQUIRED";

export const CATEGORY_ORDER: PlanCategory[] = ["fix", "goal_step", "train", "technique", "regulate"];

export const CATEGORY_LABEL: Record<PlanCategory, string> = {
  fix: "Primary weakness",
  goal_step: "Structural objective",
  train: "Daily execution",
  technique: "Technical drilling",
  regulate: "Recovery",
};

/** Group items by category in display order, dropping empty groups. */
export function groupItems(items: PlanItem[]): { category: PlanCategory; items: PlanItem[] }[] {
  return CATEGORY_ORDER.map((category) => ({ category, items: items.filter((i) => i.category === category) })).filter(
    (g) => g.items.length > 0,
  );
}

/** "19 Oct – 25 Oct" for a plan week starting on `weekStartIso` (a Monday, UTC midnight). */
export function formatWeekRange(weekStartIso: string): string {
  const start = weekStartIso.slice(0, 10);
  return `${formatDay(start).replace(/^\w+ /, "")} – ${formatDay(addDaysTo(start, 6)).replace(/^\w+ /, "")}`;
}

/** The longest the app waits for a mission to be built before telling the athlete. Server budget is 55s. */
export const GENERATE_TIMEOUT_MS = 75_000;

/** Athlete-facing copy for a failed generation. Prefers the server's own message. */
export function missionErrorMessage(err: unknown, timedOut: boolean): string {
  if (timedOut) return "Building your mission took too long. Nothing was lost. Try again.";
  const e = err as { message?: string; status?: number } | null;
  // Only an HTTP error from FRAME's own server carries a message written for the athlete.
  if (e && typeof e.status === "number") {
    if (e.message && !/^Request failed with status/.test(e.message) && !/^HTTP \d/.test(e.message)) return e.message;
    if (e.status === 401) return "Your session expired. Sign in again.";
    if (e.status >= 500) return "Your mission couldn't be built. Try again in a moment.";
  }
  return "Couldn't reach FRAME. Check your connection and try again.";
}
