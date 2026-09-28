/** Both footage endpoints must reject free users before processing or fetching a clip. */
export function analysisUpgradeRequired(
  plan: "free" | "frame_plus",
  subject: "self" | "opponent" = "self",
) {
  if (plan !== "free") return null;
  return {
    error: subject === "opponent"
      ? "Opponent scouting is a FRAME+ feature."
      : "Video analysis is a FRAME+ feature.",
    code: "FRAME_PLUS_REQUIRED",
    feature: subject === "opponent" ? "opponent_analysis" : "video_analysis",
  };
}