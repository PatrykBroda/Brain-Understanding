// How much text one coach turn is allowed to carry. The always-loaded vault is
// capped at build time (build-synochi.mjs); this covers the parts that grow per
// turn: the conversation history and the deep-vault notes (vaultRetrieval.ts).
// COACH_INPUT_BUDGET=off puts the old unbounded behaviour back (rollback switch).

export const CHARS_PER_TOKEN = 4;
/** About 12k tokens of earlier conversation. The newest message is always kept. */
export const HISTORY_MAX_CHARS = 48_000;

export function budgetEnabled(): boolean {
  return process.env["COACH_INPUT_BUDGET"] !== "off";
}

/** Rough token estimate (chars / 4). Real counts come from the provider's usage report. */
export function estimateTokens(chars: number): number {
  return Math.ceil(chars / CHARS_PER_TOKEN);
}

/**
 * Keep the newest messages that fit `maxChars` (the last one always stays), and make
 * sure the kept slice starts with a user turn, which the providers require.
 */
export function trimHistory<T extends { role: string; content: string }>(
  history: T[],
  maxChars: number = HISTORY_MAX_CHARS,
): T[] {
  if (history.length <= 1) return history;
  let used = 0;
  let from = history.length;
  for (let i = history.length - 1; i >= 0; i--) {
    const len = history[i]!.content.length;
    if (from !== history.length && used + len > maxChars) break;
    used += len;
    from = i;
  }
  let kept = history.slice(from);
  while (kept.length > 1 && kept[0]!.role !== "user") kept = kept.slice(1);
  return kept;
}
