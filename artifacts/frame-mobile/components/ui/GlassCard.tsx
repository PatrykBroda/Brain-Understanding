import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { Platform, StyleSheet, View, type ViewStyle } from "react-native";

import { gradients, palette, radius as R, shadow } from "@/constants/theme";

type Tone = "neutral" | "gold" | "red";

/**
 * Frosted-glass surface: translucent fill + diagonal sheen + 1px light edge
 * with a brighter top edge, big radius, deep soft shadow. `tone` tints the
 * sheen with the brand gold / crimson. Blur is real on native, fill-only on web.
 */
export function GlassCard({
  children,
  tone = "neutral",
  radius = R.lg,
  padding = 20,
  blur = false,
  style,
}: {
  children?: React.ReactNode;
  tone?: Tone;
  radius?: number;
  padding?: number;
  blur?: boolean;
  style?: ViewStyle | ViewStyle[];
}) {
  const sheen = tone === "gold" ? gradients.cardGold : tone === "red" ? gradients.cardRed : gradients.card;
  const edge = tone === "gold" ? palette.goldHair : tone === "red" ? "rgba(224,86,78,0.30)" : palette.glassEdge;
  return (
    <View style={[shadow.card, { borderRadius: radius }, style as ViewStyle]}>
      <View style={[styles.clip, { borderRadius: radius, borderColor: edge }]}>
        {blur && Platform.OS !== "web" ? (
          <BlurView intensity={50} tint="dark" style={StyleSheet.absoluteFill} />
        ) : null}
        <View
          style={[StyleSheet.absoluteFill, { backgroundColor: palette.graphite1, opacity: blur ? 0.4 : 0.86 }]}
        />
        <LinearGradient
          colors={sheen}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <View style={[styles.topEdge, { backgroundColor: palette.glassEdgeHi }]} pointerEvents="none" />
        <View style={{ padding }}>{children}</View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  clip: { overflow: "hidden", borderWidth: 1 },
  topEdge: { position: "absolute", top: 0, left: 24, right: 24, height: 1, opacity: 0.55 },
});
