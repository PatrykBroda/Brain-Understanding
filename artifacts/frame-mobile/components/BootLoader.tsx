import React, { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  cancelAnimation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import { Screen } from "@/components/ui";
import { fonts, palette } from "@/constants/theme";

/**
 * Branded boot / loading surface matching the web hub's "Booting system"
 * gate (coach App.tsx Gate) — an uppercase label over a track with a
 * sweeping bar, instead of a bare spinner. Shares the #050505 base so there
 * is no flash against the native splash or SystemUI background.
 */

const TRACK_WIDTH = 120;
const BAR_WIDTH = 40;

export function BootLoader({ label = "BOOTING SYSTEM" }: { label?: string }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withRepeat(
      withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.ease) }),
      -1,
      false,
    );
    return () => cancelAnimation(t);
  }, [t]);

  const barStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(t.value, [0, 1], [-BAR_WIDTH, TRACK_WIDTH]) },
    ],
  }));

  return (
    <Screen>
      <View style={s.root}>
        <Text style={s.wordmark}>Frame</Text>
        <Text style={s.label}>{label}</Text>
        <View style={s.track}>
          <Animated.View style={[s.bar, barStyle]} />
        </View>
      </View>
    </Screen>
  );
}

const s = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  wordmark: {
    fontFamily: fonts.displayThin,
    fontSize: 38,
    lineHeight: 48,
    letterSpacing: -1,
    color: palette.textHi,
    marginBottom: 20,
  },
  label: {
    fontFamily: fonts.textMedium,
    fontSize: 11,
    letterSpacing: 2.2,
    color: palette.textMid,
    marginBottom: 18,
  },
  track: {
    width: TRACK_WIDTH,
    height: 3,
    borderRadius: 2,
    backgroundColor: "rgba(255,244,224,0.10)",
    overflow: "hidden",
  },
  bar: {
    width: BAR_WIDTH,
    height: 3,
    borderRadius: 2,
    backgroundColor: palette.goldLight,
  },
});
