import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { analysisApi, type CreateAnalysisInput } from "@/lib/api";
import { useFighter } from "@/hooks/use-fighter";

export function useAnalyses() {
  const { data: fighterData } = useFighter();
  return useQuery({
    queryKey: ["analyses"],
    queryFn: () => analysisApi.list(),
    enabled: !!fighterData?.fighter,
  });
}

export function useAnalysis(id: number | null, compareId?: number | null) {
  return useQuery({
    queryKey: ["analysis", id, compareId ?? null],
    queryFn: () => analysisApi.get(id as number, compareId),
    enabled: id != null,
  });
}

export function useCreateAnalysis() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateAnalysisInput) => analysisApi.create(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["analyses"] });
      qc.invalidateQueries({ queryKey: ["memory"] });
    },
  });
}

export function useUpdateKeyframeNotes(analysisId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (notes: Record<number, string>) => analysisApi.updateNotes(analysisId, notes),
    onSuccess: (data) => {
      qc.setQueryData(["analysis", analysisId], data);
    },
  });
}
