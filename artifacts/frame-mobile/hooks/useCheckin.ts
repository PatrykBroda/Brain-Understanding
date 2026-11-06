import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "@/lib/api";
import { useFighter } from "@/context/FighterContext";
import { useLocalDay } from "@/hooks/useLocalDay";
import { localDateString } from "@/lib/localDay";
import { TODAY_QUERY_KEY } from "@/hooks/useToday";
import type { StreakInfo, WeeklyRecapData } from "@/lib/recapLogic";

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
    queryFn: () => apiGet<{ checkin: DailyCheckin | null; date: string; streak?: StreakInfo }>("/checkin/today"),
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

// Last 7 days vs the 7 before (free for all plans). Only fetched when the card could show.
export function useWeeklyRecap(enabled: boolean) {
  const { fighter } = useFighter();
  const day = useLocalDay();
  return useQuery({
    queryKey: ["checkin", "recap", day],
    queryFn: () => apiGet<{ recap: WeeklyRecapData }>("/checkin/recap"),
    enabled: enabled && !!fighter,
    staleTime: 5 * 60_000,
  });
}

export function useSaveCheckin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: DailyCheckinInput) =>
      apiPost<{ checkin: DailyCheckin; date: string; streak?: StreakInfo }>("/checkin", input),
    onSuccess: (data) => {
      // Keyed on the same local day the read hook uses, then re-read so the server stays the authority.
      qc.setQueryData(["checkin", "today", localDateString()], data);
      qc.invalidateQueries({ queryKey: ["checkin", "today"] });
      qc.invalidateQueries({ queryKey: ["checkin", "history"] });
      // A check-in changes State, Today's Focus and readiness.
      qc.invalidateQueries({ queryKey: TODAY_QUERY_KEY });
    },
  });
}
