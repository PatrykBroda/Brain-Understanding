import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiDelete, apiGet, apiPost } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import type { InjuryRow, InjurySeverity } from "@/lib/injuryLogic";

const KEY = ["injuries"];

export function useInjuries() {
  const { isSignedIn } = useAuth();
  return useQuery({
    queryKey: KEY,
    queryFn: () => apiGet<{ today?: string; injuries: InjuryRow[] }>("/injuries"),
    enabled: !!isSignedIn,
    staleTime: 30_000,
  });
}

export function useLogInjury() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { area: string; severity: InjurySeverity; note?: string }) => apiPost("/injuries", v),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useRemoveInjury() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiDelete(`/injuries/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
