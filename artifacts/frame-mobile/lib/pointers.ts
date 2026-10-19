// First-use pointers: three short, dismissible hints on Home showing where to log training,
// complete a readiness check-in and update the profile. A pointer disappears when the athlete
// dismisses it or has already done the thing it points to; nothing nags.

export type PointerId = "log-training" | "checkin" | "profile";

export interface PointerSpec {
  id: PointerId;
  title: string;
  body: string;
  action: string;
}

export const POINTERS: readonly PointerSpec[] = [
  { id: "log-training", title: "Log your training", body: "Tell your coach how a session went in Chat. A line or two is enough.", action: "Open chat" },
  { id: "checkin", title: "Check in on how you feel", body: "A 20-second readiness check-in sharpens today's State and Focus.", action: "Check in" },
  { id: "profile", title: "Keep your profile current", body: "Change your goals, level or answers on Profile any time. Your coach uses the latest.", action: "Open profile" },
];

export const pointersKey = (userId: string) => `frame:pointers:v1:${userId}`;

export function parseDismissed(raw: string | null | undefined): PointerId[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw) as unknown;
    return Array.isArray(v) ? (v.filter((x) => POINTERS.some((p) => p.id === x)) as PointerId[]) : [];
  } catch {
    return [];
  }
}

/** What to show now. Already-done things are never pointed at. */
export function pointersToShow(input: {
  dismissed: readonly PointerId[];
  hasCheckinToday: boolean;
  hasEverCheckedIn: boolean;
  hasChatted: boolean;
}): PointerSpec[] {
  return POINTERS.filter((p) => {
    if (input.dismissed.includes(p.id)) return false;
    if (p.id === "log-training" && input.hasChatted) return false;
    if (p.id === "checkin" && (input.hasCheckinToday || input.hasEverCheckedIn)) return false;
    return true;
  });
}
