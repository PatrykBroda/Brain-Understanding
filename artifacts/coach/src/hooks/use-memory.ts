import { useQuery } from "@tanstack/react-query";
import { api, type AthleteFact } from "@/lib/api";

export function useMemory(enabled: boolean) {
  return useQuery<{ facts: AthleteFact[]; count: number }>({
    queryKey: ["memory"],
    queryFn: api.getMemory,
    enabled,
    staleTime: 0,
  });
}
