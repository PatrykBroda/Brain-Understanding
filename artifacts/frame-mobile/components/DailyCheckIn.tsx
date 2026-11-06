import React, { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Linking, Modal, Platform, Pressable, StyleSheet, Switch, Text, View } from "react-native";
import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useAuth } from "@/context/AuthContext";
import { localDateString } from "@/lib/localDay";
import {
  cancelDailyReminder,
  configureNotificationHandler,
  ensureNotificationPermission,
  loadReminderState,
  saveReminderState,
  scheduleDailyReminder,
} from "@/lib/dailyReminder";
import {
  DAILY_CHECKIN_PROMPT,
  formatTime,
  isCheckinTap,
  popupToShow,
  shiftTime,
  withFirstSeen,
  type PopupKind,
  type ReminderState,
} from "@/lib/reminderLogic";
import { FONT, TEXT_SECONDARY, label } from "@/constants/typography";

const ACCENT = "#8A6A2F";
const native = Platform.OS === "ios" || Platform.OS === "android";

/** Open the chat tab with the check-in prompt pre-filled (nonce forces re-apply on repeat taps). */
function useOpenCheckIn() {
  const router = useRouter();
  return useCallback(() => {
    router.push({
      pathname: "/(tabs)/chat",
      params: { prefill: DAILY_CHECKIN_PROMPT, n: String(Date.now()) },
    });
  }, [router]);
}

/**
 * Mounted inside the signed-in tab layout (so it never shows over auth, onboarding or the
 * paywall). Shows the once-a-day check-in pop-up and routes notification taps to chat.
 */
export function DailyCheckInGate() {
  const { userId, isSignedIn } = useAuth();
  const openCheckIn = useOpenCheckIn();
  const [kind, setKind] = useState<PopupKind | null>(null);
  const stateRef = useRef<ReminderState | null>(null);

  useEffect(() => {
    configureNotificationHandler();
  }, []);

  // Decide on the pop-up once per signed-in session open.
  useEffect(() => {
    if (!userId || !isSignedIn) return;
    let live = true;
    (async () => {
      const today = localDateString();
      const state = withFirstSeen(await loadReminderState(userId), today);
      stateRef.current = state;
      const k = popupToShow(state, today, true);
      if (k && live) {
        const next = { ...state, lastPopup: today };
        stateRef.current = next;
        setKind(k);
        await saveReminderState(userId, next);
      } else {
        await saveReminderState(userId, state);
      }
    })();
    return () => {
      live = false;
    };
  }, [userId, isSignedIn]);

  // Notification tap (warm or cold start) -> chat with the check-in prefilled.
  useEffect(() => {
    if (!native || !isSignedIn) return;
    const handle = (r: Notifications.NotificationResponse | null) => {
      if (r && isCheckinTap(r.notification.request.content.data)) openCheckIn();
    };
    const sub = Notifications.addNotificationResponseReceivedListener(handle);
    void Notifications.getLastNotificationResponseAsync().then((r) => {
      if (r && r.actionIdentifier === Notifications.DEFAULT_ACTION_IDENTIFIER) handle(r);
    });
    return () => sub.remove();
  }, [isSignedIn, openCheckIn]);

  const update = async (patch: Partial<ReminderState>) => {
    if (!userId || !stateRef.current) return;
    stateRef.current = { ...stateRef.current, ...patch };
    await saveReminderState(userId, stateRef.current);
  };

  const checkIn = async (remind: boolean) => {
    setKind(null);
    if (remind && native) {
      const st = stateRef.current;
      if (st && (await ensureNotificationPermission())) {
        await scheduleDailyReminder(st.hour, st.minute);
        await update({ enabled: true });
      } else {
        await update({ declinedOffer: true });
      }
    }
    openCheckIn();
  };

  const dismiss = async () => {
    setKind(null);
    if (kind === "checkin-with-offer") await update({ declinedOffer: true });
  };

  if (!kind) return null;
  const offer = kind === "checkin-with-offer" && native;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => void dismiss()}>
      <View style={s.backdrop}>
        <View style={s.sheet}>
          <Text style={s.title}>Daily check-in</Text>
          <Text style={s.body}>
            How are you showing up today? A quick check-in keeps your athlete model current.
          </Text>
          <Pressable style={s.primary} onPress={() => void checkIn(false)} accessibilityRole="button">
            <Text style={s.primaryText}>Check in now</Text>
          </Pressable>
          {offer ? (
            <Pressable style={s.secondary} onPress={() => void checkIn(true)} accessibilityRole="button">
              <Text style={s.secondaryText}>Check in and remind me daily</Text>
            </Pressable>
          ) : null}
          <Pressable style={s.dismiss} onPress={() => void dismiss()} accessibilityRole="button">
            <Text style={s.dismissText}>Not now</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

