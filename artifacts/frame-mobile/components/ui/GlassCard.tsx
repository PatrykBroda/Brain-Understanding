import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { StyleSheet, View, type ViewStyle } from "react-native";

import { gradients, palette, radius as R } from "@/constants/theme";

type Tone = "neutral" | "gold" | "red";

/**
 * Standard content surface. SOLID and readable (no blur, no glass): a surface
 * brightness step (#111316, or raised #191C20), a 1px white-8% border, a very
 * slight tonal gradient and a faint top-edge highlight. Radius 18 (cards 16–20).
 * `tone` only changes the border/tint for gold (selected/key) or red (warning).
 * Named GlassCard for import compatibility; also exported as `Card`.
 */
export function GlassCard({
  children,
  tone = "neutral",
  radius = R.lg,
  padding = 20,
  raised = false,
  style,
}: {
  children?: React.ReactNode;
  tone?: Tone;
  radius?: number;
  padding?: number;
  raised?: boolean;
  style?: ViewStyle | ViewStyle[];
  /** @deprecated v3: blur is for nav/overlays only; ignored */
  blur?: boolean;
}) {
  const wash = tone === "gold" ? gradients.cardGold : tone === "red" ? gradients.cardRed : null;
  const edge = tone === "gold" ? palette.goldHair : tone === "red" ? palette.redHair : palette.border;
  const base = raised ? gradients.cardRaised : gradients.card;
  return (
    <View style={[{ borderRadius: radius }, style as ViewStyle]}>
      <View
        style={[
          styles.clip,
          { borderRadius: radius, borderColor: edge, backgroundColor: raised ? palette.raised : palette.surface },
        ]}
      >
        <LinearGradient colors={base} style={StyleSheet.absoluteFill} pointerEvents="none" />
        {wash ? <LinearGradient colors={wash} style={StyleSheet.absoluteFill} pointerEvents="none" /> : null}
        <View style={styles.topEdge} pointerEvents="none" />
        <View style={{ padding }}>{children}</View>
      </View>
    </View>
  );
}

export const Card = GlassCard;

const styles = StyleSheet.create({
  clip: { overflow: "hidden", borderWidth: 1 },
  topEdge: { position: "absolute", top: 0, left: 0, right: 0, height: 1, backgroundColor: palette.highlight },
});
