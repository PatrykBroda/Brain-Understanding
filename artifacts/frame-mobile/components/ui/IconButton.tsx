import { Feather } from "@expo/vector-icons";
import React from "react";
import { Pressable, StyleSheet, type ViewStyle } from "react-native";

import { MIN_TAP, palette, radius } from "@/constants/theme";
import { haptic } from "./haptics";

/** Square-ish icon button (>=44pt, radius 14). `solid` = gold fill (the one primary icon action). Feather icons only. */
export function IconButton({
  icon,
  onPress,
  label,
  solid = false,
  size = MIN_TAP,
  disabled,
  style,
}: {
  icon: React.ComponentProps<typeof Feather>["name"];
  onPress?: () => void;
  label: string;
  solid?: boolean;
  size?: number;
  disabled?: boolean;
  style?: ViewStyle;
}) {
  const dim = Math.max(size, MIN_TAP);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={() => {
        haptic.select();
        onPress?.();
      }}
      hitSlop={6}
      style={({ pressed }) => [
        styles.base,
        { width: dim, height: dim, borderRadius: radius.md },
        solid
          ? { backgroundColor: pressed ? palette.goldPressed : palette.gold }
          : {
              backgroundColor: pressed ? palette.overlay : palette.raised,
              borderWidth: 1,
              borderColor: palette.border,
            },
        disabled && { opacity: 0.4 },
        pressed && { transform: [{ scale: 0.97 }] },
        style,
      ]}
    >
      <Feather name={icon} size={20} color={solid ? palette.onGold : palette.textHi} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: "center", justifyContent: "center" },
});
