// What the coach is told about TODAY, on every turn: the date in the athlete's
// timezone, the readiness check-in (and what it means for training), and the State
// and Focus FRAME holds. Without this a logged score only changed a number on a
// screen and the coach talked as if every day were the same.

import { and, desc, eq } from "drizzle-orm";
import { db, dailyCheckinsTable, type DailyCheckin, type Fighter } from "@workspace/db";
import { getDailyView, readinessBand, readinessGuidance, readinessScore, type DailyView } from "./dailyContext";
import { daysBetween, formatLocalDate } from "./localTime";

export interface CoachDayContext {
  now: Date;
  tz: string;
  today: string;
  view: DailyView;
  /** Newest first, at most 5, each dated. */
  recentCheckins: DailyCheckin[];
}

function describeCheckin(c: Pick<DailyCheckin, "sleep" | "energy" | "soreness" | "stress">): string {
  return `sleep ${c.sleep} · energy ${c.energy} · soreness ${100 - c.soreness}/100 sore · stress ${100 - c.stress}/100 stressed`;
}

function clockLabel(now: Date, tz: string): string {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: tz,
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(now);
  } catch {
    return now.toISOString();
  }
}

export async function loadCoachDayContext(
  fighter: Fighter,
  opts: { now: Date; tz: string; today: string },
): Promise<CoachDayContext> {
  const view = await getDailyView(fighter, { today: opts.today, tz: opts.tz, now: opts.now });
  const recentCheckins = await db
    .select()
    .from(dailyCheckinsTable)
    .where(and(eq(dailyCheckinsTable.fighterId, fighter.id)))
    .orderBy(desc(dailyCheckinsTable.checkinDate))
    .limit(5);
  return { now: opts.now, tz: opts.tz, today: opts.today, view, recentCheckins };
}

/** The "# Today" block for the coach's dynamic context. Pure; unit-tested. */
export function buildTodayBlock(ctx: CoachDayContext): string {
  const { view, today } = ctx;
  const lines: string[] = [`# Today — ${clockLabel(ctx.now, ctx.tz)} (${ctx.tz})`, ""];

  const todays = view.readiness.today;
  if (todays) {
    const c = todays.checkin;
    lines.push(
      `Readiness check-in logged TODAY by the athlete: ${describeCheckin(c)} → ${todays.score}/100 (${todays.band}).`,
      `What it means for coaching: ${readinessGuidance(c)}`,
      `Rule: whenever you advise on training, intensity, volume, sparring or recovery, let these numbers change the advice and say so in a clause ("with sleep at ${c.sleep}…"). A logged score must alter what you prescribe, not decorate it. Never prescribe a max-effort session on a depleted or guarded day.`,
    );
  } else if (view.readiness.latest) {
    const l = view.readiness.latest;
    const ago = l.daysAgo <= 1 ? "yesterday" : `${l.daysAgo} days ago`;
    lines.push(
      `No readiness check-in has been logged today. The last one was ${formatLocalDate(l.date)} (${ago}), ${l.score}/100. That is NOT today's state.`,
      "Rule: if the athlete asks for training advice, say plainly that you do not have today's check-in, invite them to log one on Home (it takes a few seconds), and until then keep guidance conservative. Do not treat the older score as today's.",
    );
  } else {
    lines.push(
      "No readiness check-in has ever been logged. If they ask for training advice, give cautious guidance and invite them to log a check-in on Home so you can tune it.",
    );
  }

  if (ctx.recentCheckins.length > 0) {
    lines.push("", "Recent check-ins (dated, newest first):");
    for (const c of ctx.recentCheckins) {
      const when = c.checkinDate === today ? "today" : formatLocalDate(c.checkinDate);
      lines.push(`- ${when}: ${readinessScore(c)}/100 (${readinessBand(readinessScore(c))}) — ${describeCheckin(c)}`);
    }
  }

  lines.push("");
  if (view.state.name && view.state.current) {
    lines.push(`State FRAME reads for today: ${view.state.name} — from ${view.state.source}.`);
  } else if (view.state.name) {
    lines.push(
      `FRAME has no fresh read for today. The last State was ${view.state.name} on ${view.state.asOf ? formatLocalDate(view.state.asOf) : "an earlier day"}; do not present it as current.`,
    );
  } else {
    lines.push("FRAME has no State for this athlete yet.");
  }
  if (view.focus && view.focus.current) {
    lines.push(`Today's Focus on their screen: ${view.focus.title} — ${view.focus.detail}`);
  } else if (view.focus) {
    lines.push(`The Focus on their screen is yesterday's (${view.focus.forDate ? formatLocalDate(view.focus.forDate) : "earlier"}) and is marked not current.`);
  }
  lines.push(
    "Rule: if asked about their state or focus today, describe only what is above. If there is no fresh read, say so and invite a check-in; never invent a new state or call old information current.",
  );
  return lines.join("\n");
}

/** Extra instruction for the very first coaching reply after onboarding. */
export function buildFirstReplyBlock(): string {
  return [
    "# First coaching reply",
    "",
    "This is the athlete's first message to you since they finished onboarding. Open by showing you took in what they told you: their sport and level, how often they train, a goal and a weakness in their own words, and one thing from how they said they behave under pressure — in two or three natural sentences, not a list. Then give ONE clear next step they can do in the next 48 hours (specific and doable), and at most one question, last. Do not ask for anything the profile already holds, and do not recite the profile back field by field.",
  ].join("\n");
}
