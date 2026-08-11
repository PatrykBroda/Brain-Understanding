import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

export interface Entitlement {
  plan: "free" | "frame_plus";
  status: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
}

const BILLING_STATUS_KEY = ["billing", "status"] as const;

/** Current FRAME+ entitlement for the signed-in user (server-resolved). */
export function useEntitlement() {
  const { isSignedIn } = useAuth();
  return useQuery<Entitlement>({
    queryKey: BILLING_STATUS_KEY,
    queryFn: () => apiGet<Entitlement>("/billing/status"),
    enabled: !!isSignedIn,
    staleTime: 30_000,
  });
}

export function useIsFramePlus(): boolean {
  const { data } = useEntitlement();
  return data?.plan === "frame_plus";
}

/**
 * Reconcile the server entitlement after a purchase or restore. Hits
 * /billing/sync, which reads RevenueCat directly, so FRAME+ unlocks without
 * waiting for the webhook.
 */
export function useSyncBilling() {
  const qc = useQueryClient();
  return useMutation<Entitlement>({
    mutationFn: () => apiPost<Entitlement>("/billing/sync"),
    onSuccess: (data) => {
      qc.setQueryData(BILLING_STATUS_KEY, data);
    },
  });
}
