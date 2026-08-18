import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type FighterInput, type FighterUpdate } from "@/lib/api";

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
    onSuccess: (data) => {
      // Seed the fighter cache synchronously from the create response so the
      // Gate flips into the app immediately. Invalidating instead would kick
      // off a refetch that can briefly return null right after the write
      // (read-after-write lag), which drops the athlete back onto the
      // onboarding form and forces them to fill it in a second time.
      qc.setQueryData(["fighter"], data);
      qc.invalidateQueries({ queryKey: ["conversation"] });
    },
  });
}

export function useUpdateFighter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: FighterUpdate) => api.updateFighter(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fighter"] });
      qc.invalidateQueries({ queryKey: ["conversation"] });
    },
  });
}
