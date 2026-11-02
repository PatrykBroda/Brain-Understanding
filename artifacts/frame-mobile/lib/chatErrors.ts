// Athlete-facing copy for everything that can go wrong sending a chat message
// or attaching a file. Keyed by the server's stable error `code` / HTTP status,
// never by raw server text — older servers forwarded raw provider errors, and
// "Something broke" for every failure gave the athlete nothing to act on.

type ApiErrorLike = { status: number; code?: string; message: string };

function isApiError(error: unknown): error is ApiErrorLike {
  return (
    typeof error === "object" &&
    error !== null &&
    typeof (error as { status?: unknown }).status === "number"
  );
}

function isNetworkError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return /network request failed|network connection was lost|network error|offline|internet connection/i.test(
    error.message,
  );
}

const STREAM_CODE_MESSAGES: Record<string, string> = {
  AI_CONSENT_REQUIRED: "FRAME needs your AI permission before it can reply. Send again to review it.",
  IMAGE_REJECTED: "FRAME couldn't read that image. Try a different photo or a screenshot of it.",
  AI_BUSY: "FRAME is under heavy load right now. Give it a minute and try again.",
  AI_TIMEOUT: "FRAME took too long to answer. Try again.",
  AI_UNAVAILABLE: "FRAME's coach is unreachable right now. Try again in a moment.",
  AI_ERROR: "FRAME couldn't reply to that. Try again.",
};

/** Error event that arrives inside the SSE stream (after the request was accepted). */
export function streamErrorMessage(code: string | undefined, hadAttachments: boolean): string {
  if (code && STREAM_CODE_MESSAGES[code]) return STREAM_CODE_MESSAGES[code];
  return hadAttachments
    ? "FRAME couldn't process that message with its attachment. Try again, or send it without the file."
    : STREAM_CODE_MESSAGES.AI_ERROR;
}

/** The chat request itself failed before any reply streamed (402 is handled by the caller). */
export function sendErrorMessage(error: unknown, opts: { timedOut: boolean }): string {
  if (opts.timedOut) return "That hung — the line went quiet. Try again.";
  if (isApiError(error)) {
    if (error.status === 401) return "Your session expired. Sign in again to keep going.";
    if (error.status === 403) {
      return /attachment/i.test(error.message)
        ? "That attachment couldn't be sent. Remove it, attach it again and resend."
        : "You don't have access to that. Sign out and back in, then try again.";
    }
    if (error.status === 413) return "That message is too large to send.";
    if (error.status === 429) return "You're sending too fast. Wait a moment and try again.";
    if (error.status >= 500) return "FRAME's server hit a problem. Try again in a moment.";
    return "That message couldn't be sent. Try again.";
  }
  return "Connection dropped. Check your signal and try again.";
}

/** Attaching (uploading) a photo or video failed. */
export function uploadErrorMessage(error: unknown): string {
  if (isNetworkError(error)) return "Upload failed — check your connection and try again.";
  if (isApiError(error)) {
    if (error.status === 413) return "That file is too large (max 12MB). Try a shorter clip or a smaller photo.";
    if (error.status === 415) return "That file type isn't supported. Use a JPG, PNG, WebP, GIF, MP4 or MOV.";
    if (error.status === 401) return "Your session expired. Sign in again to attach files.";
    if (error.status === 403) return "Finish setting up your profile before attaching files.";
    if (error.status === 404) return "This conversation was reset. Send a message first, then attach again.";
    if (error.status === 400) return "That file couldn't be read. Try a different one.";
    if (error.status >= 500) return "FRAME's server couldn't save that file. Try again in a moment.";
    return "That file couldn't be attached. Try a different one.";
  }
  return "Upload failed. Try again.";
}

// ── Send reliability ────────────────────────────────────────────────────────

/** Typing indicator copy: shown at once, then swapped if the reply is slow. */
export const THINKING_LABEL = "Thinking…";
export const STILL_WORKING_LABEL = "Still working on this…";
export const STILL_WORKING_AFTER_MS = 15_000;
/** Shown under a reply whose stream stopped before the server said it was done. */
export const REPLY_INTERRUPTED_LABEL = "Reply interrupted.";

/**
 * Idempotency key for one send. Every retry of that send reuses it, so the server
 * returns (or attaches to) the same reply instead of generating a second one.
 * Short and limited to [A-Za-z0-9_-] to match what the server accepts.
 */
export function newClientMessageId(now: number = Date.now(), rand: () => number = Math.random): string {
  const r = () => Math.floor(rand() * 36 ** 6).toString(36).padStart(6, "0");
  return `m_${now.toString(36)}_${r()}${r()}`;
}

export type StoredChatMessage = { role: string; clientMessageId?: string | null };

/**
 * True when the server has saved the COMPLETE reply to this send. The server tags
 * a finished reply with the send's id; a partial reply saved after a dropped
 * stream is left untagged, so it never counts here.
 */
export function hasCompleteReply(messages: StoredChatMessage[], clientMessageId: string): boolean {
  return messages.some((m) => m.role === "assistant" && m.clientMessageId === clientMessageId);
}

// ── Automatic retry ─────────────────────────────────────────────────────────

/** Waits before the 1st and 2nd automatic retry of a send that produced nothing. */
export const AUTO_RETRY_DELAYS_MS = [1_500, 4_000] as const;

// The server already retried the provider before reporting these, but a cold
// prompt cache or a brief overload usually clears by the time the athlete taps
// Retry — so do that for them.
const RETRYABLE_STREAM_CODES = new Set(["AI_TIMEOUT", "AI_BUSY", "AI_UNAVAILABLE"]);

/**
 * How long to wait before silently re-sending the same message (same client
 * message id, so the server attaches to or replaces the turn), or null to show
 * the error instead. Only ever retries a send that produced no reply text.
 */
export function autoRetryDelayMs(f: {
  /** 0 for the first failure, 1 for the failure of the first retry, … */
  attempt: number;
  receivedContent: boolean;
  /** Error code from an in-stream server error event, if one arrived. */
  streamCode?: string;
  /** The request threw (HTTP error, network drop, or the watchdog abort). */
  error?: unknown;
  timedOut?: boolean;
}): number | null {
  if (f.receivedContent || f.attempt >= AUTO_RETRY_DELAYS_MS.length) return null;
  const delay = AUTO_RETRY_DELAYS_MS[f.attempt];
  if (f.streamCode) return RETRYABLE_STREAM_CODES.has(f.streamCode) ? delay : null;
  if (f.error === undefined) return delay; // stream closed with no reply and no error
  if (f.timedOut) return delay;
  if (isApiError(f.error)) {
    const s = f.error.status;
    return s === 408 || s === 429 || s >= 500 ? delay : null;
  }
  return delay; // network drop
}
