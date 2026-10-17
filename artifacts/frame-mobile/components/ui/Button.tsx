import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, type ViewStyle } from "react-native";

import { fonts, gradients, MIN_TAP, palette, radius, shadow } from "@/constants/theme";

/** Pill button. primary = bronze gradient · glass = frosted outline · danger = crimson. */
export function Button({
  title,
  onPress,
  variant = "primary",
  disabled,
  loading,
  style,
  accessibilityLabel,
}: {
  title: string;
  onPress?: () => void;
  variant?: "primary" | "glass" | "danger";
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle | ViewStyle[];
  accessibilityLabel?: string;
}) {
  const off = disabled || loading;
  const primary = variant === "primary";
  const fg = primary ? "#0a0806" : variant === "danger" ? palette.redLight : palette.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: !!off, busy: !!loading }}
      disabled={off}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        primary && shadow.glow,
        variant === "glass" && styles.glass,
        variant === "danger" && styles.danger,
        off && { opacity: 0.45 },
        pressed && { transform: [{ scale: 0.98 }], opacity: 0.9 },
        style as ViewStyle,
      ]}
    >
      {primary ? (
        <LinearGradient
          colors={gradients.goldButton}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[StyleSheet.absoluteFill, { borderRadius: radius.pill }]}
        />
      ) : null}
      {loading ? <ActivityIndicator color={fg} /> : <Text style={[styles.text, { color: fg }]}>{title}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 52,
    paddingHorizontal: 28,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    minWidth: MIN_TAP,
  },
  glass: { backgroundColor: palette.glassStrong, borderWidth: 1, borderColor: palette.glassEdge },
  danger: { backgroundColor: palette.redWash, borderWidth: 1, borderColor: "rgba(224,86,78,0.35)" },
  text: { fontFamily: fonts.textMedium, fontSize: 14, letterSpacing: 1.2, textTransform: "uppercase" },
});
