import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useFighter } from "@/context/FighterContext";
import { useLocalDay } from "@/hooks/useLocalDay";
import type { TodayView } from "@/lib/today";

export const TODAY_QUERY_KEY = ["today"] as const;

/** State, Today's Focus and readiness for the athlete's current local day. Refetched on focus and at midnight. */
export function useToday() {
  const { isSignedIn } = useAuth();
  const { fighter } = useFighter();
  const day = useLocalDay();
  return useQuery({
    queryKey: [...TODAY_QUERY_KEY, day],
    queryFn: () => apiGet<TodayView>("/today"),
    enabled: !!isSignedIn && !!fighter,
    staleTime: 0,
    refetchOnMount: "always",
  });
}
