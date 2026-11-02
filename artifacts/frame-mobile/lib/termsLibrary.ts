import AsyncStorage from "@react-native-async-storage/async-storage";

// Terms the athlete has met (tapped open) in chat. Local-only, per signed-in user.
export type MetTerm = { key: string; term: string; firstSeen: string };

const storageKey = (userId: string) => `frame.terms.v1:${userId}`;

/** Pure: add a term if new (keyed case-insensitively); returns the same array when already known. */
export function addMetTerm(list: MetTerm[], key: string, term: string, now: Date): MetTerm[] {
  const k = key.trim().toLowerCase();
  if (!k || list.some((t) => t.key === k)) return list;
  return [...list, { key: k, term: term.trim(), firstSeen: now.toISOString() }];
}

export function parseMetTerms(raw: string | null): MetTerm[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    if (!Array.isArray(v)) return [];
    return v.filter(
      (t): t is MetTerm =>
        t && typeof t.key === "string" && typeof t.term === "string" && typeof t.firstSeen === "string",
    );
  } catch {
    return [];
  }
}

export async function loadMetTerms(userId: string): Promise<MetTerm[]> {
  try {
    return parseMetTerms(await AsyncStorage.getItem(storageKey(userId)));
  } catch {
    return [];
  }
}

export async function recordMetTerm(userId: string, key: string, term: string): Promise<void> {
  try {
    const cur = await loadMetTerms(userId);
    const next = addMetTerm(cur, key, term, new Date());
    if (next !== cur) await AsyncStorage.setItem(storageKey(userId), JSON.stringify(next));
  } catch {
    // best-effort: failing to remember a term must never break chat
  }
}
