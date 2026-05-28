import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { plannerApi, type PlannerResponse } from "@/lib/api";

const KEY = ["planner"] as const;

export function usePlanner() {
  return useQuery<PlannerResponse>({
    queryKey: KEY,
    queryFn: plannerApi.get,
    staleTime: 30_000,
  });
}

export function useRegeneratePlanner() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => plannerApi.regenerate(),
    onSuccess: (data) => {
      qc.setQueryData(KEY, data);
      qc.invalidateQueries({ queryKey: ["memory"] });
    },
  });
}

export function useTogglePlannerItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ key, completed }: { key: string; completed: boolean }) =>
      completed ? plannerApi.complete(key) : plannerApi.uncomplete(key),
    onMutate: async ({ key, completed }) => {
      await qc.cancelQueries({ queryKey: KEY });
      const prev = qc.getQueryData<PlannerResponse>(KEY);
      if (prev) {
        const next: PlannerResponse = {
          ...prev,
          completions: completed
            ? Array.from(new Set([...prev.completions, key]))
            : prev.completions.filter((k) => k !== key),
        };
        qc.setQueryData(KEY, next);
      }
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(KEY, ctx.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: KEY });
      qc.invalidateQueries({ queryKey: ["memory"] });
    },
  });
}
