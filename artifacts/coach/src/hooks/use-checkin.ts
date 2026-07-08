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

export function useSaveCheckin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: DailyCheckinInput) => checkinApi.save(input),
    onSuccess: (data) => {
      // data.date is the server's UTC day — matches useTodayCheckin's key.
      qc.setQueryData(["checkin", "today", data.date], data);
    },
  });
}
