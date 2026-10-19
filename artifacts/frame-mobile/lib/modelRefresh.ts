// The athlete model (/memory) is written on the server by things the native
// app can't see finishing: the memory extractor runs AFTER a chat reply has
// streamed, and video analysis runs inside the Analyse WebView. The tabs stay
// mounted, so without an explicit nudge the cached model never refetches and
// the Profile card / History show whatever was loaded at launch.
//
// Two query keys read the same endpoint (Profile + History use "memory";
// Home + State use "facts") — both must be refreshed together. "today" is the
// State / Today's Focus read, which also moves with what was just said.

export const MODEL_QUERY_KEYS = [["memory"], ["facts"], ["today"]] as const;

/** Delays after a chat reply for the server-side extractor to finish writing. */
export const POST_CHAT_REFRESH_MS = [4_000, 12_000] as const;

interface InvalidatingClient {
  invalidateQueries: (filters: { queryKey: readonly string[] }) => unknown;
}

export function refreshModel(qc: InvalidatingClient): void {
  for (const queryKey of MODEL_QUERY_KEYS) void qc.invalidateQueries({ queryKey });
}

/** Re-fetch the model shortly after a coach reply, once the extractor has had time to write. */
export function scheduleModelRefreshAfterChat(
  qc: InvalidatingClient,
  setTimer: (fn: () => void, ms: number) => unknown = setTimeout,
): void {
  for (const ms of POST_CHAT_REFRESH_MS) setTimer(() => refreshModel(qc), ms);
}
