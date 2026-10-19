import React from "react";
import { StyleSheet, View, type ImageSourcePropType, type ViewStyle } from "react-native";

import { palette } from "@/constants/entryTheme";
import { Atmosphere, type LightFocus, type LightTone } from "./Atmosphere";

/**
 * Screen canvas: near-black #08090B plus ONE decorative atmospheric light
 * layer (see Atmosphere). Content goes inside. Use `light={null}` for screens
 * with long reading text (chat) or where a state visual carries the light.
 */
export function Screen({
  children,
  light = "silver",
  focus = "topRight",
  intensity = 1,
  style,
}: {
  children: React.ReactNode;
  /** tone of the single light layer; null = none */
  light?: LightTone | null;
  focus?: LightFocus;
  intensity?: number;
  style?: ViewStyle | ViewStyle[];
  /** @deprecated v3: photo backdrops behind app screens were removed */
  photo?: ImageSourcePropType;
  /** @deprecated v3 */
  photoPosition?: string;
  /** @deprecated v3 – use `light` */
  tone?: "gold" | "red";
}) {
  return (
    <View style={[styles.root, style as ViewStyle]}>
      {light ? <Atmosphere focus={focus} tone={light} intensity={intensity} /> : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.bg },
});
