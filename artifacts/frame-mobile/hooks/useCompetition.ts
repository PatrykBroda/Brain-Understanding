import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  competitionApi,
  type CompetitionInput,
  type SessionInput,
} from "@/lib/competition";

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

export function useCreateCamp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CompetitionInput) => competitionApi.create(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["competition"] }),
  });
}

export function useUpdateCamp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: Partial<CompetitionInput> }) =>
      competitionApi.update(id, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["competition"] }),
  });
}

export function useCancelCamp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => competitionApi.cancel(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["competition"] }),
  });
}

export function useCreateSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ campId, input }: { campId: number; input: SessionInput }) =>
      competitionApi.createSession(campId, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["competition"] }),
  });
}

export function useUpdateSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: Partial<SessionInput> }) =>
      competitionApi.updateSession(id, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["competition"] }),
  });
}

export function useDeleteSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => competitionApi.deleteSession(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["competition"] }),
  });
}
