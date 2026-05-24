import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type FighterInput } from "@/lib/api";

export function useFighter() {
  return useQuery({
    queryKey: ["fighter"],
    queryFn: () => api.getFighter(),
  });
}

export function useSaveFighter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: FighterInput) => api.saveFighter(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fighter"] });
      qc.invalidateQueries({ queryKey: ["conversation"] });
    },
  });
}
