export type PushTarget =
  | { kind: "checkin" }
  | { kind: "analysis"; analysisId: string }
  | { kind: "camp"; competitionId?: string };

export const EXPO_TOKEN_RE = /^Expo(nent)?PushToken\[[^\]\s]{8,200}\]$/;

export function isValidExpoToken(t: unknown): t is string {
  return typeof t === "string" && EXPO_TOKEN_RE.test(t);
}

/** Map a server-push notification's data payload to an in-app destination (null = not ours). */
export function parsePushTarget(data: unknown): PushTarget | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  if (d.route === "checkin") return { kind: "checkin" };
  if (d.route === "analysis" && (typeof d.analysisId === "string" || typeof d.analysisId === "number")) {
    return { kind: "analysis", analysisId: String(d.analysisId) };
  }
  if (d.route === "camp") {
    const c = d.competitionId;
    return { kind: "camp", competitionId: typeof c === "string" || typeof c === "number" ? String(c) : undefined };
  }
  return null;
}

export interface PushPrefs {
  enabled: boolean;
  quietStartMin: number;
  quietEndMin: number;
}

/** Step a minutes-of-day value by delta, wrapping at midnight. */
export function shiftMinutes(min: number, delta: number): number {
  return (((min + delta) % 1440) + 1440) % 1440;
}

export function formatMinutes(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
