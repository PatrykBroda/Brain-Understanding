import { factLastSeen, type ModelFact } from "./athleteModel";

export type DayBucket = { key: string; label: string; facts: ModelFact[] };

/**
 * Chronological counterpart to the profile "FULL MODEL" section, which groups
 * observations by category. History buckets the same active observations by the
 * day FRAME last SAW each one (a re-sighting moves it to that day), newest day
 * first. FRAME+ gated, same as the full model breakdown.
 */
export function bucketByDay(facts: ModelFact[], now: Date = new Date()): DayBucket[] {
  const startOfDay = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const today = startOfDay(now);
  const oneDay = 24 * 60 * 60 * 1000;

  const byKey = new Map<string, { ts: number; label: string; facts: ModelFact[] }>();

  for (const f of facts) {
    const raw = factLastSeen(f);
    const d = raw ? new Date(raw) : null;
    const valid = d && !Number.isNaN(d.getTime()) ? d : null;
    const dayTs = valid ? startOfDay(valid) : 0;
    const key = valid ? String(dayTs) : "undated";

    let label: string;
    if (!valid) {
      label = "Undated";
    } else if (dayTs === today) {
      label = "Today";
    } else if (dayTs === today - oneDay) {
      label = "Yesterday";
    } else {
      label = valid.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    }

    const bucket = byKey.get(key);
    if (bucket) bucket.facts.push(f);
    else byKey.set(key, { ts: valid ? dayTs : -1, label, facts: [f] });
  }

  return Array.from(byKey.entries())
    .sort((a, b) => b[1].ts - a[1].ts)
    .map(([key, v]) => ({ key, label: v.label, facts: v.facts }));
}


/** "Tue 20 Oct 2026" for an ISO timestamp, on the device's calendar. */
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
  f: Pick<ModelFact, "category" | "topic" | "content" | "createdAt" | "lastConfirmedAt" | "updatedAt">,
  categoryLabel: string,
): string {
  const seen = observationDate(factLastSeen(f));
  const first = observationDate(f.createdAt);
  const when = first === seen ? `recorded ${seen}` : `first recorded ${first}, last seen ${seen}`;
  const what = f.topic && f.topic.trim() && f.topic.trim() !== f.content.trim() ? `${f.topic.trim()}: ${f.content.trim()}` : f.content.trim();
  return `Let's talk about this observation FRAME holds on me (${categoryLabel.toLowerCase()}, ${when}): "${what}". Is it still true for me now, and what should I do about it?`;
}
