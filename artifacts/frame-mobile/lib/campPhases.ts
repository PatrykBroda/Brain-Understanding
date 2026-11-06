// Pure fight-camp countdown logic. Works backwards from the fight date (and weigh-in
// date, when there is one) through build, hard weeks, taper, weight cut and fight week.
// No React Native imports so it is unit-testable; the reminder, Home and Camp tab all
// read it, so the phase the athlete sees is the same everywhere.

export type CampPhaseKey = "build" | "hard" | "taper" | "weight_cut" | "fight_week";

export interface CampPhaseInfo {
  key: CampPhaseKey;
  label: string;
  /** One line for Home: what this phase is about. */
  homeLine: string;
  reminderTitle: string;
  reminderBody: string;
}

export interface CampInput {
  daysToEvent: number;
  /** Days to weigh-in, or null when no weigh-in date was entered. */
  daysToWeighIn: number | null;
}

/** Days out where each phase starts, counting back from the event. */
export const BUILD_FROM = 43;
export const HARD_FROM = 42;
export const TAPER_FROM = 14;
export const WEIGHT_CUT_FROM = 7;
export const FIGHT_WEEK_FROM = 3;

const COPY: Record<CampPhaseKey, Omit<CampPhaseInfo, "key">> = {
  build: {
    label: "Build",
    homeLine: "Build the base: volume, technique and consistency. Show up every session.",
    reminderTitle: "Camp check-in",
    reminderBody: "Build phase. How did today's work go? Log it with FRAME.",
  },
  hard: {
    label: "Hard weeks",
    homeLine: "Hard weeks: this is where the camp is won. Push the work, protect your recovery.",
    reminderTitle: "Hard week check-in",
    reminderBody: "Hard weeks. Check in on energy, sleep and soreness before you plan tomorrow.",
  },
  taper: {
    label: "Taper",
    homeLine: "Taper: volume comes down, sharpness stays up. No new projects.",
    reminderTitle: "Taper check-in",
    reminderBody: "Taper. Less volume, more precision. Log how your body feels.",
  },
  weight_cut: {
    label: "Weight cut",
    homeLine: "Weight cut: stick to the plan, log your weight and watch how you feel.",
    reminderTitle: "Weight and check-in",
    reminderBody: "Weight cut. Log today's weight and how you feel with FRAME.",
  },
  fight_week: {
    label: "Fight week",
    homeLine: "Fight week: weight, sleep, logistics and a calm head. Keep it simple.",
    reminderTitle: "Fight week",
    reminderBody: "Fight week. Quick check-in: sleep, weight, nerves. Stay calm and stay sharp.",
  },
};

const clampDays = (n: number): number => (Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : 0);

/** Which phase the athlete is in today. Fight week beats weight cut beats taper, and so on. */
export function campPhaseKey(input: CampInput): CampPhaseKey {
  const d = clampDays(input.daysToEvent);
  if (d <= FIGHT_WEEK_FROM) return "fight_week";
  const w = input.daysToWeighIn;
  if (w !== null && Number.isFinite(w) && w <= WEIGHT_CUT_FROM) return "weight_cut";
  if (d <= TAPER_FROM) return "taper";
  if (d <= HARD_FROM) return "hard";
  return "build";
}

export function campPhaseInfo(input: CampInput): CampPhaseInfo {
  const key = campPhaseKey(input);
  return { key, ...COPY[key] };
}

export interface TimelineStep {
  key: CampPhaseKey;
  label: string;
  /** Inclusive range of "days to event" this step covers; `from` is the earlier (larger) day. */
  fromDay: number;
  toDay: number;
  current: boolean;
}

/**
 * The camp laid out as an ordered list, earliest phase first. Weight cut only appears when
 * a weigh-in date exists, and its window is clipped to the days before fight week.
 */
export function campTimeline(input: CampInput): TimelineStep[] {
  const d = clampDays(input.daysToEvent);
  const cur = campPhaseKey(input);
  const hasCut = input.daysToWeighIn !== null && Number.isFinite(input.daysToWeighIn);
  const steps: Omit<TimelineStep, "current">[] = [
    { key: "build", label: COPY.build.label, fromDay: Math.max(d, BUILD_FROM), toDay: BUILD_FROM },
    { key: "hard", label: COPY.hard.label, fromDay: HARD_FROM, toDay: TAPER_FROM + 1 },
    { key: "taper", label: COPY.taper.label, fromDay: TAPER_FROM, toDay: hasCut ? WEIGHT_CUT_FROM + 1 : FIGHT_WEEK_FROM + 1 },
  ];
  if (hasCut) {
    steps.push({ key: "weight_cut", label: COPY.weight_cut.label, fromDay: WEIGHT_CUT_FROM, toDay: FIGHT_WEEK_FROM + 1 });
  }
  steps.push({ key: "fight_week", label: COPY.fight_week.label, fromDay: FIGHT_WEEK_FROM, toDay: 0 });
  return steps.map((s) => ({ ...s, current: s.key === cur }));
}

/** Reminder notification text for today's phase, or the plain default when there is no camp. */
export function reminderContentFor(
  input: CampInput | null,
  fallback: { title: string; body: string },
): { title: string; body: string } {
  if (!input) return { title: fallback.title, body: fallback.body };
  const p = campPhaseInfo(input);
  return { title: p.reminderTitle, body: p.reminderBody };
}
