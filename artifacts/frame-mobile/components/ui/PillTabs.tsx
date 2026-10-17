import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { fonts, MIN_TAP, palette, radius } from "@/constants/theme";
import { haptic } from "./haptics";

/** Filter / segment chips (pills are allowed here). Selected = raised surface, off-white text, stronger border. */
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
        onPress={() => {
          if (!on) haptic.select();
          onChange(t.key);
        }}
        style={({ pressed }) => [styles.pill, on && styles.pillOn, pressed && !on && { backgroundColor: palette.raised }]}
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
    paddingHorizontal: 18,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
  },
  pillOn: { backgroundColor: palette.raised, borderColor: palette.goldHair },
  text: { fontFamily: fonts.medium, fontSize: 14, color: palette.textMid },
  textOn: { color: palette.textHi },
});
