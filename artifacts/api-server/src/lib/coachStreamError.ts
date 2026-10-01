// Turns a failure inside the coach SSE stream into a stable `code` + a message
// the athlete can act on. The raw provider error goes to the logs only — it used
// to be forwarded verbatim, and clients had no way to tell "your photo was
// rejected" from "the AI is down", so mobile showed "Something broke" for both.

export type CoachStreamErrorCode =
  | "AI_CONSENT_REQUIRED"
  | "IMAGE_REJECTED"
  | "AI_BUSY"
  | "AI_TIMEOUT"
  | "AI_UNAVAILABLE"
  | "AI_ERROR";

export type CoachStreamError = { code: CoachStreamErrorCode; error: string };

const MESSAGES: Record<CoachStreamErrorCode, string> = {
  AI_CONSENT_REQUIRED: "AI consent is required before using this feature.",
  IMAGE_REJECTED:
    "FRAME couldn't read that image. Try a different photo or a screenshot of it.",
  AI_BUSY: "FRAME is under heavy load right now. Give it a minute and try again.",
  AI_TIMEOUT: "FRAME took too long to answer. Try again.",
  AI_UNAVAILABLE: "FRAME's coach is unreachable right now. Try again in a moment.",
  AI_ERROR: "FRAME couldn't reply to that. Try again.",
};

function field(err: unknown, key: string): unknown {
  return typeof err === "object" && err !== null ? (err as Record<string, unknown>)[key] : undefined;
}

export function classifyCoachStreamError(err: unknown): CoachStreamError {
  const code = (c: CoachStreamErrorCode): CoachStreamError => ({ code: c, error: MESSAGES[c] });

  if (field(err, "code") === "AI_CONSENT_REQUIRED") return code("AI_CONSENT_REQUIRED");

  const name = String(field(err, "name") ?? (err as object | null)?.constructor?.name ?? "");
  const message = err instanceof Error ? err.message : String(err ?? "");
  const status = typeof field(err, "status") === "number" ? (field(err, "status") as number) : undefined;

  if (/Timeout/i.test(name) || /timed? ?out/i.test(message)) return code("AI_TIMEOUT");
  if (/Connection/i.test(name) || /ECONNRESET|ECONNREFUSED|ENOTFOUND|socket hang up|fetch failed/i.test(message)) {
    return code("AI_UNAVAILABLE");
  }
  if (status === 429 || status === 529 || /overloaded/i.test(message)) return code("AI_BUSY");
  if (status !== undefined && status >= 500) return code("AI_UNAVAILABLE");
  if ((status === 400 || status === 413 || status === 422) && /image|media|base64/i.test(message)) {
    return code("IMAGE_REJECTED");
  }
  return code("AI_ERROR");
}
