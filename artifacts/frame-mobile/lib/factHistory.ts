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

