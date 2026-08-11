import { useQuery, useQueryClient } from "@tanstack/react-query";
import { billingApi, type BillingStatus } from "@/lib/api";

export const BILLING_STATUS_KEY = ["billing", "status"] as const;

/**
 * Read-only FRAME+ status for the web dashboard. Subscriptions are sold and
 * managed exclusively through Apple In-App Purchase in the iOS app, so the web
 * side only reflects the server-resolved entitlement — it never starts a
 * checkout or opens a billing portal.
 */
export function useSubscription() {
  const qc = useQueryClient();

  const statusQuery = useQuery<BillingStatus>({
    queryKey: BILLING_STATUS_KEY,
    queryFn: () => billingApi.status(),
    staleTime: 30_000,
  });

  return {
    status: statusQuery.data ?? null,
    isLoading: statusQuery.isLoading,
    isFramePlus: statusQuery.data?.plan === "frame_plus",
    refetchStatus: () => qc.invalidateQueries({ queryKey: ["billing"] }),
  };
}
