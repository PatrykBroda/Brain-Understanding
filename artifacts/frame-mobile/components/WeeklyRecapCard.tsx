import React, { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useAuth } from "@/context/AuthContext";
import { useTodayCheckin, useWeeklyRecap } from "@/hooks/useCheckin";
import { useLocalDay } from "@/hooks/useLocalDay";
import { loadRecapPrefs, saveRecapPrefs } from "@/lib/weeklyRecap";
import {
  recapLines,
  shouldShowRecapCard,
  streakLabel,
  weekKey,
  type RecapPrefs,
} from "@/lib/recapLogic";
import { FONT, TEXT_SECONDARY, label } from "@/constants/typography";

const ACCENT = "#8A6A2F";

/** One line under the check-in: consecutive-day streak. Renders nothing until the server answers. */
export function StreakLine() {
  const { data } = useTodayCheckin();
  const text = streakLabel(data?.streak);
  if (!text) return null;
  return <Text style={s.streak}>{text}</Text>;
}

/** Sunday/Monday weekly recap card (or any day when opened from the recap notification). */
export function WeeklyRecapCard({ focus, forced }: { focus: string | null; forced?: boolean }) {
  const { userId } = useAuth();
  const day = useLocalDay();
  const [prefs, setPrefs] = useState<RecapPrefs | null>(null);

  useEffect(() => {
    if (userId) void loadRecapPrefs(userId).then(setPrefs);
  }, [userId]);

  const visible = !!prefs && (forced ? prefs.enabled : shouldShowRecapCard(prefs, day));
  const recap = useWeeklyRecap(visible);

  const dismiss = useCallback(async () => {
    if (!userId || !prefs) return;
    const next = { ...prefs, dismissedFor: weekKey(day) };
    setPrefs(next);
    await saveRecapPrefs(userId, next);
  }, [userId, prefs, day]);

  if (!visible || !recap.data) return null;
  const lines = recapLines(recap.data.recap, focus);
  return (
    <View style={s.card} accessibilityLabel="Weekly recap">
      <Text style={s.title}>Your week in FRAME</Text>
      {lines.map((l) => (
        <Text key={l} style={s.line}>{l}</Text>
      ))}
      <Pressable onPress={() => void dismiss()} hitSlop={8} accessibilityRole="button">
        <Text style={s.dismiss}>Dismiss</Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  streak: { fontFamily: FONT.regular, fontSize: 13, color: ACCENT, marginTop: 8 },
  card: { borderWidth: 1, borderColor: ACCENT, borderRadius: 14, padding: 16, gap: 6, backgroundColor: "#111" },
  title: { ...label, color: "#e0e0e0", marginBottom: 4 },
  line: { fontFamily: "Outfit", fontSize: 14, color: TEXT_SECONDARY },
  dismiss: { fontFamily: "Outfit", fontSize: 13, color: ACCENT, marginTop: 8 },
});
