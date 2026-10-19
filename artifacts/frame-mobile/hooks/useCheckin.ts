import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "@/lib/api";
import { useFighter } from "@/context/FighterContext";
import { useLocalDay } from "@/hooks/useLocalDay";
import { TODAY_QUERY_KEY } from "@/hooks/useToday";

// Daily readiness check-in — all values athlete-entered, one row per local day.
// Mirrors the web checkin API (GET /checkin/today, GET /checkin/history,
// POST /checkin). The server owns the calendar day.
export interface DailyCheckin {
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

export interface DailyCheckinInput {
  sleep: number;
  energy: number;
  soreness: number;
  stress: number;
  restingHr?: number | null;
}

export function useTodayCheckin() {
  const { fighter } = useFighter();
  // The server keys "today" to the athlete's local calendar day; carry that same day in
  // the query key so an app left open across their midnight doesn't keep presenting
  // yesterday's row as today's.
  const day = useLocalDay();
  return useQuery({
    queryKey: ["checkin", "today", day],
    queryFn: () => apiGet<{ checkin: DailyCheckin | null; date: string }>("/checkin/today"),
    enabled: !!fighter,
  });
}

// Readiness trend (FRAME+). Only fetched when the plan is known frame_plus —
// the free tier renders a locked teaser without burning a guaranteed 402.
export function useCheckinHistory(enabled: boolean) {
  const { fighter } = useFighter();
  return useQuery({
    queryKey: ["checkin", "history"],
    queryFn: () => apiGet<{ checkins: DailyCheckin[] }>("/checkin/history"),
    enabled: enabled && !!fighter,
    staleTime: 60_000,
  });
}

export function useSaveCheckin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: DailyCheckinInput) =>
      apiPost<{ checkin: DailyCheckin; date: string }>("/checkin", input),
    onSuccess: (data) => {
      qc.setQueryData(["checkin", "today", data.date], data);
      qc.invalidateQueries({ queryKey: ["checkin", "history"] });
      // A check-in changes State, Today's Focus and readiness.
      qc.invalidateQueries({ queryKey: TODAY_QUERY_KEY });
    },
  });
}
