import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { googleApi, type GoogleApplyInput } from "@/lib/api";

// The browser's IANA zone — sent so imported/exported wall-clock times are
// interpreted in the athlete's local time, not the server's.
export function localTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

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
      // Imported/exported sessions land in the camp tree; refresh both.
      qc.invalidateQueries({ queryKey: ["competition"] });
      qc.invalidateQueries({ queryKey: ["google"] });
    },
  });
}
