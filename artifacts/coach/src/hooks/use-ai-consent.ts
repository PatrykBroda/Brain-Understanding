import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

export function useAiConsent() {
  return useQuery({
    queryKey: ["ai-consent"],
    queryFn: () => api.getAiConsent(),
  });
}

export function useSetAiConsent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (accepted: boolean) => api.setAiConsent(accepted),
    onSuccess: (data) => {
      qc.setQueryData(["ai-consent"], data);
    },
  });
}
