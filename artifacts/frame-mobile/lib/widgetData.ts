// Pure data layer for the iOS home-screen widget: what the widget shows, built
// from the same sources as Home (GET /today focus, GET /competition/active).
// The native side only ever reads this JSON; no logic lives in Swift.

export const WIDGET_APP_GROUP = "group.app.replit.frame";
export const WIDGET_STORAGE_KEY = "frame.widget.v1";

export interface WidgetPayload {
  v: 1;
  /** Local date (YYYY-MM-DD) the payload was computed for. */
  date: string;
  focusTitle: string;
  focusDetail: string;
  /** Whole days to fight day, or null when no active camp. */
  daysLeft: number | null;
  campName: string | null;
  /** Short caption under the number, e.g. "days left in camp". */
  daysCaption: string;
  signedIn: boolean;
}

export interface WidgetInput {
  date: string;
  signedIn: boolean;
  focus: { title: string; detail: string; current?: boolean } | null;
  camp: { eventName: string; daysToEvent: number } | null;
}

const MAX_TITLE = 60;
const MAX_DETAIL = 120;

function clip(s: string, n: number): string {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length <= n ? t : `${t.slice(0, n - 1).trimEnd()}…`;
}

export function daysCaption(days: number | null): string {
  if (days === null) return "";
  if (days < 0) return "camp over";
  if (days === 0) return "fight day";
  return days === 1 ? "day left in camp" : "days left in camp";
}

export function buildWidgetPayload(input: WidgetInput): WidgetPayload {
  if (!input.signedIn) {
    return {
      v: 1,
      date: input.date,
      focusTitle: "Open FRAME",
      focusDetail: "Sign in to see today's focus.",
      daysLeft: null,
      campName: null,
      daysCaption: "",
      signedIn: false,
    };
  }
  const camp = input.camp && input.camp.daysToEvent >= 0 ? input.camp : null;
  const focus = input.focus && input.focus.current !== false ? input.focus : null;
  return {
    v: 1,
    date: input.date,
    focusTitle: focus ? clip(focus.title, MAX_TITLE) : "Check in to get today's focus",
    focusDetail: focus ? clip(focus.detail, MAX_DETAIL) : "",
    daysLeft: camp ? camp.daysToEvent : null,
    campName: camp ? clip(camp.eventName, MAX_TITLE) : null,
    daysCaption: daysCaption(camp ? camp.daysToEvent : null),
    signedIn: true,
  };
}

/** Only write when the content changed (the native reload is rate-limited by iOS). */
export function payloadChanged(prev: string | null, next: WidgetPayload): boolean {
  return prev !== JSON.stringify(next);
}
