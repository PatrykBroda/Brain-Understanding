// Daily State + Today's Focus: the athlete's day, in the athlete's timezone.
//
// Three rules drive everything here:
//   1. A day only has a State / Focus if FRAME was told something that day (a
//      check-in, a chat message, a new observation, an analysis). Nothing is
//      invented to fill a quiet day.
//   2. On a quiet day the last read is still shown, but dated and flagged as not
//      current, with an invitation to check in. It is never labelled new.
//   3. Everything is derived from data the app actually holds and says why.
//
// The derivation is deterministic (no model call): it has to be cheap, testable
// and honest. The pure functions are exported so the rules are unit-tested.

import { createHash } from "node:crypto";
import { and, asc, desc, eq, gte, lt, sql } from "drizzle-orm";
import {
  db,
  dailyCheckinsTable,
  dailyContextTable,
  messagesTable,
  conversationsTable,
  videoAnalysesTable,
  type AthleteFact,
  type DailyCheckin,
  type DailyFocusPayload,
  type Fighter,
} from "@workspace/db";
import { getActiveFacts, lastSeenAt } from "./factsService";
import { getActiveCompetition, pressureFor } from "./competitionService";
import { daysBetween, formatLocalDate, localDate, localDayBounds } from "./localTime";

export const STATE_NAMES = [
  "Dormant",
  "Stable",
  "Loaded",
  "Recovering",
  "Tight",
  "Volatile",
  "Composed",
  "Overextended",
] as const;
export type StateName = (typeof STATE_NAMES)[number];

/** How far back a note still counts as "what's going on now" for the State read. */
export const RECENT_FACT_DAYS = 14;

// ── Readiness ────────────────────────────────────────────────────────────────

export type CheckinLike = Pick<DailyCheckin, "sleep" | "energy" | "soreness" | "stress"> & {
  checkinDate?: string;
  restingHr?: number | null;
};

/** Mean of the four stored quality scores (100 = optimal), rounded. */
export function readinessScore(c: CheckinLike): number {
  return Math.round((c.sleep + c.energy + c.soreness + c.stress) / 4);
}

export type ReadinessBand = "primed" | "trainable" | "guarded" | "depleted";

export function readinessBand(score: number): ReadinessBand {
  if (score >= 80) return "primed";
  if (score >= 65) return "trainable";
  if (score >= 45) return "guarded";
  return "depleted";
}

/**
 * What a logged check-in means for today's training, in words the coach can act
 * on. Soreness and stress are stored as recovery quality (100 = none), so a LOW
 * stored number is the bad one. Returns null when the check-in gives no reason to
 * change the plan.
 */
export function readinessGuidance(c: CheckinLike): string | null {
  const score = readinessScore(c);
  const band = readinessBand(score);
  const lows: string[] = [];
  if (c.sleep < 50) lows.push(`sleep ${c.sleep}`);
  if (c.energy < 50) lows.push(`energy ${c.energy}`);
  if (c.soreness < 50) lows.push(`soreness (${100 - c.soreness}/100 sore)`);
  if (c.stress < 50) lows.push(`stress (${100 - c.stress}/100 stressed)`);
  const lowText = lows.length ? ` Low: ${lows.join(", ")}.` : "";
  if (band === "depleted") {
    return `Depleted (${score}/100). Cut volume and intensity: technical, low-impact work only, no hard sparring or max-effort conditioning.${lowText}`;
  }
  if (band === "guarded") {
    return `Guarded (${score}/100). Train, but cap intensity: no max-effort rounds, keep sparring controlled, shorten the session if form drops.${lowText}`;
  }
  if (band === "trainable") {
    return `Trainable (${score}/100). Normal session is fine; watch the weakest score.${lowText}`;
  }
  return `Primed (${score}/100). Good day to push the one thing that matters most.${lowText}`;
}

// ── State ────────────────────────────────────────────────────────────────────

