// Calendar-day maths in the athlete's own timezone. Everything that says "today"
// (check-ins, State, Today's Focus, the first coaching message of the day) goes
// through here so a day rolls over at the athlete's midnight, not the server's.

const DAY_MS = 86_400_000;
const FALLBACK_TZ = "UTC";

const validCache = new Map<string, boolean>();

/** True for a real IANA zone name the runtime knows ("Europe/London", "UTC"). */
export function isValidTimeZone(tz: unknown): tz is string {
  if (typeof tz !== "string" || tz.length === 0 || tz.length > 64) return false;
  const hit = validCache.get(tz);
  if (hit !== undefined) return hit;
  let ok = false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    ok = true;
  } catch {
    ok = false;
  }
  if (validCache.size > 500) validCache.clear();
  validCache.set(tz, ok);
  return ok;
}

export function safeTimeZone(tz: unknown): string {
  return isValidTimeZone(tz) ? tz : FALLBACK_TZ;
}

function parts(d: Date, tz: string) {
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const out: Record<string, number> = {};
  for (const p of f.formatToParts(d)) {
    if (p.type !== "literal") out[p.type] = Number(p.value);
  }
  return out as { year: number; month: number; day: number; hour: number; minute: number; second: number };
}

/** "YYYY-MM-DD" of `d` on the wall clock in `tz`. */
export function localDate(d: Date, tz: string): string {
  const p = parts(d, safeTimeZone(tz));
  return `${String(p.year).padStart(4, "0")}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/** Minutes the zone is ahead of UTC at instant `d` (e.g. Bangkok = 420). */
function offsetMinutes(d: Date, tz: string): number {
  const p = parts(d, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - Math.floor(d.getTime() / 1000) * 1000) / 60_000);
}

/** The UTC instant at which local calendar day `date` ("YYYY-MM-DD") begins in `tz`. */
export function startOfLocalDay(date: string, tz: string): Date {
  const zone = safeTimeZone(tz);
  const [y, m, d] = date.split("-").map(Number);
  const guess = Date.UTC(y!, m! - 1, d!);
  // Two passes settle DST transitions that fall inside the offset window.
  let t = guess - offsetMinutes(new Date(guess), zone) * 60_000;
  t = guess - offsetMinutes(new Date(t), zone) * 60_000;
  return new Date(t);
}

/** [start, end) UTC instants of local day `date` in `tz`. */
export function localDayBounds(date: string, tz: string): { start: Date; end: Date } {
  const start = startOfLocalDay(date, tz);
  const next = addDays(date, 1);
  return { start, end: startOfLocalDay(next, tz) };
}

export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const t = Date.UTC(y!, m! - 1, d!) + n * DAY_MS;
  return new Date(t).toISOString().slice(0, 10);
}

/** Whole local calendar days from `a` to `b` (b - a). */
export function daysBetween(a: string, b: string): number {
  const ta = Date.parse(`${a}T00:00:00Z`);
  const tb = Date.parse(`${b}T00:00:00Z`);
  return Math.round((tb - ta) / DAY_MS);
}

/** "Sat 17 Oct" — a short human date for a "YYYY-MM-DD" string, timezone-free. */
export function formatLocalDate(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}
