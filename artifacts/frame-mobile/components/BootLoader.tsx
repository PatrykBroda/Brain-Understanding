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

/**
 * Branded boot / loading surface matching the web hub's "Booting system"
 * gate (coach App.tsx Gate) — a mono uppercase label over a track with a
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
    <View style={s.root}>
      <Text style={s.wordmark}>FRAME</Text>
      <Text style={s.label}>{label}</Text>
      <View style={s.track}>
        <Animated.View style={[s.bar, barStyle]} />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#050505",
  },
  wordmark: {
    fontFamily: "SpaceMono",
    fontSize: 18,
    letterSpacing: 10,
    color: "#e0e0e0",
    marginBottom: 28,
  },
  label: {
    fontFamily: "SpaceMono",
    fontSize: 10,
    letterSpacing: 3.2,
    color: "#8A8A8A",
    marginBottom: 16,
  },
  track: {
    width: TRACK_WIDTH,
    height: 2,
    backgroundColor: "#1a1a1a",
    overflow: "hidden",
  },
  bar: {
    width: BAR_WIDTH,
    height: 2,
    backgroundColor: "#C9883A",
  },
});
