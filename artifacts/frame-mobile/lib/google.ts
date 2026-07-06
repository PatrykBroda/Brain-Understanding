import { apiGet, apiPost, apiDelete } from "@/lib/api";
import type { SessionType } from "@/lib/competition";

// Mobile mirror of the web googleApi. The API base already includes /api, so
// paths here are /google/... (see the frame-mobile auth notes).

export type GoogleStatus = {
  configured: boolean;
  connected: boolean;
  googleEmail: string | null;
  lastSyncedAt: string | null;
};

export type GoogleImportItem = {
  externalEventId: string;
  title: string;
  sessionDate: string; // YYYY-MM-DD
  startTime: string | null; // HH:MM
  durationMin: number | null;
  suggestedType: SessionType;
};

export type GoogleApplyResult = { imported: number; exported: number };

export type GoogleApplyInput = {
  campId: number;
  timeZone: string;
  importItems: {
    externalEventId: string;
    sessionType: SessionType;
    sessionDate: string;
    startTime: string | null;
    durationMin: number | null;
    objective: string;
  }[];
  exportSessions: boolean;
};

export function localTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

export const googleApi = {
  status: () => apiGet<GoogleStatus>("/google/status"),
  start: () => apiPost<{ url: string }>("/google/oauth/start"),
  disconnect: () => apiDelete<{ ok: true }>("/google/connection"),
  preview: (campId: number, timeZone: string) =>
    apiPost<{ items: GoogleImportItem[] }>("/google/sync/preview", { campId, timeZone }),
  apply: (input: GoogleApplyInput) =>
    apiPost<GoogleApplyResult>("/google/sync/apply", input),
};
