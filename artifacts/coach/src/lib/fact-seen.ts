// When an observation was last seen. A re-sighting (chat, footage, calibration,
// athlete "yes") moves lastConfirmedAt forward; creation is the floor. History
// buckets by this so a strengthened observation shows up on the day it was
// re-seen, not only the day it was first recorded.
export function factLastSeen(f: { createdAt: string; lastConfirmedAt?: string | null }): string {
  const created = new Date(f.createdAt).getTime();
  const confirmed = f.lastConfirmedAt ? new Date(f.lastConfirmedAt).getTime() : NaN;
  return Number.isNaN(confirmed) || confirmed < created ? f.createdAt : (f.lastConfirmedAt as string);
}

/** Delays after a coach reply for the server-side memory extractor to finish writing. */
export const POST_CHAT_MEMORY_REFRESH_MS = [4_000, 12_000] as const;

/** "Tue 20 Oct 2026" for an ISO timestamp, on the browser's calendar. */
export function observationDate(iso: string | undefined | null): string {
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return "an unknown date";
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

/**
 * What opens in the coach chat when an observation is tapped: the observation itself and
 * its date, ready to send, so the athlete can discuss it without retyping. Older
 * observations are dated, never presented as current.
 */
export function observationPrompt(
  f: { topic?: string | null; content: string; createdAt: string; lastConfirmedAt?: string | null },
  categoryLabel: string,
): string {
  const seen = observationDate(factLastSeen(f));
  const first = observationDate(f.createdAt);
  const when = first === seen ? `recorded ${seen}` : `first recorded ${first}, last seen ${seen}`;
  const what = f.topic && f.topic.trim() && f.topic.trim() !== f.content.trim() ? `${f.topic.trim()}: ${f.content.trim()}` : f.content.trim();
  return `Let's talk about this observation FRAME holds on me (${categoryLabel.toLowerCase()}, ${when}): "${what}". Is it still true for me now, and what should I do about it?`;
}
