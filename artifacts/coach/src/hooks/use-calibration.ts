import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

export function useNextCalibration(enabled: boolean, fighterId?: string | number | null) {
  return useQuery({
    queryKey: ["calibration", "next", fighterId ?? null],
    queryFn: () => api.getNextCalibration(),
    enabled: enabled && !!fighterId,
  });
}

export function useAnswerCalibration() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ key, answer }: { key: string; answer: string }) =>
      api.answerCalibration(key, answer),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["calibration", "next"] });
    },
  });
}
