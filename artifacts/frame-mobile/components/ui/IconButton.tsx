import { Feather } from "@expo/vector-icons";
import React from "react";
import { Pressable, StyleSheet, type ViewStyle } from "react-native";

import { MIN_TAP, palette, shadow } from "@/constants/theme";

/** Round icon button (>=44pt). `solid` = the round-disc-with-arrow look from the reference, in bronze. */
export function IconButton({
  icon,
  onPress,
  label,
  solid = false,
  size = MIN_TAP,
  style,
}: {
  icon: React.ComponentProps<typeof Feather>["name"];
  onPress?: () => void;
  label: string;
  solid?: boolean;
  size?: number;
  style?: ViewStyle;
}) {
  const dim = Math.max(size, MIN_TAP);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [
        styles.base,
        { width: dim, height: dim, borderRadius: dim / 2 },
        solid ? [styles.solid, shadow.glow] : styles.ghost,
        pressed && { opacity: 0.8, transform: [{ scale: 0.96 }] },
        style,
      ]}
    >
      <Feather name={icon} size={18} color={solid ? "#050505" : palette.text} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: "center", justifyContent: "center" },
  solid: { backgroundColor: "#B38F4B" },
  ghost: { backgroundColor: palette.glassStrong, borderWidth: 1, borderColor: palette.glassEdge },
});
