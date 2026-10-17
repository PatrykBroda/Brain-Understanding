import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { fonts, MIN_TAP, palette, radius } from "@/constants/theme";

/** Pill segmented control. Active pill is a bronze-edged glass chip. */
export function PillTabs<T extends string>({
  tabs,
  value,
  onChange,
  scroll = false,
}: {
  tabs: { key: T; label: string }[];
  value: T;
  onChange: (k: T) => void;
  scroll?: boolean;
}) {
  const row = tabs.map((t) => {
    const on = t.key === value;
    return (
      <Pressable
        key={t.key}
        accessibilityRole="tab"
        accessibilityState={{ selected: on }}
        onPress={() => onChange(t.key)}
        style={[styles.pill, on && styles.pillOn]}
      >
        <Text style={[styles.text, on && styles.textOn]}>{t.label}</Text>
      </Pressable>
    );
  });
  if (scroll) {
    return (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {row}
      </ScrollView>
    );
  }
  return <View style={styles.row}>{row}</View>;
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 8 },
  pill: {
    minHeight: MIN_TAP,
    paddingHorizontal: 20,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.glass,
    borderWidth: 1,
    borderColor: palette.hairline,
  },
  pillOn: { backgroundColor: palette.goldWash, borderColor: palette.goldHair },
  text: { fontFamily: fonts.textMedium, fontSize: 13, letterSpacing: 0.4, color: palette.textMid },
  textOn: { color: palette.goldPale },
});
