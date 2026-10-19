import { SYNOCHI_DEEP } from "./synochi.generated";

const STOPWORDS = new Set([
  "the", "and", "you", "for", "that", "with", "this", "but", "not", "are", "was",
  "have", "had", "has", "what", "when", "why", "how", "its", "into", "from",
  "they", "them", "their", "there", "then", "about", "just", "like", "also",
  "more", "than", "over", "under", "because", "while", "your", "mine", "very",
  "much", "some", "any", "one", "two", "get", "got", "can", "cant", "will",
  "wont", "should", "could", "would", "been", "being", "were", "still", "again",
  "yeah", "okay", "right", "really", "actually", "kinda", "sorta", "stuff",
  "thing", "things", "feel", "feels", "felt", "say", "said", "tell", "told",
  "make", "made", "makes", "want", "wanted", "need", "needs", "needed",
  "today", "yesterday", "now", "doing", "does", "did", "going", "went",
]);

const WIKI_LINK = /\[\[([^\]]+)\]\]/g;

/** Notes longer than this have their body-match score damped (not their explicit or title matches). */
const LONG_NOTE_CHARS = 6000;
/** Per-note and per-turn caps on deep-vault text injected into the prompt. */
export const DEEP_NODE_MAX_CHARS = 6000;
export const DEEP_TOTAL_MAX_CHARS = 20000;

/**
 * Cap what is injected for the selected nodes: each note to DEEP_NODE_MAX_CHARS and the
 * whole block to DEEP_TOTAL_MAX_CHARS, keeping the best-scored first. Pure.
 */
export function budgetNodes(
  nodes: RetrievedNode[],
  maxNode = DEEP_NODE_MAX_CHARS,
  maxTotal = DEEP_TOTAL_MAX_CHARS,
): RetrievedNode[] {
  const out: RetrievedNode[] = [];
  let used = 0;
  for (const n of nodes) {
    const room = maxTotal - used;
    if (room < 800) break;
    const limit = Math.min(maxNode, room);
    const body =
      n.body.length <= limit
        ? n.body
        : `${n.body.slice(0, limit).trimEnd()}\n[… cut for length — ask about a specific part to go deeper]`;
    out.push({ ...n, body });
    used += body.length;
  }
  return out;
}

interface DeepNode {
  folder: string;
  title: string;
  titleLower: string;
  body: string;
  bodyLower: string;
  titleTokens: string[];
}

let CACHE: DeepNode[] | null = null;

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t));
}

function getNodes(): DeepNode[] {
  if (CACHE) return CACHE;
  const out: DeepNode[] = [];
  // MODELS / MECHANISMS plus the shelved tails of the always-loaded layers.
  for (const folder of Object.keys(SYNOCHI_DEEP)) {
    const map = SYNOCHI_DEEP[folder]!;
    for (const title of Object.keys(map)) {
      const body = map[title] ?? "";
      out.push({
        folder,
        title,
        titleLower: title.toLowerCase(),
        body,
        bodyLower: body.toLowerCase(),
        titleTokens: tokenize(title),
      });
    }
  }
  CACHE = out;
  return out;
}

export interface RetrievedNode {
  folder: string;
  title: string;
  body: string;
  score: number;
  reason: "wiki-link" | "title-match" | "body-match";
}

function countWordOccurrences(haystack: string, needle: string, cap = 4): number {
  let count = 0;
  let idx = haystack.indexOf(needle);
  const last = haystack.length;
  while (idx !== -1 && count < cap) {
    const beforeChar = idx === 0 ? " " : haystack[idx - 1]!;
    const afterIdx = idx + needle.length;
    const afterChar = afterIdx === last ? " " : haystack[afterIdx]!;
    const before = !/[a-z0-9]/.test(beforeChar);
    const after = !/[a-z0-9]/.test(afterChar);
    if (before && after) count++;
    idx = haystack.indexOf(needle, idx + needle.length);
  }
  return count;
}

/**
 * Pick top-K MODELS/MECHANISMS nodes relevant to the given conversation slice.
 *
 * Scoring:
 *   - explicit [[Title]] mentions → forced inclusion (score 1000+)
 *   - title literal substring in query → very high boost
 *   - title token overlap with query tokens → high boost
 *   - body token occurrences (capped per token) → low boost
 */
export function selectRelevantNodes(queryText: string, k = 8): RetrievedNode[] {
  if (!queryText.trim()) return [];
  const nodes = getNodes();
  const query = queryText.toLowerCase();

  // explicit wiki-link mentions
  const explicit = new Set<string>();
  WIKI_LINK.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = WIKI_LINK.exec(queryText)) !== null) {
    explicit.add(m[1]!.trim().toLowerCase());
  }

  const queryTokens = tokenize(queryText);
  const queryFreq = new Map<string, number>();
  for (const t of queryTokens) queryFreq.set(t, (queryFreq.get(t) ?? 0) + 1);

  if (queryFreq.size === 0 && explicit.size === 0) return [];

  type Scored = RetrievedNode;
  const scored: Scored[] = [];

  for (const n of nodes) {
    let score = 0;
    let reason: Scored["reason"] = "body-match";

    if (explicit.has(n.titleLower)) {
      score += 1000;
      reason = "wiki-link";
    }

    // title literal substring (only if title is at least 2 words to avoid noise)
    if (n.titleTokens.length >= 2 && query.includes(n.titleLower)) {
      score += 60;
      if (reason !== "wiki-link") reason = "title-match";
    }

    // title token overlap
    let titleHits = 0;
    for (const tt of n.titleTokens) {
      const f = queryFreq.get(tt);
      if (f) {
        titleHits += f;
      }
    }
    if (titleHits > 0) {
      score += titleHits * 8;
      if (reason === "body-match") reason = "title-match";
    }

    // body token occurrences — only tokens of length >=4 to keep signal:noise high
    let bodyHits = 0;
    for (const [tok, f] of queryFreq) {
      if (tok.length < 4) continue;
      const c = countWordOccurrences(n.bodyLower, tok, 4);
      if (c > 0) bodyHits += c * f;
    }
    // A very long note matches almost every query on sheer word count. Damp that so
    // length alone does not put one note into every turn (it was in 19 of 19 test turns).
    score += bodyHits / Math.max(1, Math.sqrt(n.bodyLower.length / LONG_NOTE_CHARS));

    if (score > 0) {
      scored.push({
        folder: n.folder,
        title: n.title,
        body: n.body,
        score,
        reason,
      });
    }
  }

  scored.sort((a, b) => b.score - a.score);

  // de-dupe by title (shouldn't happen across folders, but defend)
  const seen = new Set<string>();
  const out: Scored[] = [];
  for (const s of scored) {
    if (seen.has(s.title)) continue;
    seen.add(s.title);
    out.push(s);
    if (out.length >= k) break;
  }
  return out;
}

/**
 * Build a single query string from recent conversation turns.
 * Weighted: the latest user message counts more by being repeated.
 */
export function buildRetrievalQuery(
  recentTurns: { role: "user" | "assistant"; content: string }[],
  latestUserText: string,
): string {
  const parts: string[] = [];
  // last ~6 turns of text
  for (const t of recentTurns.slice(-6)) {
    if (t.content.trim()) parts.push(t.content);
  }
  // latest user text gets triple weight so it dominates retrieval
  if (latestUserText.trim()) {
    parts.push(latestUserText);
    parts.push(latestUserText);
  }
  return parts.join("\n\n");
}
