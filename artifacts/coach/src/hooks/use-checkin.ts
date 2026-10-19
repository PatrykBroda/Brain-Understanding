import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { checkinApi, type DailyCheckinInput } from "@/lib/api";
import { useFighter } from "@/hooks/use-fighter";
import { TODAY_QUERY_KEY, useLocalDay } from "@/hooks/use-today";
import { localDateString } from "@/lib/local-day";

export function useTodayCheckin() {
  const { data: fighterData } = useFighter();
  // The server keys "today" to the athlete's local calendar day; carry that same day in the
  // query key (+ refetch on focus) so a page left open across their midnight doesn't keep
  // presenting yesterday's row as today's.
  const day = useLocalDay();
  return useQuery({
    queryKey: ["checkin", "today", day],
    queryFn: () => checkinApi.today(),
    enabled: !!fighterData?.fighter,
    refetchOnWindowFocus: true,
  });
}

// Readiness trend (FRAME+). Only fetched when the plan is known frame_plus —
// free tier renders a locked teaser without burning a guaranteed 402.
export function useCheckinHistory(enabled: boolean) {
  const { data: fighterData } = useFighter();
  return useQuery({
    queryKey: ["checkin", "history"],
    queryFn: () => checkinApi.history(),
    enabled: enabled && !!fighterData?.fighter,
    staleTime: 60_000,
  });
}

export function useSaveCheckin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: DailyCheckinInput) => checkinApi.save(input),
    onSuccess: (data) => {
      // Keyed on the same local day the read hook uses, then re-read so the server stays the authority.
      qc.setQueryData(["checkin", "today", localDateString()], data);
      qc.invalidateQueries({ queryKey: ["checkin", "today"] });
      // A check-in changes State, Today's Focus and readiness.
      qc.invalidateQueries({ queryKey: TODAY_QUERY_KEY });
      // A new check-in changes the trend — refetch it (FRAME+ dashboards).
      qc.invalidateQueries({ queryKey: ["checkin", "history"] });
    },
  });
}
