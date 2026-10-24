// The athlete's day as the server builds it (GET /today): State, Today's Focus and
// readiness for the current local date, plus an honest disclosure when FRAME holds
// nothing new today. Mirrors artifacts/api-server/src/lib/dailyContext.ts (mirrors artifacts/frame-mobile/lib/today.ts).

export type StateName =
  | "Dormant"
  | "Stable"
  | "Loaded"
  | "Recovering"
  | "Tight"
  | "Volatile"
  | "Composed"
  | "Overextended";

export interface DailyCheckinRow {
  id: number;
  fighterId: number;
  checkinDate: string; // YYYY-MM-DD
  sleep: number;
  energy: number;
  soreness: number;
  stress: number;
  restingHr: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface FocusView {
  title: string;
  detail: string;
  because: string[];
  kind: "recovery" | "camp" | "weakness" | "goal" | "onboarding" | "open";
  forDate: string | null;
  current: boolean;
  carriedOver: boolean;
}

/** Reasons shown under the focus. Drops the old "Your check-in today: ..." line that earlier server reads stored. */
export function focusBecause(focus: Pick<FocusView, "because">): string[] {
  return focus.because.filter((b) => !/^Your check-in today:/i.test(b));
}

export type DisclosureCode = "none" | "no_checkin_today" | "no_info_today" | "no_info_ever";

export interface TodayView {
  date: string;
  timezone: string;
  fresh: boolean;
  state: { name: StateName | null; source: string; asOf: string | null; current: boolean };
  focus: FocusView | null;
  readiness: {
    today: { score: number; band: "primed" | "trainable" | "guarded" | "depleted"; checkin: DailyCheckinRow } | null;
    latest: { date: string; score: number; daysAgo: number } | null;
  };
  disclosure: { code: DisclosureCode; message: string; action: "check_in" | "none" };
  history: { date: string; state: StateName; focusTitle: string }[];
}

/** The line under the state name: which day this read belongs to. */
export function stateDateLine(state: TodayView["state"], fmt: (d: string) => string): string | null {
  if (!state.asOf) return null;
  if (state.current) return `Today · ${fmt(state.asOf)}`;
  return `Last read ${fmt(state.asOf)}`;
}

/** The label shown big on the State screen: never an old state presented as today's. */
export function stateHeadline(state: TodayView["state"]): string {
  if (state.current && state.name) return state.name;
  if (state.name) return "No read today";
  return "No read yet";
}

/** sessionStorage flag State sets so the dashboard opens its check-in form on arrival. */
export const OPEN_CHECKIN_FLAG = "frame:open-checkin";
