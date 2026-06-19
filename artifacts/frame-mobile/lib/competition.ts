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
};

export type CompetitionInput = {
  eventName: string;
  discipline?: string;
  eventDate: string;
  weighInDate?: string | null;
  targetWeight?: string;
  currentWeight?: string;
  notes?: string;
};

export const competitionApi = {
  active: () =>
    apiGet<{ competition: Competition | null; pressure: CompetitionPressure | null }>(
      "/competition/active",
    ),
  list: () => apiGet<{ competitions: Competition[] }>("/competition"),
  create: (input: CompetitionInput) =>
    apiPost<{ competition: Competition }>("/competition", input),
  update: (id: number, input: Partial<CompetitionInput>) =>
    apiPatch<{ competition: Competition }>(`/competition/${id}`, input),
  cancel: (id: number) => apiDelete<{ ok: true }>(`/competition/${id}`),
};
