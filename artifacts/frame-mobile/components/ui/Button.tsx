import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, type ViewStyle } from "react-native";

import { fonts, MIN_TAP, palette, radius } from "@/constants/theme";
import { haptic } from "./haptics";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "glass";

/**
 * Rectangular button (radius 14 — pills are for chips only), 52pt tall.
 * primary   solid muted gold, dark foreground (8.9:1)         — THE next action, one per screen
 * secondary raised surface + 1px border, off-white label
 * ghost     no fill, secondary text (tertiary actions)
 * danger    red wash + red text + red hairline
 * States: default · pressed (darker fill / 0.98 scale) · disabled (flat, 40%) · loading (spinner, locked).
 * `glass` is the legacy name for secondary.
 */
export function Button({
  title,
  onPress,
  variant = "primary",
  disabled,
  loading,
  style,
  accessibilityLabel,
  quiet,
}: {
  title: string;
  onPress?: () => void;
  variant?: Variant;
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle | ViewStyle[];
  accessibilityLabel?: string;
  /** skip the haptic */
  quiet?: boolean;
}) {
  const off = disabled || loading;
  const v: Exclude<Variant, "glass"> = variant === "glass" ? "secondary" : variant;
  const fg =
    v === "primary" ? palette.onGold : v === "danger" ? palette.redText : v === "ghost" ? palette.textMid : palette.textHi;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: !!off, busy: !!loading }}
      disabled={off}
      onPress={() => {
        if (!quiet) haptic.press();
        onPress?.();
      }}
      style={({ pressed }) => [
        styles.base,
        v === "primary" && { backgroundColor: pressed ? palette.goldPressed : palette.gold },
        v === "secondary" && {
          backgroundColor: pressed ? palette.overlay : palette.raised,
          borderWidth: 1,
          borderColor: palette.borderStrong,
        },
        v === "danger" && { backgroundColor: palette.redWash, borderWidth: 1, borderColor: palette.redHair },
        v === "ghost" && { backgroundColor: pressed ? palette.glass : "transparent" },
        off && !loading && { opacity: 0.4 },
        pressed && { transform: [{ scale: 0.985 }] },
        style as ViewStyle,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <Text style={[styles.text, { color: fg }]} numberOfLines={1}>
          {title}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 52,
    paddingHorizontal: 24,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    minWidth: MIN_TAP,
  },
  text: { fontFamily: fonts.semi, fontSize: 16, letterSpacing: -0.1 },
});
