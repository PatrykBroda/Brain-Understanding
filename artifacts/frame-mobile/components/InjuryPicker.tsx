import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useInjuries, useLogInjury, useRemoveInjury } from "@/hooks/useInjuries";
import { INJURY_AREAS, nextSeverity, severityLabel, todayByArea } from "@/lib/injuryLogic";
import { FONT, TEXT_PRIMARY, TEXT_SECONDARY } from "@/constants/typography";

const ACCENT = "#8A6A2F";
const SEV_COLOR: Record<number, string> = { 1: "#8A6A2F", 2: "#c08a3a", 3: "#b5523b" };

/** One-tap injury / soreness chips for the daily check-in. Each tap cycles niggle, sore, injured, off and saves at once. */
export function InjuryPicker() {
  const router = useRouter();
  const q = useInjuries();
  const log = useLogInjury();
  const remove = useRemoveInjury();
  const today = q.data?.today;
  const byArea = today ? todayByArea(q.data?.injuries ?? [], today) : {};
  const busy = log.isPending || remove.isPending;

  const tap = (area: string) => {
    if (busy) return;
    const cur = byArea[area];
    const next = nextSeverity(cur?.severity);
    if (next == null && cur) remove.mutate(cur.id);
    else if (next != null) log.mutate({ area, severity: next });
  };

  return (
    <View style={s.wrap}>
      <Text style={s.label}>Anything sore or injured? (optional)</Text>
      <Text style={s.hint}>Tap an area: niggle, sore, injured, then clear. FRAME works around it.</Text>
      <View style={s.chips}>
        {INJURY_AREAS.map((a) => {
          const cur = byArea[a.key];
          return (
            <Pressable
              key={a.key}
              onPress={() => tap(a.key)}
              accessibilityRole="button"
              accessibilityLabel={`${a.label}${cur ? `, ${severityLabel(cur.severity)}` : ""}`}
              style={[s.chip, cur && { borderColor: SEV_COLOR[cur.severity] ?? ACCENT }]}
            >
              <Text style={[s.chipText, cur && { color: TEXT_PRIMARY }]}>
                {a.label}
                {cur ? ` · ${severityLabel(cur.severity).toLowerCase()}` : ""}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {log.isError || remove.isError ? <Text style={s.err}>Couldn't save that. Try again.</Text> : null}
      <Pressable onPress={() => router.push("/injuries")} hitSlop={8} accessibilityRole="button">
        <Text style={s.link}>View injury history →</Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { gap: 8 },
  label: { fontFamily: FONT.medium, fontSize: 14, color: TEXT_PRIMARY },
  hint: { fontFamily: FONT.regular, fontSize: 12, color: TEXT_SECONDARY },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { borderColor: "#222", borderWidth: 1, paddingVertical: 8, paddingHorizontal: 12, minHeight: 44, justifyContent: "center" },
  chipText: { fontFamily: FONT.regular, fontSize: 13, color: TEXT_SECONDARY },
  err: { fontFamily: FONT.regular, fontSize: 12, color: "#b5523b" },
  link: { fontFamily: FONT.regular, fontSize: 13, color: "#d9bc84", paddingVertical: 14 },
});
