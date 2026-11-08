import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import { reminderContentFor, type CampInput } from "@/lib/campPhases";
import {
  CHECKIN_NOTIFICATION,
  REMINDER_ID,
  parseReminderState,
  type ReminderState,
} from "@/lib/reminderLogic";

const key = (userId: string) => `frame.dailyReminder.v1.${userId}`;
// The live camp countdown, set from Home. Reminder text follows the camp phase.
let campInput: CampInput | null = null;

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

/**
 * Record today's camp countdown (null when there is no camp) and, if the athlete has the
 * reminder on, reschedule it so the text matches the phase. Safe to call on every Home render.
 */
export async function syncReminderWithCamp(userId: string, camp: CampInput | null): Promise<void> {
  const same = campInput?.daysToEvent === camp?.daysToEvent && campInput?.daysToWeighIn === camp?.daysToWeighIn;
  campInput = camp;
  if (same || !supported) return;
  const st = await loadReminderState(userId);
  if (st.enabled) await scheduleDailyReminder(st.hour, st.minute);
}

/** (Re)schedule the single repeating daily reminder at the given local time. */
export async function scheduleDailyReminder(hour: number, minute: number): Promise<void> {
  if (!supported) return;
  await cancelDailyReminder();
  await Notifications.scheduleNotificationAsync({
    identifier: REMINDER_ID,
    content: { ...reminderContentFor(campInput, CHECKIN_NOTIFICATION), data: { route: "checkin" } },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour, minute },
  });
}
