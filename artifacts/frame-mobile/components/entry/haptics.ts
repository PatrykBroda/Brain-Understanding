import * as Haptics from "expo-haptics";
import { Platform } from "react-native";

const on = Platform.OS === "ios" || Platform.OS === "android";

/** Haptics for MEANINGFUL actions only (primary press, selection, success, error). No-op on web. */
export const haptic = {
  /** light tap: selecting a chip/tab, toggling */
  select: () => {
    if (on) void Haptics.selectionAsync().catch(() => undefined);
  },
  /** primary action committed */
  press: () => {
    if (on) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
  },
  success: () => {
    if (on) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
  },
  error: () => {
    if (on) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => undefined);
  },
};
