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
