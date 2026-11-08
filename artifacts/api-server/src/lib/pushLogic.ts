import { daysBetween, localDate, safeTimeZone } from "./localTime";

export const DEFAULT_QUIET_START_MIN = 21 * 60;
export const DEFAULT_QUIET_END_MIN = 8 * 60;
export const MISSED_DAYS_THRESHOLD = 3;
/** Days-to-fight at which we nudge (each fires once). */
export const FIGHT_MILESTONES = [14, 7, 3, 1] as const;
/** How far back an analysis still counts as "just finished". */
export const ANALYSIS_FRESH_HOURS = 36;

export type PushKind = "missed_3_days" | "analysis_finished" | "fight_approaching";

export interface PushMessage {
  kind: PushKind;
  /** Unique per user: the same event can never be sent twice. */
  dedupeKey: string;
  title: string;
  body: string;
  /** Read by the app on tap (same contract as local notifications). */
  data: { route: string; [k: string]: string };
}

export interface PushUserContext {
  userId: string;
  timeZone: string;
  enabled: boolean;
  quietStartMin: number;
  quietEndMin: number;
  /** Most recent check-in date ("YYYY-MM-DD" local) or null if never. */
  lastCheckinDate: string | null;
  analyses: { id: number; createdAt: Date }[];
  competitions: { id: number; name: string; eventDate: Date }[];
}

/** Minutes after local midnight at `now` in `tz`. */
export function localMinutes(now: Date, tz: string): number {
  const f = new Intl.DateTimeFormat("en-GB", {
    timeZone: safeTimeZone(tz),
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const p = Object.fromEntries(f.formatToParts(now).map((x) => [x.type, x.value]));
  return Number(p["hour"]) * 60 + Number(p["minute"]);
}

/** True when `now` falls in the [start, end) quiet window; the window may wrap midnight. Equal start/end = no quiet hours. */
export function inQuietHours(now: Date, tz: string, startMin: number, endMin: number): boolean {
  if (startMin === endMin) return false;
  const m = localMinutes(now, tz);
  return startMin < endMin ? m >= startMin && m < endMin : m >= startMin || m < endMin;
}

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

/** Every push this athlete is due right now, ignoring opt-out/quiet hours (the caller applies those). */
export function decidePushes(ctx: PushUserContext, now: Date): PushMessage[] {
  const out: PushMessage[] = [];
  const today = localDate(now, ctx.timeZone);

  if (ctx.lastCheckinDate) {
    const gap = daysBetween(ctx.lastCheckinDate, today);
    if (gap >= MISSED_DAYS_THRESHOLD) {
      out.push({
        kind: "missed_3_days",
        dedupeKey: `missed:${ctx.lastCheckinDate}`,
        title: "Your athlete model misses you",
        body: `It's been ${plural(gap, "day")} since your last check-in. 30 seconds keeps FRAME sharp.`,
        data: { route: "checkin" },
      });
    }
  }

  const freshAfter = now.getTime() - ANALYSIS_FRESH_HOURS * 3_600_000;
  for (const a of ctx.analyses) {
    if (a.createdAt.getTime() >= freshAfter && a.createdAt.getTime() <= now.getTime()) {
      out.push({
        kind: "analysis_finished",
        dedupeKey: `analysis:${a.id}`,
        title: "Your analysis is ready",
        body: "FRAME finished reviewing your footage. Open it to see what stood out.",
        data: { route: "analysis", analysisId: String(a.id) },
      });
    }
  }

  for (const c of ctx.competitions) {
    const left = daysBetween(today, localDate(c.eventDate, ctx.timeZone));
    if ((FIGHT_MILESTONES as readonly number[]).includes(left)) {
      out.push({
        kind: "fight_approaching",
        dedupeKey: `fight:${c.id}:${left}`,
        title: left === 1 ? "Fight day is tomorrow" : `${left} days to fight day`,
        body:
          left === 1
            ? `${c.name} is tomorrow. Trust the work. Open FRAME for your final-day plan.`
            : `${c.name} is in ${plural(left, "day")}. Check your camp plan in FRAME.`,
        data: { route: "camp", competitionId: String(c.id) },
      });
    }
  }
  return out;
}

/** Quiet-hours/opt-out gate, then the due pushes. Nothing is claimed here: deferred pushes retry next run. */
export function pushesToSend(ctx: PushUserContext, now: Date): PushMessage[] {
  if (!ctx.enabled) return [];
  if (inQuietHours(now, ctx.timeZone, ctx.quietStartMin, ctx.quietEndMin)) return [];
  return decidePushes(ctx, now);
}
