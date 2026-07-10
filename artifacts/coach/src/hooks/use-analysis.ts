import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { analysisApi, type CreateAnalysisInput, type VideoAnalysis } from "@/lib/api";
import { useFighter } from "@/hooks/use-fighter";

export function useAnalyses() {
  const { data: fighterData } = useFighter();
  return useQuery({
    queryKey: ["analyses"],
    queryFn: () => analysisApi.list(),
    enabled: !!fighterData?.fighter,
  });
}

export function useOpponentAnalyses() {
  const { data: fighterData } = useFighter();
  return useQuery({
    queryKey: ["analyses", "opponent"],
    queryFn: () => analysisApi.listOpponents(),
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

export function useAnswerReview(analysisId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (answer: string) => analysisApi.answer(analysisId, answer),
    onSuccess: (data) => {
      // Patch only reviewAnswer into every cached variant of this analysis
      // (the query key carries a compareId), preserving prevSignals/history
      // that the answer endpoint doesn't return. setQueriesData matches by
      // prefix so both the plain and compare views update in place.
      qc.setQueriesData<{ analysis: VideoAnalysis } | undefined>(
        { queryKey: ["analysis", analysisId] },
        (old) =>
          old?.analysis
            ? { ...old, analysis: { ...old.analysis, reviewAnswer: data.analysis.reviewAnswer } }
            : old,
      );
      // The answer became a recorded athlete_fact — refresh the model views.
      qc.invalidateQueries({ queryKey: ["memory"] });
      qc.invalidateQueries({ queryKey: ["analyses"] });
    },
  });
}
