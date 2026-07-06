import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  competitionApi,
  type CompetitionInput,
  type TrainingSessionInput,
} from "@/lib/api";

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

// Any camp or session mutation invalidates the whole competition tree, which
// refreshes the active-camp query (dashboard + sessions) and the history list.

export function useCreateCompetition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CompetitionInput) => competitionApi.create(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["competition"] }),
  });
}

export function useUpdateCompetition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: Partial<CompetitionInput> }) =>
      competitionApi.update(id, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["competition"] }),
  });
}

export function useCancelCompetition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => competitionApi.cancel(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["competition"] }),
  });
}

export function useCreateSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ campId, input }: { campId: number; input: TrainingSessionInput }) =>
      competitionApi.createSession(campId, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["competition"] }),
  });
}

export function useUpdateSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: Partial<TrainingSessionInput> }) =>
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
