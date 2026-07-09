import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { checkinApi, type DailyCheckinInput } from "@/lib/api";
import { useFighter } from "@/hooks/use-fighter";

export function useTodayCheckin() {
  const { data: fighterData } = useFighter();
  // The server keys "today" to the UTC calendar day; carry that same day in the
  // query key (+ refetch on focus) so an app left open across UTC midnight
  // doesn't keep presenting yesterday's row as today's.
  const utcDay = new Date().toISOString().slice(0, 10);
  return useQuery({
    queryKey: ["checkin", "today", utcDay],
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
      // data.date is the server's UTC day — matches useTodayCheckin's key.
      qc.setQueryData(["checkin", "today", data.date], data);
      // A new check-in changes the trend — refetch it (FRAME+ dashboards).
      qc.invalidateQueries({ queryKey: ["checkin", "history"] });
    },
  });
}
