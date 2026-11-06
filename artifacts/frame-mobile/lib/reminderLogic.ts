// Pure logic for the daily check-in reminder + in-app pop-up. No React Native imports so it
// is unit-testable; lib/dailyReminder.ts wires it to AsyncStorage and expo-notifications.

export const REMINDER_ID = "frame-daily-checkin";
export const DEFAULT_HOUR = 18;
export const DEFAULT_MINUTE = 0;

export interface ReminderState {
  /** Daily reminder is scheduled. Off until the athlete opts in. */
  enabled: boolean;
  hour: number;
  minute: number;
  /** Local date ("YYYY-MM-DD") the app was first opened; the pop-up never fires that day. */
  firstSeen: string | null;
  /** Local date the pop-up was last shown, so it appears at most once a day. */
  lastPopup: string | null;
  /** Athlete declined the reminder offer; stop offering it. */
  declinedOffer: boolean;
}

export const DEFAULT_STATE: ReminderState = {
  enabled: false,
  hour: DEFAULT_HOUR,
  minute: DEFAULT_MINUTE,
  firstSeen: null,
  lastPopup: null,
  declinedOffer: false,
};

const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
const int = (v: unknown, lo: number, hi: number, fallback: number) =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.trunc(v))) : fallback;

/** Tolerant parse of the stored JSON; anything malformed falls back to defaults (reminder off). */
export function parseReminderState(raw: string | null | undefined): ReminderState {
  if (!raw) return { ...DEFAULT_STATE };
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    return {
      enabled: o.enabled === true,
      hour: int(o.hour, 0, 23, DEFAULT_HOUR),
      minute: int(o.minute, 0, 59, DEFAULT_MINUTE),
      firstSeen: isDate(o.firstSeen) ? o.firstSeen : null,
      lastPopup: isDate(o.lastPopup) ? o.lastPopup : null,
      declinedOffer: o.declinedOffer === true,
    };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

/** Step the reminder time by `deltaMinutes`, wrapping around midnight. */
export function shiftTime(hour: number, minute: number, deltaMinutes: number): { hour: number; minute: number } {
  const total = (((hour * 60 + minute + deltaMinutes) % 1440) + 1440) % 1440;
  return { hour: Math.floor(total / 60), minute: total % 60 };
}

export function formatTime(hour: number, minute: number): string {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export type PopupKind = "checkin" | "checkin-with-offer";

/**
 * Whether to show the daily check-in pop-up on this app open, and which variant.
 * - never on the very first day the app is opened (no cold-launch prompt),
 * - at most once per local day,
 * - only for a signed-in athlete,
 * - the "remind me daily" offer is attached only while the reminder is off and not declined.
 */
export function popupToShow(state: ReminderState, today: string, signedIn: boolean): PopupKind | null {
  if (!signedIn) return null;
  if (!state.firstSeen || state.firstSeen >= today) return null;
  if (state.lastPopup === today) return null;
  return !state.enabled && !state.declinedOffer ? "checkin-with-offer" : "checkin";
}

/** Record the first day the app opened, without mutating the input. */
export function withFirstSeen(state: ReminderState, today: string): ReminderState {
  return state.firstSeen ? state : { ...state, firstSeen: today };
}

/** Whether a notification response's data payload is the daily check-in tap. */
export function isCheckinTap(data: unknown): boolean {
  return !!data && typeof data === "object" && (data as { route?: unknown }).route === "checkin";
}

export const CHECKIN_NOTIFICATION = {
  title: "Daily check-in",
  body: "How did today feel? Take a minute to check in with FRAME.",
} as const;

/** Prefill for the chat composer from the pop-up / notification. The athlete still taps send. */
export const DAILY_CHECKIN_PROMPT =
  "Daily check-in: here is how I am feeling today (energy, sleep, soreness, mind) and what I trained.";
