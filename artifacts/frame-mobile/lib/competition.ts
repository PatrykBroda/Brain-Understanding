import { apiGet, apiPost, apiPatch, apiDelete } from "@/lib/api";
export { toIso } from "@/lib/dateUtils";

export type Competition = {
  id: number;
  fighterId: number;
  eventName: string;
  discipline: string;
  eventDate: string;
  weighInDate: string | null;
  targetWeight: string;
  currentWeight: string;
  notes: string;
  status: string;
  opponent: string;
  promotion: string;
  weightClass: string;
  rounds: number | null;
  location: string;
  createdAt: string;
  updatedAt: string;
};

export type PressureTier = "base" | "build" | "sharpen" | "peak" | "fight_week";

export type CompetitionPressure = {
  competition: Competition;
  daysToEvent: number;
  daysToWeighIn: number | null;
  tier: PressureTier;
  tierLabel: string;
  phase: string;
};

export type WeightCut = {
  current: string;
  target: string;
  currentNum: number | null;
  targetNum: number | null;
  unit: "kg" | "lb" | null;
  difference: number | null;
  status: string;
};

export const SESSION_TYPES = [
  "sparring",
  "wrestling",
  "bjj",
  "striking",
  "conditioning",
  "recovery",
  "mobility",
] as const;

export type SessionType = (typeof SESSION_TYPES)[number];

export type TrainingSession = {
  id: number;
  campId: number;
  fighterId: number;
  sessionType: SessionType;
  sessionDate: string;
  startTime: string | null;
  durationMin: number | null;
  coach: string;
  objective: string;
  notes: string;
  completed: boolean;
  source: "manual" | "google_calendar";
  externalEventId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ActiveCompetitionResponse = {
  competition: Competition | null;
  pressure: CompetitionPressure | null;
  weightCut: WeightCut | null;
  sessions: TrainingSession[];
};

export type CompetitionInput = {
  eventName: string;
  discipline?: string;
  eventDate: string;
  weighInDate?: string | null;
  targetWeight?: string;
  currentWeight?: string;
  notes?: string;
  opponent?: string;
  promotion?: string;
  weightClass?: string;
  rounds?: number | null;
  location?: string;
};

export type SessionInput = {
  sessionType: SessionType;
  sessionDate: string;
  startTime?: string | null;
  durationMin?: number | null;
  coach?: string;
  objective?: string;
  notes?: string;
  completed?: boolean;
};

export const competitionApi = {
  active: () => apiGet<ActiveCompetitionResponse>("/competition/active"),
  list: () => apiGet<{ competitions: Competition[] }>("/competition"),
  create: (input: CompetitionInput) =>
    apiPost<{ competition: Competition }>("/competition", input),
  update: (id: number, input: Partial<CompetitionInput>) =>
    apiPatch<{ competition: Competition }>(`/competition/${id}`, input),
  cancel: (id: number) => apiDelete<{ ok: true }>(`/competition/${id}`),
  listSessions: (campId: number) =>
    apiGet<{ sessions: TrainingSession[] }>(`/competition/${campId}/sessions`),
  createSession: (campId: number, input: SessionInput) =>
    apiPost<{ session: TrainingSession }>(`/competition/${campId}/sessions`, input),
  updateSession: (id: number, input: Partial<SessionInput>) =>
    apiPatch<{ session: TrainingSession }>(`/competition/sessions/${id}`, input),
  deleteSession: (id: number) =>
    apiDelete<{ ok: true }>(`/competition/sessions/${id}`),
};
