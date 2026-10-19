import React, { useEffect } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  cancelAnimation,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import { Screen } from "@/components/ui";
import { FrameLogo } from "@/components/FrameLogo";
import { fonts, palette } from "@/constants/theme";

/**
 * Branded boot / loading surface: logo, wordmark, a short sentence-case status
 * and a thin indeterminate track. Shares the #08090B base so there is no flash
 * against the native splash. Reduced motion = static bar.
 */

const TRACK_WIDTH = 120;
const BAR_WIDTH = 40;

export function BootLoader({ label = "Starting up" }: { label?: string }) {
  const reduced = useReducedMotion();
  const t = useSharedValue(0);
  useEffect(() => {
    if (reduced) return;
    t.value = withRepeat(withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.ease) }), -1, false);
    return () => cancelAnimation(t);
  }, [t, reduced]);

  const barStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: reduced ? (TRACK_WIDTH - BAR_WIDTH) / 2 : interpolate(t.value, [0, 1], [-BAR_WIDTH, TRACK_WIDTH]) }],
  }));

  return (
    <Screen light="silver" focus="center" intensity={0.7}>
      <View style={s.root} accessible accessibilityRole="progressbar" accessibilityLabel={label}>
        <Image source={require("../assets/images/frame-logo.png")} style={s.logo} resizeMode="contain" />
        <View style={s.wordmark}><FrameLogo height={16} /></View>
        <Text style={s.label}>{label}</Text>
        <View style={s.track}>
          <Animated.View style={[s.bar, barStyle]} />
        </View>
      </View>
    </Screen>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, alignItems: "center", justifyContent: "center" },
  logo: { width: 56, height: 56, marginBottom: 14 },
  wordmark: { marginBottom: 24 },
  label: { fontFamily: fonts.medium, fontSize: 14, color: palette.textMid, marginBottom: 16 },
  track: {
    width: TRACK_WIDTH,
    height: 2,
    borderRadius: 1,
    backgroundColor: palette.border,
    overflow: "hidden",
  },
  bar: { width: BAR_WIDTH, height: 2, borderRadius: 1, backgroundColor: palette.gold },
});