const STATE_PATTERNS: { state: StateName; re: RegExp; source: string }[] = [
  { state: "Volatile", re: /volatile|fragment|breaking|panic|collaps|lost (my )?composure|came apart/, source: "things coming apart under pressure" },
  { state: "Overextended", re: /overextend|overreach|beyond capacity|burn(t|ed)? out|overtrain/, source: "load beyond what you can absorb" },
  { state: "Tight", re: /\btight\b|tense|clench|rigid|second.guess|hesitat/, source: "tension or hesitation" },
  { state: "Recovering", re: /recover|injur|\brest\b|fatigue|tired|sore|tweak|knee|shoulder|ankle/, source: "recovery, fatigue or an injury" },
  { state: "Composed", re: /composed|\bcalm\b|centred|centered|controlled/, source: "calm, controlled work" },
  { state: "Loaded", re: /loaded|high.{0,12}volume|intense|\bheavy\b|hard (week|camp)|big week/, source: "heavy training load" },
];

export interface StateSignals {
  checkin: CheckinLike | null;
  /** The athlete's own words today (chat), oldest first. */
  messagesToday: string[];
  /** Active notes seen within RECENT_FACT_DAYS (content + topic). */
  recentNotes: string[];
  /** All active notes (count only; used for the "enough to read" floor). */
  activeNoteCount: number;
}

export interface DerivedState {
  state: StateName;
  /** Why, in words: what it was read from. */
  source: string;
}

function firstMatch(text: string): { state: StateName; source: string } | null {
  const t = text.toLowerCase();
  for (const p of STATE_PATTERNS) if (p.re.test(t)) return { state: p.state, source: p.source };
  return null;
}

/**
 * The State for a day. Pure. Order: what the athlete said TODAY outranks what
 * they logged, which outranks older notes, so a state moves the day something
 * changes and does not stay stuck on a note from last month.
 */
export function deriveState(sig: StateSignals): DerivedState {
  const today = firstMatch(sig.messagesToday.join(" \n "));
  // Behavioural collapse said today wins outright.
  if (today && (today.state === "Volatile" || today.state === "Overextended")) {
    return { state: today.state, source: `what you told your coach today: ${today.source}` };
  }
  if (sig.checkin) {
    const score = readinessScore(sig.checkin);
    if (score < 45) return { state: "Recovering", source: `today's check-in (readiness ${score}/100)` };
    if (Math.min(sig.checkin.sleep, sig.checkin.energy) < 35) {
      return { state: "Recovering", source: "today's check-in (very low sleep or energy)" };
    }
    if (sig.checkin.stress < 40) return { state: "Tight", source: "today's check-in (high stress logged)" };
    if (sig.checkin.soreness < 40) return { state: "Loaded", source: "today's check-in (high soreness logged)" };
  }
  if (today) return { state: today.state, source: `what you told your coach today: ${today.source}` };
  const notes = firstMatch(sig.recentNotes.join(" \n "));
  if (notes) return { state: notes.state, source: `your recent notes: ${notes.source}` };
  if (sig.checkin) {
    const score = readinessScore(sig.checkin);
    if (score >= 65) return { state: "Stable", source: `today's check-in (readiness ${score}/100)` };
    return { state: "Loaded", source: `today's check-in (readiness ${score}/100)` };
  }
  if (sig.activeNoteCount >= 3) return { state: "Stable", source: "your athlete model" };
  return { state: "Dormant", source: "not enough yet to read a state" };
}

// ── Today's Focus ────────────────────────────────────────────────────────────

export interface FocusSignals {
  checkin: CheckinLike | null;
  today: string;
  /** Notes created or re-seen today (most relevant first). */
  notesToday: Pick<AthleteFact, "category" | "topic" | "content">[];
  /** Active weaknesses, best first, each with the date it was last seen. */
  weaknesses: { topic: string; content: string; lastSeen: string; evidenceCount: number }[];
  goalsText: string;
  weaknessesText: string;
  camp: { phase: string; daysToEvent: number } | null;
}

