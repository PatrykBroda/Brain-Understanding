// Dated context for the coach prompt. Everything the model is shown from the past
// (replayed messages, remembered observations, calibration answers) is stamped with
// when it was true, and relative phrasing inside it ("18 days out", "tonight") is
// pinned to that date so it can never read as the present. Pure; unit-tested.

import { daysBetween, formatLocalDate, localDate, safeTimeZone } from "./localTime";

/** "today", "yesterday", "3 days ago", "2 weeks ago", "5 months ago". */
export function relativeAge(then: Date, now: Date, tz: string): string {
  const n = daysBetween(localDate(then, tz), localDate(now, tz));
  if (n <= 0) return "today";
  if (n === 1) return "yesterday";
  if (n < 14) return `${n} days ago`;
  if (n < 60) return `${Math.floor(n / 7)} weeks ago`;
  if (n < 730) return `${Math.floor(n / 30)} months ago`;
  return `${Math.floor(n / 365)} years ago`;
}

function clock(d: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: safeTimeZone(tz), hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);
}

/** "Mon 9 Nov, 22:40 (yesterday)" — the athlete's own wall clock. */
export function stampLabel(then: Date, now: Date, tz: string): string {
  const day = formatLocalDate(localDate(then, tz));
  return `${day}, ${clock(then, tz)} (${relativeAge(then, now, tz)})`;
}

/** "Tue 10 Nov 2026, 16:05 (Europe/London)" — the one true present. */
export function nowLabel(now: Date, tz: string): string {
  const z = safeTimeZone(tz);
  const day = new Intl.DateTimeFormat("en-GB", { timeZone: z, weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(now);
  return `${day}, ${clock(now, z)} (${z})`;
}

const COUNTDOWN_RES: RegExp[] = [
  /\b\d+\s*(?:days?|weeks?)\s*(?:out|to go|left|away|until|till|to)\b/gi,
  /\b(?:in|within|about|roughly)\s+\d+\s*(?:days?|weeks?)\b/gi,
];
const RELATIVE_DAY_RE = /\b(tonight|this (?:morning|afternoon|evening)|tomorrow|today|yesterday|later today)\b/gi;

/**
 * Pins relative phrasing in OLD text to the day it was written. Countdowns become
 * "18 days out [as of Sat 24 Oct]"; with `pinDays`, "tonight"/"tomorrow"/"today" are
 * pinned too. Text written today is returned unchanged.
 */
export function pinRelative(text: string, then: Date, now: Date, tz: string, opts: { pinDays?: boolean } = {}): string {
  const written = localDate(then, tz);
  if (daysBetween(written, localDate(now, tz)) <= 0) return text;
  const asOf = formatLocalDate(written);
  let out = text;
  for (const re of COUNTDOWN_RES) out = out.replace(re, (m) => `${m} [as of ${asOf}, stale]`);
  if (opts.pinDays) out = out.replace(RELATIVE_DAY_RE, (m) => `${m} [on ${asOf}]`);
  return out;
}

/** A replayed chat message, headed with when it was sent unless it was sent today. */
export function stampHistoryMessage(content: string, createdAt: Date, now: Date, tz: string): string {
  if (daysBetween(localDate(createdAt, tz), localDate(now, tz)) <= 0) return content;
  return `[sent ${stampLabel(createdAt, now, tz)}]\n${pinRelative(content, createdAt, now, tz)}`;
}

const MAX_STAMP_LEN = 140;
const LEADING_STAMP_RE = /^\s*\[(?!\[)[^\]\n]{1,140}\]\s*/;

/** Drops a leading "[sent Thu 12 Nov, 02:24 (yesterday)]"-style tag the model echoed. */
export function stripLeadingStamp(text: string): string {
  return text.replace(LEADING_STAMP_RE, "");
}

export interface StampStripper {
  push(delta: string): string;
  flush(): string;
  reset(): void;
}

/**
 * Streaming form of stripLeadingStamp. Holds back the start of the reply only while it
 * could still turn out to be a "[...]" tag; everything after the first decision passes
 * straight through. "[[node]]" notation and unclosed or over-long brackets are released
 * untouched.
 */
export function createStampStripper(): StampStripper {
  let buf = "";
  let decided = false;
  let trimming = false; // a stamp was removed: drop the blank space that followed it
  return {
    push(delta) {
      if (trimming) {
        const t = delta.trimStart();
        if (t) trimming = false;
        return t;
      }
      if (decided) return delta;
      buf += delta;
      const t = buf.trimStart();
      if (t === "") return "";
      if (t[0] !== "[" || t[1] === "[") {
        decided = true;
        const out = buf;
        buf = "";
        return out;
      }
      const close = t.indexOf("]");
      if (close === -1) {
        if (t.length > MAX_STAMP_LEN + 1 || t.includes("\n")) {
          decided = true;
          const out = buf;
          buf = "";
          return out;
        }
        return "";
      }
      decided = true;
      const out = stripLeadingStamp(buf);
      buf = "";
      if (!out) trimming = true;
      return out;
    },
    flush() {
      if (decided) return "";
      decided = true;
      const out = buf;
      buf = "";
      return out;
    },
    reset() {
      buf = "";
      decided = false;
      trimming = false;
    },
  };
}

export const DATED_CONTEXT_RULES =`# Dated context — read this before using anything below

- The "# Today" line and the clock above are the only present. Every replayed message, observation and calibration answer is HISTORICAL and carries its own date. Never treat a past time of day as the current one: "it's 11pm, get some rest" is only ever right if the clock above says so.
- Messages headed "[sent <date> …]" were written then, not now. "Tonight", "tomorrow", "this morning" and "today" inside them refer to THAT day. A session, meal or injury mentioned on an earlier day did not happen tonight, so describe it with its real day ("on Monday", "yesterday", "last week") unless its date is today.
- Never copy a countdown ("18 days out", "in 2 weeks") from a message or observation. Recompute from an absolute date against today, or leave it out. Text marked "[as of …, stale]" is out of date by definition.
- Your reply must begin directly with your words. Never open, or put anywhere in a reply, a bracketed tag like "[sent …]", a date stamp or a "(yesterday)" label; those headers are private annotations on the athlete's and your earlier messages, not part of how you speak. Do not imitate them even though earlier messages carry them.`;

export const NO_ACTIVE_CAMP_BLOCK = `# Competition status — NO ACTIVE CAMP

The athlete has no active camp and no upcoming fight in FRAME (it was switched off, finished or cancelled). Do not mention a countdown, fight date, weigh-in, camp phase or "days out", and do not assume they are cutting weight or peaking. Earlier messages and observations that mention any of these are history. If the athlete brings up a fight themselves, take it as news and ask for the date.`;
