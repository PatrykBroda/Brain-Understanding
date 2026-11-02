import type { Competition } from "./competition";

// A camp is finished once it is marked completed, or it is still "active" but
// its event date has passed (nothing flips status automatically). Cancelled
// camps are not history. Newest event first.
export function finishedCamps(camps: Competition[], now: Date = new Date()): Competition[] {
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  return camps
    .filter(
      (c) =>
        c.status === "completed" ||
        (c.status === "active" && new Date(c.eventDate).getTime() < startOfToday.getTime()),
    )
    .sort((a, b) => new Date(b.eventDate).getTime() - new Date(a.eventDate).getTime());
}