const CAMP_FOCUS: Record<string, { title: string; detail: string }> = {
  Build: { title: "Build the base", detail: "Volume with clean technique. Pick one position to own this session and drill it until it is boring." },
  Develop: { title: "Develop what is working", detail: "Add one layer to a move that already holds. Do not add new things this week." },
  Sharpen: { title: "Sharpen, do not add", detail: "Rehearse your game plan under pressure. Cut anything new; sharpen what you already do." },
  "Fight Week": { title: "Protect the work", detail: "Stay loaded, not rushed. Short, sharp sessions; sleep and weight first." },
};

function clip(s: string, n: number): string {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length <= n ? t : `${t.slice(0, n - 1).trimEnd()}…`;
}

function describeCheckin(c: CheckinLike): string {
  return `sleep ${c.sleep}, energy ${c.energy}, soreness ${100 - c.soreness}/100, stress ${100 - c.stress}/100`;
}

/** Today's Focus from today's information. Pure. */
export function deriveFocus(sig: FocusSignals): DailyFocusPayload {
  const because: string[] = [];
  const c = sig.checkin;

  if (c && readinessScore(c) < 45) {
    because.push(`Your check-in today: ${describeCheckin(c)}.`);
    const weakest = (
      [
        ["sleep", c.sleep],
        ["energy", c.energy],
        ["soreness", c.soreness],
        ["stress", c.stress],
      ] as const
    )
      .slice()
      .sort((a, b) => a[1] - b[1])[0]![0];
    const lever =
      weakest === "sleep"
        ? "Protect tonight's sleep before anything else."
        : weakest === "soreness"
          ? "Keep it low-impact and technical."
          : weakest === "stress"
            ? "Down-regulate before you train: a few slow breaths, then simple work."
            : "Short session, easy pace.";
    return {
      kind: "recovery",
      title: "Keep today light and clean",
      detail: `Readiness is low today, so a hard session costs more than it gives. ${lever}`,
      because,
    };
  }

  // Something the athlete said or that was noted today beats the standing plan.
  const injury = sig.notesToday.find((n) => /injur|tweak|pain|strain|sprain|knee|shoulder|ankle|rib|neck|back/i.test(`${n.topic} ${n.content}`));
  if (injury) {
    because.push(`You told your coach today: ${clip(injury.content, 140)}`);
    return {
      kind: "recovery",
      title: `Work around ${clip(injury.topic || "it", 40)}`,
      detail: "Train what does not aggravate it. Drop anything that loads it, and tell your coach how it feels after.",
      because,
    };
  }

  if (sig.camp) {
    const base = CAMP_FOCUS[sig.camp.phase] ?? CAMP_FOCUS["Build"]!;
    because.push(`Camp phase: ${sig.camp.phase}, ${sig.camp.daysToEvent} day${sig.camp.daysToEvent === 1 ? "" : "s"} to the event.`);
    if (c) because.push(`Your check-in today: ${describeCheckin(c)}.`);
    return { kind: "camp", title: base.title, detail: base.detail, because };
  }

  const weak = sig.notesToday.find((n) => n.category === "weakness" || n.category === "pattern");
  if (weak) {
    because.push(`You told your coach today: ${clip(weak.content, 140)}`);
    if (c) because.push(`Your check-in today: ${describeCheckin(c)}.`);
    return {
      kind: "weakness",
      title: clip(weak.topic || weak.content, 60),
      detail: "This came up today. Pick one rep of it in your next session and watch only that.",
      because,
    };
  }

  const top = sig.weaknesses[0];
  if (top) {
    because.push(
      `Recorded weakness, seen ${top.evidenceCount} time${top.evidenceCount === 1 ? "" : "s"}, last on ${formatLocalDate(top.lastSeen)}.`,
    );
    if (c) because.push(`Your check-in today: ${describeCheckin(c)}.`);
    return {
      kind: "weakness",
      title: clip(top.topic || top.content, 60),
      detail: clip(top.content, 200),
      because,
    };
  }

  const stated = sig.weaknessesText.split(/[,.;\n]/).map((s) => s.trim()).filter(Boolean)[0];
  if (stated) {
    because.push("From your onboarding answers.");
    return { kind: "onboarding", title: clip(stated, 60), detail: "You named this as a weakness. Aim one drill at it today.", because };
  }
  const goal = sig.goalsText.split(/[,.;\n]/).map((s) => s.trim()).filter(Boolean)[0];
  if (goal) {
    because.push("From your onboarding answers.");
    return { kind: "goal", title: clip(goal, 60), detail: "Do one thing today that moves you toward this.", because };
  }
  return {
    kind: "open",
    title: "Tell your coach how training went",
    detail: "FRAME has not got enough on you to set a focus yet. A line or two about your last session is enough.",
    because: [],
  };
}

