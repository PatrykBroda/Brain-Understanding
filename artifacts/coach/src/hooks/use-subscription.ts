import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { billingApi, type BillingStatus } from "@/lib/api";

export const BILLING_STATUS_KEY = ["billing", "status"] as const;

export function useSubscription() {
  const qc = useQueryClient();

  const statusQuery = useQuery<BillingStatus>({
    queryKey: BILLING_STATUS_KEY,
    queryFn: () => billingApi.status(),
    staleTime: 30_000,
  });

  const checkoutMutation = useMutation({
    mutationFn: () => billingApi.checkout(),
    onSuccess: ({ url }) => {
      window.location.href = url;
    },
  });

  const portalMutation = useMutation({
    mutationFn: () => billingApi.portal(),
    onSuccess: ({ url }) => {
      window.location.href = url;
    },
  });

  const confirmMutation = useMutation({
    mutationFn: (sessionId: string) => billingApi.confirm(sessionId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["billing"] });
    },
  });

  return {
    status: statusQuery.data ?? null,
    isLoading: statusQuery.isLoading,
    isFramePlus: statusQuery.data?.plan === "frame_plus",
    priceLabel: formatPrice(statusQuery.data?.price ?? null),
    startCheckout: () => checkoutMutation.mutate(),
    checkoutPending: checkoutMutation.isPending,
    checkoutError: checkoutMutation.error,
    openPortal: () => portalMutation.mutate(),
    portalPending: portalMutation.isPending,
    confirm: confirmMutation.mutateAsync,
    confirmPending: confirmMutation.isPending,
    refetchStatus: () => qc.invalidateQueries({ queryKey: ["billing"] }),
  };
}

function formatPrice(
  price: { unitAmount: number; currency: string } | null,
): string {
  if (!price) return "";
  try {
    const formatted = new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: price.currency.toUpperCase(),
    }).format(price.unitAmount / 100);
    return `${formatted}/month`;
  } catch {
    return `${(price.unitAmount / 100).toFixed(2)} ${price.currency.toUpperCase()}/month`;
  }
}
