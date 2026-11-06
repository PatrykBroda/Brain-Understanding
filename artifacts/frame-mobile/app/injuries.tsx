import { useRouter } from "expo-router";
import React from "react";
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useInjuries, useRemoveInjury } from "@/hooks/useInjuries";
import { areaLabel, groupByDay, severityLabel } from "@/lib/injuryLogic";
import { FONT, TEXT_PRIMARY, TEXT_SECONDARY, caption } from "@/constants/typography";

const ACCENT = "#8A6A2F";
const day = (d: string) =>
  new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });

export default function InjuriesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const q = useInjuries();
  const remove = useRemoveInjury();
  const groups = groupByDay(q.data?.injuries ?? []);
  const top = Platform.OS === "web" ? 20 : insets.top;

  return (
    <ScrollView
      style={s.root}
      contentContainerStyle={{ paddingTop: top + 12, paddingBottom: insets.bottom + 40, paddingHorizontal: 20, gap: 16 }}
    >
      <Pressable onPress={() => router.back()} hitSlop={10} accessibilityRole="button" accessibilityLabel="Back" style={{ minHeight: 44, minWidth: 44, justifyContent: "center" }}>
        <Feather name="chevron-left" size={22} color={TEXT_PRIMARY} />
      </Pressable>
      <Text style={s.title}>Injury log</Text>
      <Text style={s.caption}>
        Last 90 days. You log these in the daily check-in; FRAME uses them in chat and your Camp plan.
      </Text>

      {q.isLoading ? (
        <ActivityIndicator color={ACCENT} />
      ) : q.isError ? (
        <Text style={s.body}>Couldn't load your injury log. Check your connection and try again.</Text>
      ) : groups.length === 0 ? (
        <Text style={s.body}>Nothing logged. Add anything sore from the daily check-in on Home.</Text>
      ) : (
        groups.map((g) => (
          <View key={g.date} style={s.panel}>
            <Text style={s.caption}>{day(g.date)}</Text>
            {g.rows.map((r) => (
              <View key={r.id} style={s.row}>
                <View style={{ flex: 1 }}>
                  <Text style={s.rowText}>
                    {areaLabel(r.area)} · {severityLabel(r.severity).toLowerCase()}
                  </Text>
                  {r.note ? <Text style={s.rowMeta}>{r.note}</Text> : null}
                </View>
                <Pressable
                  onPress={() => remove.mutate(r.id)}
                  hitSlop={10}
                  style={{ minHeight: 44, minWidth: 44, alignItems: "center", justifyContent: "center" }}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${areaLabel(r.area)} entry`}
                >
                  <Feather name="x" size={18} color={TEXT_SECONDARY} />
                </Pressable>
              </View>
            ))}
          </View>
        ))
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#050505" },
  title: { fontFamily: FONT.medium, fontSize: 22, color: TEXT_PRIMARY },
  caption: { ...caption },
  body: { fontFamily: FONT.regular, fontSize: 15, lineHeight: 23, color: TEXT_SECONDARY },
  panel: { borderColor: "#222", borderWidth: 1, padding: 16, gap: 10 },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  rowText: { fontFamily: FONT.regular, fontSize: 15, color: TEXT_PRIMARY },
  rowMeta: { fontFamily: FONT.regular, fontSize: 13, color: TEXT_SECONDARY },
});