/** Settings row: reminder switch + time stepper. Permission is requested when switched on. */
export function DailyReminderSettings() {
  const { userId } = useAuth();
  const [state, setState] = useState<ReminderState | null>(null);

  useEffect(() => {
    if (!userId) return;
    void loadReminderState(userId).then(setState);
  }, [userId]);

  if (!native || !userId || !state) return null;

  const persist = async (next: ReminderState) => {
    setState(next);
    await saveReminderState(userId, next);
  };

  const toggle = async (on: boolean) => {
    if (!on) {
      await cancelDailyReminder();
      await persist({ ...state, enabled: false });
      return;
    }
    if (!(await ensureNotificationPermission())) {
      Alert.alert(
        "Notifications are off",
        "Allow notifications for FRAME in Settings to get a daily check-in reminder.",
        [{ text: "Cancel", style: "cancel" }, { text: "Open Settings", onPress: () => void Linking.openSettings() }],
      );
      return;
    }
    await scheduleDailyReminder(state.hour, state.minute);
    await persist({ ...state, enabled: true, declinedOffer: false });
  };

  const step = async (delta: number) => {
    const t = shiftTime(state.hour, state.minute, delta);
    const next = { ...state, ...t };
    if (state.enabled) await scheduleDailyReminder(t.hour, t.minute);
    await persist(next);
  };

  return (
    <View style={s.settings}>
      <View style={s.row}>
        <View style={{ flex: 1 }}>
          <Text style={s.settingsTitle}>Daily check-in reminder</Text>
          <Text style={s.settingsSub}>A notification asking how today went.</Text>
        </View>
        <Switch
          value={state.enabled}
          onValueChange={(v) => void toggle(v)}
          trackColor={{ true: ACCENT, false: "#222" }}
          accessibilityLabel="Daily check-in reminder"
        />
      </View>
      {state.enabled ? (
        <View style={s.row}>
          <Text style={s.settingsSub}>Remind me at</Text>
          <View style={s.stepper}>
            <Pressable onPress={() => void step(-15)} hitSlop={10} accessibilityLabel="Earlier by 15 minutes">
              <Feather name="minus" size={16} color={ACCENT} />
            </Pressable>
            <Text style={s.time}>{formatTime(state.hour, state.minute)}</Text>
            <Pressable onPress={() => void step(15)} hitSlop={10} accessibilityLabel="Later by 15 minutes">
              <Feather name="plus" size={16} color={ACCENT} />
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
  },
  sheet: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: "#0c0c0c",
    borderWidth: 1,
    borderColor: "rgba(138,106,47,0.35)",
    padding: 20,
  },
  title: { fontFamily: FONT.regular, fontSize: 16, color: "#e8e8e8", marginBottom: 8 },
  body: { fontFamily: "Outfit", fontSize: 15, lineHeight: 22, color: "#c0c0c0", marginBottom: 18 },
  primary: { borderWidth: 1, borderColor: ACCENT, paddingVertical: 12, alignItems: "center" },
  primaryText: { ...label, color: ACCENT },
  secondary: { marginTop: 10, paddingVertical: 10, alignItems: "center" },
  secondaryText: { ...label, color: "#B8903F" },
  dismiss: { marginTop: 6, paddingVertical: 8, alignItems: "center" },
  dismissText: { ...label, color: TEXT_SECONDARY },
  settings: { marginTop: 4, marginBottom: 18, gap: 12 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  settingsTitle: { fontFamily: "Outfit", fontSize: 15, color: "#e0e0e0" },
  settingsSub: { fontFamily: "Outfit", fontSize: 13, color: TEXT_SECONDARY },
  stepper: { flexDirection: "row", alignItems: "center", gap: 14 },
  time: { fontFamily: FONT.regular, fontSize: 15, color: "#e0e0e0", minWidth: 48, textAlign: "center" },
});