// ── The assembled view ───────────────────────────────────────────────────────

export type DisclosureCode = "none" | "no_checkin_today" | "no_info_today" | "no_info_ever";

export interface DailyView {
  date: string;
  timezone: string;
  /** True when FRAME holds something from today. False = nothing new today. */
  fresh: boolean;
  state: {
    name: StateName | null;
    source: string;
    /** The local day this read belongs to; null if there never was one. */
    asOf: string | null;
    current: boolean;
  };
  focus: (DailyFocusPayload & { forDate: string | null; current: boolean; carriedOver: boolean }) | null;
  readiness: {
    today: { score: number; band: ReadinessBand; checkin: DailyCheckin } | null;
    latest: { date: string; score: number; daysAgo: number } | null;
  };
  disclosure: { code: DisclosureCode; message: string; action: "check_in" | "none" };
  /** Previous days' reads, newest first, each dated (today excluded). */
  history: { date: string; state: StateName; focusTitle: string }[];
}

export interface DailyRaw {
  fighter: Fighter;
  today: string;
  tz: string;
  checkinToday: DailyCheckin | null;
  latestCheckin: DailyCheckin | null;
  facts: AthleteFact[];
  messagesToday: string[];
  analysesToday: number;
  camp: { phase: string; daysToEvent: number } | null;
  /** Local-day bounds for "touched today". */
  dayStart: Date;
  dayEnd: Date;
}

export function inputsHash(raw: DailyRaw, notesToday: AthleteFact[]): string {
  const h = createHash("sha1");
  h.update(
    JSON.stringify({
      c: raw.checkinToday ? [raw.checkinToday.sleep, raw.checkinToday.energy, raw.checkinToday.soreness, raw.checkinToday.stress] : null,
      n: notesToday.map((f) => [f.id, f.updatedAt.getTime(), f.evidenceCount]),
      m: raw.messagesToday.length,
      a: raw.analysesToday,
      q: raw.fighter.questionnaireUpdatedAt?.getTime() ?? 0,
      w: [raw.fighter.goals, raw.fighter.weaknesses, raw.fighter.personality].map((s) => s.length),
      camp: raw.camp,
    }),
  );
  return h.digest("hex").slice(0, 16);
}

/** Facts created or re-seen inside the local day. */
export function notesTouchedBetween(facts: AthleteFact[], start: Date, end: Date): AthleteFact[] {
  return facts
    .filter((f) => {
      const t = lastSeenAt(f).getTime();
      return t >= start.getTime() && t < end.getTime();
    })
    .sort((a, b) => lastSeenAt(b).getTime() - lastSeenAt(a).getTime());
}

export function freshInfoToday(raw: DailyRaw, notesToday: AthleteFact[]): boolean {
  const q = raw.fighter.questionnaireUpdatedAt?.getTime();
  const profileEditedToday = q != null && q >= raw.dayStart.getTime() && q < raw.dayEnd.getTime();
  return (
    raw.checkinToday != null ||
    raw.messagesToday.length > 0 ||
    notesToday.length > 0 ||
    raw.analysesToday > 0 ||
    profileEditedToday
  );
}

/**
 * What the athlete should be told when there is no fresh information, or no
 * check-in. Never claims the old read is current.
 */
