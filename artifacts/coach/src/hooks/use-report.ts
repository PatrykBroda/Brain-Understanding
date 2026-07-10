import { useQuery } from "@tanstack/react-query";
import { reportApi } from "@/lib/api";
import { useFighter } from "@/hooks/use-fighter";

// Fetches the weekly FRAME Intelligence Report. `enabled` only lazily — the
// caller passes `open` so the (snapshot-writing) endpoint isn't hit until the
// athlete actually opens the report.
export function useWeeklyReport(enabled: boolean) {
  const { data: fighterData } = useFighter();
  return useQuery({
    queryKey: ["weekly-report"],
    queryFn: () => reportApi.getWeekly(),
    enabled: enabled && !!fighterData?.fighter,
    staleTime: 5 * 60 * 1000,
  });
}
