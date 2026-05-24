import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

export function useNextCalibration(enabled: boolean) {
  return useQuery({
    queryKey: ["calibration", "next"],
    queryFn: () => api.getNextCalibration(),
    enabled,
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
