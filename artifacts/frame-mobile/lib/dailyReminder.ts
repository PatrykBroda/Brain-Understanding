import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import {
  CHECKIN_NOTIFICATION,
  REMINDER_ID,
  parseReminderState,
  type ReminderState,
} from "@/lib/reminderLogic";

const key = (userId: string) => `frame.dailyReminder.v1.${userId}`;
const supported = Platform.OS === "ios" || Platform.OS === "android";

export async function loadReminderState(userId: string): Promise<ReminderState> {
  try {
    return parseReminderState(await AsyncStorage.getItem(key(userId)));
  } catch {
    return parseReminderState(null);
  }
}

export async function saveReminderState(userId: string, state: ReminderState): Promise<void> {
  try {
    await AsyncStorage.setItem(key(userId), JSON.stringify(state));
  } catch {
    /* non-fatal: worst case the pop-up shows again */
  }
}

/** Show banners if a notification lands while the app is open. Call once at startup. */
export function configureNotificationHandler(): void {
  if (!supported) return;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

/** Ask for notification permission. Only ever called after the athlete opts in. */
export async function ensureNotificationPermission(): Promise<boolean> {
  if (!supported) return false;
  const cur = await Notifications.getPermissionsAsync();
  if (cur.granted) return true;
  if (!cur.canAskAgain) return false;
  const next = await Notifications.requestPermissionsAsync();
  return next.granted;
}

export async function cancelDailyReminder(): Promise<void> {
  if (!supported) return;
  await Notifications.cancelScheduledNotificationAsync(REMINDER_ID).catch(() => null);
}

/** (Re)schedule the single repeating daily reminder at the given local time. */
export async function scheduleDailyReminder(hour: number, minute: number): Promise<void> {
  if (!supported) return;
  await cancelDailyReminder();
  await Notifications.scheduleNotificationAsync({
    identifier: REMINDER_ID,
    content: { ...CHECKIN_NOTIFICATION, data: { route: "checkin" } },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour, minute },
  });
}
