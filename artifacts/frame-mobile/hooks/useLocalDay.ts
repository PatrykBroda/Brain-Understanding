import { useEffect, useState } from "react";
import { AppState } from "react-native";
import { localDateString, msUntilNextLocalMidnight } from "@/lib/localDay";

/**
 * The device's current local date. Updates at the athlete's midnight and whenever the
 * app returns to the foreground, so a screen left open overnight never keeps presenting
 * yesterday as today (queries are keyed on this).
 */
export function useLocalDay(): string {
  const [day, setDay] = useState(() => localDateString());
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const sync = () => setDay(localDateString());
    const arm = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        sync();
        arm();
      }, msUntilNextLocalMidnight() + 500);
    };
    arm();
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") {
        sync();
        arm();
      }
    });
    return () => {
      if (timer) clearTimeout(timer);
      sub.remove();
    };
  }, []);
  return day;
}
