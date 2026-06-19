/**
 * Parse a user-typed date string (YYYY-MM-DD or YYYY-MM-DDTHH:MM) into a UTC
 * ISO-8601 string. Returns null for malformed input or overflowed date
 * components (e.g. month 13, day 40).
 */
export function toIso(dateStr: string): string | null {
  const raw = dateStr.trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?$/.exec(raw);
  if (!m) return null;
  const [, y, mo, da, hh, mm] = m;
  const d = new Date(
    Date.UTC(Number(y), Number(mo) - 1, Number(da), Number(hh ?? 0), Number(mm ?? 0)),
  );
  if (Number.isNaN(d.getTime())) return null;
  if (d.getUTCMonth() !== Number(mo) - 1 || d.getUTCDate() !== Number(da)) return null;
  return d.toISOString();
}
