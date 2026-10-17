import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { StyleSheet, View, type ImageSourcePropType, type ViewStyle } from "react-native";
import Svg, { Defs, RadialGradient, Rect, Stop } from "react-native-svg";

import { gradients } from "@/constants/theme";
import { PhotoBackdrop } from "./Backdrop";

/**
 * Screen backdrop: a graphite wash plus two blurred bronze/crimson glow fields
 * (radial SVG gradients — works on iOS, Android and web). Content goes inside.
 * `tone="red"` swaps the lower glow for crimson on warning screens.
 */
export function Screen({
  children,
  tone = "gold",
  photo,
  photoPosition,
  style,
}: {
  children: React.ReactNode;
  tone?: "gold" | "red";
  /** blurred FRAME photo behind the whole screen (imagery-led) */
  photo?: ImageSourcePropType;
  photoPosition?: string;
  style?: ViewStyle | ViewStyle[];
}) {
  const lower = tone === "red" ? "#BF1D1D" : "#8A6A2F";
  return (
    <View style={[styles.root, style as ViewStyle]}>
      <LinearGradient colors={gradients.screen} style={StyleSheet.absoluteFill} />
      <Svg style={StyleSheet.absoluteFill} pointerEvents="none" width="100%" height="100%">
        <Defs>
          <RadialGradient id="gTop" cx="85%" cy="-4%" rx="90%" ry="46%" fx="85%" fy="-4%">
            <Stop offset="0" stopColor="#C7A15A" stopOpacity={0.26} />
            <Stop offset="1" stopColor="#8A6A2F" stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id="gLow" cx="-8%" cy="104%" rx="85%" ry="42%" fx="-8%" fy="104%">
            <Stop offset="0" stopColor={lower} stopOpacity={0.22} />
            <Stop offset="1" stopColor={lower} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#gTop)" />
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#gLow)" />
      </Svg>
      {photo ? <PhotoBackdrop source={photo} position={photoPosition} /> : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#050505" },
});