export function disclosureFor(args: {
  fresh: boolean;
  hasCheckinToday: boolean;
  lastReadDate: string | null;
  today: string;
}): DailyView["disclosure"] {
  if (!args.fresh) {
    if (args.lastReadDate) {
      const ago = daysBetween(args.lastReadDate, args.today);
      const when = ago <= 1 ? "yesterday" : `${ago} days ago`;
      return {
        code: "no_info_today",
        message: `Nothing new from you today. The read below is from ${formatLocalDate(args.lastReadDate)} (${when}) and may be out of date. Check in to refresh it.`,
        action: "check_in",
      };
    }
    return {
      code: "no_info_ever",
      message: "FRAME has nothing to read yet. Log a check-in or tell your coach how training is going.",
      action: "check_in",
    };
  }
  if (!args.hasCheckinToday) {
    return {
      code: "no_checkin_today",
      message: "No readiness check-in today. This read comes from what you have told FRAME so far. A check-in sharpens it.",
      action: "check_in",
    };
  }
  return { code: "none", message: "", action: "none" };
}

// ── Data access ──────────────────────────────────────────────────────────────

async function loadRaw(fighter: Fighter, today: string, tz: string, now: Date): Promise<DailyRaw> {
  const { start, end } = localDayBounds(today, tz);

  const [checkinToday] = await db
    .select()
    .from(dailyCheckinsTable)
    .where(and(eq(dailyCheckinsTable.fighterId, fighter.id), eq(dailyCheckinsTable.checkinDate, today)))
    .limit(1);
  const [latestCheckin] = await db
    .select()
    .from(dailyCheckinsTable)
    .where(eq(dailyCheckinsTable.fighterId, fighter.id))
    .orderBy(desc(dailyCheckinsTable.checkinDate))
    .limit(1);

  const msgs = await db
    .select({ content: messagesTable.content })
    .from(messagesTable)
    .innerJoin(conversationsTable, eq(messagesTable.conversationId, conversationsTable.id))
    .where(
      and(
        eq(conversationsTable.fighterId, fighter.id),
        eq(messagesTable.role, "user"),
        gte(messagesTable.createdAt, start),
        lt(messagesTable.createdAt, end),
      ),
    )
    .orderBy(asc(messagesTable.createdAt))
    .limit(60);

  const [analysisRow] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(videoAnalysesTable)
    .where(
      and(
        eq(videoAnalysesTable.fighterId, fighter.id),
        gte(videoAnalysesTable.createdAt, start),
        lt(videoAnalysesTable.createdAt, end),
      ),
    );

  const facts = await getActiveFacts(fighter.id, now < end ? now : end);

  const comp = await getActiveCompetition(fighter.id);
  let camp: DailyRaw["camp"] = null;
  if (comp) {
    const p = pressureFor(comp, now);
    camp = { phase: p.phase, daysToEvent: p.daysToEvent };
  }

  return {
    fighter,
    today,
    tz,
    checkinToday: checkinToday ?? null,
    latestCheckin: latestCheckin ?? null,
    facts,
    messagesToday: msgs.map((m) => m.content),
    analysesToday: analysisRow?.n ?? 0,
    camp,
    dayStart: start,
    dayEnd: end,
  };
}

/**
 * The athlete's day. Writes today's row when there is fresh information (or it
 * changed), never otherwise, and always reports honestly which case it is.
 */
