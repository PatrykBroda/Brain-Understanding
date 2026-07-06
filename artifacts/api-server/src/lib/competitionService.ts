import { db, competitionsTable, type Competition, type TrainingSession } from "@workspace/db";
import { and, asc, eq, gte } from "drizzle-orm";

const DAY_MS = 24 * 60 * 60 * 1000;

export type PressureTier =
  | "base"
  | "build"
  | "sharpen"
  | "peak"
  | "fight_week";

// Display phase names for the Camp dashboard. Five pressure tiers collapse into
// four athlete-facing phases: peak + fight_week both read as "Fight Week" (both
// fall inside the final week before the event).
export type CampPhase = "Build" | "Develop" | "Sharpen" | "Fight Week";

const PHASE_BY_TIER: Record<PressureTier, CampPhase> = {
  base: "Build",
  build: "Develop",
  sharpen: "Sharpen",
  peak: "Fight Week",
  fight_week: "Fight Week",
};

export function phaseFor(tier: PressureTier): CampPhase {
  return PHASE_BY_TIER[tier];
}

export type CompetitionPressure = {
  competition: Competition;
  daysToEvent: number;
  daysToWeighIn: number | null;
  tier: PressureTier;
  tierLabel: string;
  phase: CampPhase;
};

// Honest weight-cut readout — derived ONLY from the real target/current values.
// Both fields are free text ("77kg", "170 lbs", "77"), so parse defensively and
// fall back to "Unavailable"/"Calibrating" rather than fabricating a number.
export type WeightCut = {
  current: string;
  target: string;
  currentNum: number | null;
  targetNum: number | null;
  unit: string | null;
  difference: number | null;
  status: string;
};

function parseWeight(raw: string): { num: number | null; unit: string | null } {
  const text = (raw ?? "").trim();
  if (!text) return { num: null, unit: null };
  const numMatch = text.match(/-?\d+(?:\.\d+)?/);
  const num = numMatch ? Number(numMatch[0]) : null;
  const unitMatch = text.match(/kg|lbs?|pounds?/i);
  let unit: string | null = null;
  if (unitMatch) unit = /kg/i.test(unitMatch[0]) ? "kg" : "lb";
  return { num: Number.isFinite(num as number) ? num : null, unit };
}

export function weightCutFor(competition: Competition): WeightCut {
  const current = competition.currentWeight ?? "";
  const target = competition.targetWeight ?? "";
  const c = parseWeight(current);
  const t = parseWeight(target);
  // Only subtract when the units are compatible. Comparing "170 lbs" against
  // "77kg" would otherwise fabricate a nonsense figure ("93lb to cut"), which
  // violates the no-fabricated-numbers pillar. On a unit conflict we stay honest
  // and report "Calibrating" instead of inventing a difference.
  const unitsConflict = c.unit !== null && t.unit !== null && c.unit !== t.unit;

  let unit: string | null = null;
  let difference: number | null = null;
  let status: string;
  if (c.num !== null && t.num !== null && !unitsConflict) {
    unit = c.unit ?? t.unit ?? null;
    difference = Math.round((c.num - t.num) * 10) / 10;
    const suffix = unit ? unit : "";
    if (difference > 0) status = `${difference}${suffix} to cut`;
    else if (difference < 0) status = `${Math.abs(difference)}${suffix} under`;
    else status = "On weight";
  } else if (c.num !== null || t.num !== null) {
    // We have one usable side (or two in incompatible units) — honest partial state.
    status = "Calibrating";
  } else {
    status = "Unavailable";
  }

  return {
    current,
    target,
    currentNum: c.num,
    targetNum: t.num,
    unit,
    difference,
    status,
  };
}

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
  return {
    competition,
    daysToEvent,
    daysToWeighIn,
    tier,
    tierLabel: label,
    phase: phaseFor(tier),
  };
}

// The directive injected into the coach's dynamic context when a camp is live.
// Sternness scales with proximity — never abusive, always elite-performance focused.
export function competitionPromptBlock(
  p: CompetitionPressure,
  extra?: { sessions?: TrainingSession[]; weightCut?: WeightCut },
): string {
  const c = p.competition;
  const weighIn =
    p.daysToWeighIn !== null
      ? `Weigh-in: ${p.daysToWeighIn} day(s) out${c.targetWeight ? ` at ${c.targetWeight}` : ""}.`
      : c.targetWeight
        ? `Target weight: ${c.targetWeight}.`
        : "";

  const wc = extra?.weightCut;
  const weight = wc
    ? `Weight cut: ${wc.current || "?"} → ${wc.target || "?"} (${wc.status}).`
    : c.targetWeight || c.currentWeight
      ? `Weight: ${c.currentWeight || "?"} → ${c.targetWeight || "?"}.`
      : "";

  const fightLine = [
    c.opponent ? `Opponent: ${c.opponent}` : "",
    c.promotion ? `Promotion: ${c.promotion}` : "",
    c.weightClass ? `Weight class: ${c.weightClass}` : "",
    c.rounds ? `Format: ${c.rounds} round(s)` : "",
    c.location ? `Location: ${c.location}` : "",
  ]
    .filter(Boolean)
    .join(" · ");

  const upcoming = (extra?.sessions ?? [])
    .filter((s) => !s.completed)
    .slice(0, 6)
    .map((s) => {
      const when = s.startTime ? `${s.sessionDate} ${s.startTime}` : s.sessionDate;
      const dur = s.durationMin ? ` (${s.durationMin}min)` : "";
      const obj = s.objective ? ` — ${s.objective}` : "";
      return `- ${when}: ${s.sessionType}${dur}${obj}`;
    })
    .join("\n");
  const sessionsBlock = upcoming
    ? `\nScheduled sessions ahead (these are PLANNED, not confirmed done — never state them as completed training):\n${upcoming}`
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
${fightLine ? `${fightLine}\n` : ""}Time out: ${p.daysToEvent} day(s) until competition. Phase: ${p.phase} (${p.tierLabel}).
${weighIn}
${weight}
${c.notes ? `Athlete notes: ${c.notes}` : ""}${sessionsBlock}

Register shift for this camp: ${toneByTier[p.tier]}

Rules under Competition Mode:
- You become stricter, more demanding, more urgency-focused and accountability-driven as the date nears. NOT abusive — elite-performance focused, like a head coach in fight camp.
- Reference the countdown when it sharpens the point ("eleven days — this is not the week to add a new guard").
- Tie advice to the real target: the weaknesses on record, weight, recovery, the specific event.
- Hold Layer 1 underneath: still regulated, still accurate, still no fake biometrics. Pressure is in the standard you hold them to, not in volume or hype.
- Keep emitting drill/card blocks where useful, but framed for the camp.`;
}
