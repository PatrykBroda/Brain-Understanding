import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import {
  RECAP_HOUR,
  RECAP_ID,
  RECAP_MINUTE,
  RECAP_NOTIFICATION,
  RECAP_WEEKDAY,
  parseRecapPrefs,
  type RecapPrefs,
} from "@/lib/recapLogic";

const key = (userId: string) => `frame.weeklyRecap.v1.${userId}`;
const supported = Platform.OS === "ios" || Platform.OS === "android";

export async function loadRecapPrefs(userId: string): Promise<RecapPrefs> {
  try {
    return parseRecapPrefs(await AsyncStorage.getItem(key(userId)));
  } catch {
    return parseRecapPrefs(null);
  }
}

export async function saveRecapPrefs(userId: string, prefs: RecapPrefs): Promise<void> {
  try {
    await AsyncStorage.setItem(key(userId), JSON.stringify(prefs));
  } catch {
    /* non-fatal */
  }
}

export async function cancelWeeklyRecap(): Promise<void> {
  if (!supported) return;
  await Notifications.cancelScheduledNotificationAsync(RECAP_ID).catch(() => null);
}

/** Schedule the single repeating Sunday-evening recap. Replaces any earlier one. */
export async function scheduleWeeklyRecap(): Promise<void> {
  if (!supported) return;
  await cancelWeeklyRecap();
  await Notifications.scheduleNotificationAsync({
    identifier: RECAP_ID,
    content: { ...RECAP_NOTIFICATION, data: { route: "recap" } },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
      weekday: RECAP_WEEKDAY,
      hour: RECAP_HOUR,
      minute: RECAP_MINUTE,
    },
  });
}

/**
 * Keep the schedule in line with the opt-out. Never prompts for permission: it only schedules when
 * the athlete has already allowed notifications (the daily-reminder opt-in asks for it).
 */
export async function syncWeeklyRecap(userId: string): Promise<void> {
  if (!supported) return;
  const prefs = await loadRecapPrefs(userId);
  if (!prefs.enabled) return cancelWeeklyRecap();
  const perm = await Notifications.getPermissionsAsync();
  if (perm.granted) await scheduleWeeklyRecap();
}
