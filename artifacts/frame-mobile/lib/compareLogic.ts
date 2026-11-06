// Pure helpers for the "compare two analyses" screen (no React / network).

export type CompareListItem = {
  id: number;
  createdAt: string;
  sessionScore: number | null;
  kind: string;
  locked?: boolean;
};

export type CompareResult = {
  earlierId: number;
  laterId: number;
  daysApart: number;
  sessionScore: { before: number | null; after: number | null; delta: number | null };
  scores: { key: string; label: string; before: number | null; after: number | null; delta: number | null }[];
  observations: { resolved: string[]; persisting: string[]; new: string[] };
  summary: string;
  summarySource: "ai" | "fallback";
};

const DAY = 86_400_000;

/** Readable (unlocked) analyses, newest first. */
export function comparable(list: CompareListItem[]): CompareListItem[] {
  return list
    .filter((a) => !a.locked)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

/** Earlier + latest ids: the latest analysis and the one closest to `targetDays` before it. Null if fewer than two. */
export function quickPair(list: CompareListItem[], targetDays = 28): [number, number] | null {
  const items = comparable(list);
  if (items.length < 2) return null;
  const latest = items[0]!;
  const t = Date.parse(latest.createdAt) - targetDays * DAY;
  let best = items[1]!;
  for (const it of items.slice(1)) {
    if (Math.abs(Date.parse(it.createdAt) - t) < Math.abs(Date.parse(best.createdAt) - t)) best = it;
  }
  return [best.id, latest.id];
}

/** Keep at most two selected; a third pick drops the oldest pick. */
export function toggleSelection(sel: number[], id: number): number[] {
  if (sel.includes(id)) return sel.filter((x) => x !== id);
  return sel.length >= 2 ? [sel[1]!, id] : [...sel, id];
}

export function formatDelta(delta: number | null): string {
  if (delta == null) return "–";
  if (delta === 0) return "No change";
  return `${delta > 0 ? "+" : "−"}${Math.abs(delta)}`;
}

export function gapLabel(days: number): string {
  if (days < 1) return "Same day";
  if (days < 14) return `${days} day${days === 1 ? "" : "s"} apart`;
  return `${Math.round(days / 7)} weeks apart`;
}
