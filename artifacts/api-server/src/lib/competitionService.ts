import { db, competitionsTable, type Competition } from "@workspace/db";
import { and, asc, eq, gte } from "drizzle-orm";

const DAY_MS = 24 * 60 * 60 * 1000;

export type PressureTier =
  | "base"
  | "build"
  | "sharpen"
  | "peak"
  | "fight_week";

export type CompetitionPressure = {
  competition: Competition;
  daysToEvent: number;
  daysToWeighIn: number | null;
  tier: PressureTier;
  tierLabel: string;
};

function ceilDays(target: Date, now: Date): number {
  return Math.ceil((target.getTime() - now.getTime()) / DAY_MS);
}

export function tierFor(daysToEvent: number): { tier: PressureTier; label: string } {
  if (daysToEvent <= 3) return { tier: "fight_week", label: "Fight week" };
  if (daysToEvent <= 7) return { tier: "peak", label: "Peak / taper" };
  if (daysToEvent <= 14) return { tier: "sharpen", label: "Sharpen" };
  if (daysToEvent <= 42) return { tier: "build", label: "Build" };
  return { tier: "base", label: "Base camp" };
}

// The soonest active, not-yet-passed competition for a fighter. Past events are
// left in the table (history) but no longer drive Competition Mode.
export async function getActiveCompetition(fighterId: number): Promise<Competition | null> {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const [row] = await db
    .select()
    .from(competitionsTable)
    .where(
      and(
        eq(competitionsTable.fighterId, fighterId),
        eq(competitionsTable.status, "active"),
        gte(competitionsTable.eventDate, startOfToday),
      ),
    )
    .orderBy(asc(competitionsTable.eventDate))
    .limit(1);
  return row ?? null;
}

export function pressureFor(competition: Competition, now = new Date()): CompetitionPressure {
  const daysToEvent = Math.max(0, ceilDays(new Date(competition.eventDate), now));
  const daysToWeighIn = competition.weighInDate
    ? Math.max(0, ceilDays(new Date(competition.weighInDate), now))
    : null;
  const { tier, label } = tierFor(daysToEvent);
  return { competition, daysToEvent, daysToWeighIn, tier, tierLabel: label };
}

// The directive injected into the coach's dynamic context when a camp is live.
// Sternness scales with proximity — never abusive, always elite-performance focused.
export function competitionPromptBlock(p: CompetitionPressure): string {
  const c = p.competition;
  const weighIn =
    p.daysToWeighIn !== null
      ? `Weigh-in: ${p.daysToWeighIn} day(s) out${c.targetWeight ? ` at ${c.targetWeight}` : ""}.`
      : c.targetWeight
        ? `Target weight: ${c.targetWeight}.`
        : "";
  const weight =
    c.targetWeight || c.currentWeight
      ? `Weight: ${c.currentWeight || "?"} → ${c.targetWeight || "?"}.`
      : "";

  const toneByTier: Record<PressureTier, string> = {
    base: "Camp is opening. Stay supportive-analytical but start naming what has to be true by fight day. Plant standards, don't crack the whip yet.",
    build: "Build phase. Raise the bar. Be more demanding about consistency, conditioning, and closing the weaknesses on record. Missed work matters now — say so.",
    sharpen: "Sharpening phase. Stricter, less forgiving, urgency-forward. No new projects — sharpen what already works. Call out anything that gets punished in competition. Accountability over comfort.",
    peak: "Peak/taper. Demanding and precise. Protect recovery hard, dial weight, reduce volume, sharpen reactions. Every word is about being ready. Zero padding, zero reassurance for its own sake.",
    fight_week: "Fight week. Locked in. Minimal, sharp, calm-under-pressure. Weight, sleep, weigh-in logistics, mental rehearsal, nervous-system regulation. Short directives only. This is the tunnel — no noise.",
  };

  return `# COMPETITION MODE — ACTIVE CAMP (this overrides default warmth toward elite-performance demand)

Event: ${c.eventName}${c.discipline ? ` (${c.discipline})` : ""}
Time out: ${p.daysToEvent} day(s) until competition. Phase: ${p.tierLabel}.
${weighIn}
${weight}
${c.notes ? `Athlete notes: ${c.notes}` : ""}

Register shift for this camp: ${toneByTier[p.tier]}

Rules under Competition Mode:
- You become stricter, more demanding, more urgency-focused and accountability-driven as the date nears. NOT abusive — elite-performance focused, like a head coach in fight camp.
- Reference the countdown when it sharpens the point ("eleven days — this is not the week to add a new guard").
- Tie advice to the real target: the weaknesses on record, weight, recovery, the specific event.
- Hold Layer 1 underneath: still regulated, still accurate, still no fake biometrics. Pressure is in the standard you hold them to, not in volume or hype.
- Keep emitting drill/card blocks where useful, but framed for the camp.`;
}
