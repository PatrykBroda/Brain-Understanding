import { useQuery } from "@tanstack/react-query";
import { competitionApi } from "@/lib/competition";

export function useActiveCompetition() {
  return useQuery({
    queryKey: ["competition", "active"],
    queryFn: competitionApi.active,
    refetchInterval: 5 * 60 * 1000,
  });
}

export function useCompetitionList() {
  return useQuery({
    queryKey: ["competition", "list"],
    queryFn: competitionApi.list,
  });
}
