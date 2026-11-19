import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";
import type { JuniorMe } from "@/lib/junior";

/** The coach's gym comes from their active staff rows (server data), never from the role preference. */
export function useCoachGym() {
  const me = useQuery({ queryKey: ["junior", "me"], queryFn: () => apiGet<JuniorMe>("/junior/me") });
  const staff = me.data?.staff?.[0] ?? null;
  return { gymId: staff?.gymId ?? null, gymName: staff?.gymName ?? null, staffRole: staff?.role ?? null, loading: me.isLoading, error: me.error };
}
