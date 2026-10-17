import React from "react";
import { StyleSheet, Text, View, type ViewStyle } from "react-native";

import { fonts, palette, radius } from "@/constants/theme";

type Tone = "neutral" | "gold" | "red" | "ok";

const TONES: Record<Tone, { fg: string; bg: string; edge: string }> = {
  neutral: { fg: palette.textMid, bg: palette.raised, edge: palette.border },
  gold: { fg: palette.gold, bg: palette.goldWash, edge: palette.goldHair },
  red: { fg: palette.redText, bg: palette.redWash, edge: palette.redHair },
  ok: { fg: palette.ok, bg: "rgba(143,184,154,0.10)", edge: "rgba(143,184,154,0.28)" },
};

/**
 * Compact status / chip. ALWAYS carries a text label (never colour alone);
 * a leading dot repeats the tone. Pill shape is correct here.
 */
export function Status({ label, tone = "neutral", style }: { label: string; tone?: Tone; style?: ViewStyle }) {
  const t = TONES[tone];
  return (
    <View style={[styles.base, { backgroundColor: t.bg, borderColor: t.edge }, style]}>
      <View style={[styles.dot, { backgroundColor: t.fg }]} />
      <Text style={[styles.text, { color: t.fg }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  text: { fontFamily: fonts.medium, fontSize: 12, lineHeight: 16 },
});
