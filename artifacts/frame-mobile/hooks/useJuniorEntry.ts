import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { apiGet } from "@/lib/api";
import { decideEntry, type JuniorEntry, type JuniorMe } from "@/lib/junior";

/**
 * Asks the server whether the Junior Portal pilot is on for this build and which role the user last used.
 * Any failure resolves to "athlete" so the existing app is never blocked by this feature.
 */
export function useJuniorEntry(): { entry: JuniorEntry; me: JuniorMe | undefined; refetch: () => void } {
  const { isLoaded, isSignedIn } = useAuth();
  const enabledQuery = isLoaded && isSignedIn;
  const config = useQuery<{ enabled: boolean }>({
    queryKey: ["junior", "config"],
    queryFn: () => apiGet<{ enabled: boolean }>("/junior/config"),
    enabled: enabledQuery,
    retry: false,
    staleTime: 5 * 60_000,
  });
  const me = useQuery<JuniorMe>({
    queryKey: ["junior", "me"],
    queryFn: () => apiGet<JuniorMe>("/junior/me"),
    enabled: enabledQuery && config.data?.enabled === true,
    retry: false,
  });
  const configFailed = config.isError;
  const entry = !enabledQuery
    ? "athlete"
    : me.isError && config.data?.enabled
      ? "athlete"
      : decideEntry(config.data ?? null, me.data ?? null, configFailed);
  return {
    entry,
    me: me.data,
    refetch: () => {
      void config.refetch();
      void me.refetch();
    },
  };
}
