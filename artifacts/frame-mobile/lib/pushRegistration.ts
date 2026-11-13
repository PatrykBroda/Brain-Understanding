import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { apiDelete, apiGet, apiPost, apiPut } from "@/lib/api";
import { isValidExpoToken, type PushPrefs } from "@/lib/pushClientLogic";

const supported = Platform.OS === "ios" || Platform.OS === "android";

/**
 * Get this device's Expo push token and register it with the API. Only call once
 * notification permission is granted. Never throws: push is best-effort (it needs an
 * EAS project id and a build with push entitlements, so failures are expected in dev).
 */
export async function registerPushToken(): Promise<string | null> {
  if (!supported) return null;
  try {
    const perms = await Notifications.getPermissionsAsync();
    if (!perms.granted) return null;
    // Android 8+ needs a channel before any notification can show outside the app.
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "FRAME",
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }
    const projectId =
      (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId ??
      Constants.easConfig?.projectId;
    if (!projectId) console.warn("[push] no EAS projectId in this build; remote push cannot register");
    const res = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    if (!isValidExpoToken(res.data)) return null;
    await apiPost("/push/register", { token: res.data, platform: Platform.OS });
    return res.data;
  } catch (err) {
    console.warn("[push] token registration failed", err);
    return null;
  }
}

/** Forget this device's token server-side (sign-out). Best-effort. */
export async function unregisterPushToken(token: string): Promise<void> {
  try {
    await apiDelete(`/push/register`, { token });
  } catch {
    /* non-fatal */
  }
}

export const fetchPushPrefs = () => apiGet<PushPrefs>("/push/preferences");
export const savePushPrefs = (p: Partial<PushPrefs>) => apiPut<PushPrefs>("/push/preferences", p);
