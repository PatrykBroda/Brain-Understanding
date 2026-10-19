import React from "react";
import { StyleSheet, Text, View } from "react-native";

/** Fact confidence (1-5): five small pips plus an "n/5" count (original Profile idiom). */
export function FactConfidence({ value }: { value: number }) {
  const v = Math.max(0, Math.min(5, value));
  return (
    <View style={cd.wrap} accessible accessibilityLabel={`Confidence ${v} of 5`}>
      <View style={cd.row}>
        {[1, 2, 3, 4, 5].map((i) => (
          <View key={i} style={[cd.pip, i <= v ? cd.active : cd.inactive]} />
        ))}
      </View>
      <Text style={cd.count}>{v}/5</Text>
    </View>
  );
}

const cd = StyleSheet.create({
  wrap: { flexDirection: "row", alignItems: "center", gap: 6 },
  row: { flexDirection: "row", gap: 3 },
  pip: { width: 3, height: 9 },
  active: { backgroundColor: "#d29a4d" },
  inactive: { backgroundColor: "rgba(255,255,255,0.1)" },
  count: { fontFamily: "SpaceMono", fontSize: 8, letterSpacing: 1.5, color: "rgba(255,255,255,0.4)" },
});
