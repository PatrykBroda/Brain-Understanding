import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { todayApi } from "@/lib/api";
import { useFighter } from "@/hooks/use-fighter";
import { localDateString, msUntilNextLocalMidnight } from "@/lib/local-day";

export const TODAY_QUERY_KEY = ["today"] as const;

/**
 * The browser's current local date. Updates at the athlete's midnight and when the tab
 * comes back to the foreground, so a page left open overnight never keeps presenting
 * yesterday as today (queries are keyed on this).
 */
export function useLocalDay(): string {
  const [day, setDay] = useState(() => localDateString());
  useEffect(() => {
    let timer: number | undefined;
    const sync = () => setDay(localDateString());
    const arm = () => {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        sync();
        arm();
      }, msUntilNextLocalMidnight() + 500);
    };
    arm();
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        sync();
        arm();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      if (timer) window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, []);
  return day;
}

/** State, Today's Focus and readiness for the athlete's current local day. */
export function useToday() {
  const { data: fighterData } = useFighter();
  const day = useLocalDay();
  return useQuery({
    queryKey: [...TODAY_QUERY_KEY, day],
    queryFn: () => todayApi.get(),
    enabled: !!fighterData?.fighter,
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });
}