export async function getDailyView(
  fighter: Fighter,
  opts: { today: string; tz: string; now?: Date },
): Promise<DailyView> {
  const now = opts.now ?? new Date();
  const raw = await loadRaw(fighter, opts.today, opts.tz, now);
  const notesToday = notesTouchedBetween(raw.facts, raw.dayStart, raw.dayEnd);
  const fresh = freshInfoToday(raw, notesToday);

  const [stored] = await db
    .select()
    .from(dailyContextTable)
    .where(and(eq(dailyContextTable.fighterId, fighter.id), eq(dailyContextTable.localDate, opts.today)))
    .limit(1);

  const previousRows = await db
    .select()
    .from(dailyContextTable)
    .where(and(eq(dailyContextTable.fighterId, fighter.id), lt(dailyContextTable.localDate, opts.today)))
    .orderBy(desc(dailyContextTable.localDate))
    .limit(8);
  const lastBefore = previousRows[0] ?? null;

  let state: DailyView["state"];
  let focus: DailyView["focus"];

  if (fresh) {
    const hash = inputsHash(raw, notesToday);
    let row = stored;
    if (!row || row.inputsHash !== hash) {
      const recentCut = now.getTime() - RECENT_FACT_DAYS * 86_400_000;
      const recentNotes = raw.facts
        .filter((f) => lastSeenAt(f).getTime() >= recentCut)
        .map((f) => `${f.topic} ${f.content}`);
      const derived = deriveState({
        checkin: raw.checkinToday,
        messagesToday: raw.messagesToday,
        recentNotes,
        activeNoteCount: raw.facts.length,
      });
      const weaknesses = raw.facts
        .filter((f) => f.category === "weakness")
        .sort((a, b) => b.confidence - a.confidence || lastSeenAt(b).getTime() - lastSeenAt(a).getTime())
        .map((f) => ({
          topic: f.topic,
          content: f.content,
          lastSeen: localDate(lastSeenAt(f), opts.tz),
          evidenceCount: f.evidenceCount,
        }));
      const payload = deriveFocus({
        checkin: raw.checkinToday,
        today: opts.today,
        notesToday,
        weaknesses,
        goalsText: fighter.goals,
        weaknessesText: fighter.weaknesses,
        camp: raw.camp,
      });
      const values = {
        fighterId: fighter.id,
        localDate: opts.today,
        timezone: opts.tz,
        state: derived.state,
        stateSource: derived.source,
        focus: payload,
        inputsHash: hash,
        updatedAt: new Date(),
      };
      const [saved] = await db
        .insert(dailyContextTable)
        .values(values)
        .onConflictDoUpdate({
          target: [dailyContextTable.fighterId, dailyContextTable.localDate],
          set: { ...values, generatedAt: sql`daily_context.generated_at` },
        })
        .returning();
      row = saved!;
    }
    state = { name: row.state as StateName, source: row.stateSource, asOf: row.localDate, current: true };
    focus = {
      ...row.focus,
      forDate: row.localDate,
      current: true,
      carriedOver: lastBefore != null && lastBefore.focus.title === row.focus.title,
    };
  } else if (lastBefore) {
    // A quiet day: show the last read, dated, flagged not-current. Nothing new is made up.
    state = { name: lastBefore.state as StateName, source: lastBefore.stateSource, asOf: lastBefore.localDate, current: false };
    focus = { ...lastBefore.focus, forDate: lastBefore.localDate, current: false, carriedOver: false };
  } else {
    state = { name: null, source: "", asOf: null, current: false };
    focus = null;
  }

  const latestScore = raw.latestCheckin ? readinessScore(raw.latestCheckin) : null;
  return {
    date: opts.today,
    timezone: opts.tz,
    fresh,
    state,
    focus,
    readiness: {
      today: raw.checkinToday
        ? { score: readinessScore(raw.checkinToday), band: readinessBand(readinessScore(raw.checkinToday)), checkin: raw.checkinToday }
        : null,
      latest:
        raw.latestCheckin && latestScore != null
          ? {
              date: raw.latestCheckin.checkinDate,
              score: latestScore,
              daysAgo: Math.max(0, daysBetween(raw.latestCheckin.checkinDate, opts.today)),
            }
          : null,
    },
    disclosure: disclosureFor({
      fresh,
      hasCheckinToday: raw.checkinToday != null,
      lastReadDate: lastBefore?.localDate ?? null,
      today: opts.today,
    }),
    history: previousRows.map((r) => ({ date: r.localDate, state: r.state as StateName, focusTitle: r.focus.title })),
  };
}
