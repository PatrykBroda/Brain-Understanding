import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { googleApi, type GoogleApplyInput } from "@/lib/google";

export function useGoogleStatus() {
  return useQuery({
    queryKey: ["google", "status"],
    queryFn: googleApi.status,
  });
}

export function useStartGoogleLink() {
  return useMutation({
    mutationFn: googleApi.start,
  });
}

export function useDisconnectGoogle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: googleApi.disconnect,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["google"] }),
  });
}

export function useGooglePreview() {
  return useMutation({
    mutationFn: ({ campId, timeZone }: { campId: number; timeZone: string }) =>
      googleApi.preview(campId, timeZone),
  });
}

export function useGoogleApply() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: GoogleApplyInput) => googleApi.apply(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["competition"] });
      qc.invalidateQueries({ queryKey: ["google"] });
    },
  });
}
