/** Free (non-FRAME+) users get this many saved self analyses, lifetime. */
export const FREE_ANALYSIS_LIMIT = 2;

export type FreeAnalysisAllowance = { limit: number; used: number; remaining: number };

export function freeAnalysisAllowance(used: number): FreeAnalysisAllowance {
  const safeUsed = Math.max(0, Math.floor(used) || 0);
  return { limit: FREE_ANALYSIS_LIMIT, used: safeUsed, remaining: Math.max(0, FREE_ANALYSIS_LIMIT - safeUsed) };
}

/**
 * Both footage endpoints must reject users without access before processing or
 * fetching a clip. Free users may analyse their own footage until their free
 * allowance is spent (`freeUsed` = saved self analyses so far); opponent scouting
 * is FRAME+ only. Omitting `freeUsed` assumes the allowance is spent.
 */
export function analysisUpgradeRequired(
  plan: "free" | "frame_plus",
  subject: "self" | "opponent" = "self",
  freeUsed: number = FREE_ANALYSIS_LIMIT,
) {
  if (plan !== "free") return null;
  if (subject === "self" && freeAnalysisAllowance(freeUsed).remaining > 0) return null;
  return {
    error: subject === "opponent"
      ? "Opponent scouting is a FRAME+ feature."
      : `You've used your ${FREE_ANALYSIS_LIMIT} free video analyses. Video analysis is a FRAME+ feature.`,
    code: "FRAME_PLUS_REQUIRED",
    feature: subject === "opponent" ? "opponent_analysis" : "video_analysis",
  };
}
