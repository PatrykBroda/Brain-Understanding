import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiDelete, apiGet, apiPatch, apiPost, ApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import type { InjuryKind, InjuryRow, InjurySeverity, InjuryStatus } from "@/lib/injuryLogic";

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

export type InjuryInput = {
  area: string;
  severity: InjurySeverity;
  note?: string;
  kind?: InjuryKind;
  date?: string;
  status?: InjuryStatus;
};

/** The server message when there is one (it says what actually went wrong), else a plain fallback. Never empty. */
export function injuryErrorMessage(err: unknown): string {
  if (err instanceof ApiError && err.message) return err.message;
  return "Couldn't reach FRAME. Check your connection and try again.";
}

export function useLogInjury() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: InjuryInput) => apiPost("/injuries", v),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useUpdateInjury() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: number } & Partial<InjuryInput>) => {
      const { id, ...body } = v;
      return apiPatch(`/injuries/${id}`, body);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useResolveInjury() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiPost(`/injuries/${id}/resolve`),
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
