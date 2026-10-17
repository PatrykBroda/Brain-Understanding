import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { fonts, palette } from "@/constants/theme";

/** Fact confidence (1-5): a thin bar plus a text label, never colour alone. */
export function FactConfidence({ value }: { value: number }) {
  const v = Math.max(0, Math.min(5, value));
  const word = v >= 4 ? "High" : v === 3 ? "Medium" : "Low";
  return (
    <View style={s.wrap} accessible accessibilityLabel={`Confidence ${word}, ${v} of 5`}>
      <View style={s.track}>
        <View style={[s.fill, { width: `${(v / 5) * 100}%` }]} />
      </View>
      <Text style={s.word}>{word}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flexDirection: "row", alignItems: "center", gap: 8 },
  track: { width: 44, height: 4, borderRadius: 2, backgroundColor: palette.borderStrong, overflow: "hidden" },
  fill: { height: 4, borderRadius: 2, backgroundColor: palette.gold },
  word: { fontFamily: fonts.medium, fontSize: 12, color: palette.textMid, width: 48 },
});
