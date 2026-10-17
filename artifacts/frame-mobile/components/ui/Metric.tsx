import React from "react";
import { StyleSheet, Text, View, type ViewStyle } from "react-native";

import { fonts, palette, type as T } from "@/constants/theme";

/**
 * A real product number: tabular value + sentence-case label (+ optional unit /
 * hint). Use only for values the app genuinely holds — no decorative numbers.
 * `value` null renders an em dash so empty data still looks intentional.
 */
export function Metric({
  label,
  value,
  unit,
  hint,
  size = "m",
  align = "left",
  style,
}: {
  label: string;
  value: string | number | null | undefined;
  unit?: string;
  hint?: string;
  size?: "l" | "m" | "s";
  align?: "left" | "center";
  style?: ViewStyle;
}) {
  const num = size === "l" ? T.numeralL : size === "s" ? T.numeralS : T.numeralM;
  const empty = value == null || value === "";
  return (
    <View
      accessible
      accessibilityLabel={`${label} ${empty ? "no data" : value}${unit ? " " + unit : ""}${hint ? ", " + hint : ""}`}
      style={[{ alignItems: align === "center" ? "center" : "flex-start" }, style]}
    >
      <Text style={styles.label}>{label}</Text>
      <View style={styles.row}>
        <Text style={[num as object, { color: empty ? palette.textLow : palette.textHi }]}>{empty ? "—" : String(value)}</Text>
        {unit && !empty ? <Text style={styles.unit}>{unit}</Text> : null}
      </View>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontFamily: fonts.medium, fontSize: 13, color: palette.textMid, marginBottom: 2 },
  row: { flexDirection: "row", alignItems: "baseline", gap: 4 },
  unit: { fontFamily: fonts.regular, fontSize: 14, color: palette.textMid },
  hint: { fontFamily: fonts.regular, fontSize: 12, color: palette.textLow, marginTop: 2 },
});
