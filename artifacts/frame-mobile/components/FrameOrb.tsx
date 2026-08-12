import React, { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  Easing,
  interpolate,
} from "react-native-reanimated";

type OrbState =
  | "Dormant"
  | "Stable"
  | "Loaded"
  | "Recovering"
  | "Tight"
  | "Volatile"
  | "Composed"
  | "Overextended";

interface Props {
  state?: OrbState;
  size?: number;
}

const STATE_COLORS: Record<OrbState, { core: string; glow: string; speed: number }> = {
  Dormant:      { core: "#1a1a1a", glow: "#2a2a2a", speed: 4000 },
  Stable:       { core: "#1e2d1e", glow: "#2a5c2a", speed: 3500 },
  Loaded:       { core: "#1a2535", glow: "#1a4a7a", speed: 2800 },
  Recovering:   { core: "#2a1f10", glow: "#5a3a10", speed: 3200 },
  Tight:        { core: "#1a1020", glow: "#3a1555", speed: 2000 },
  Volatile:     { core: "#2a1010", glow: "#7a1515", speed: 1200 },
  Composed:     { core: "#102020", glow: "#C9883A", speed: 3000 },
  Overextended: { core: "#2a1505", glow: "#8a3a05", speed: 1800 },
};

export function FrameOrb({ state = "Dormant", size = 180 }: Props) {
  const cfg = STATE_COLORS[state] ?? STATE_COLORS.Dormant;

  const pulse = useSharedValue(0);
  const rotate = useSharedValue(0);
  const outerPulse = useSharedValue(0);

  useEffect(() => {
    pulse.value = withRepeat(
      withTiming(1, { duration: cfg.speed, easing: Easing.inOut(Easing.sin) }),
      -1,
      true
    );
    rotate.value = withRepeat(
      withTiming(1, { duration: cfg.speed * 3, easing: Easing.linear }),
      -1,
      false
    );
    outerPulse.value = withRepeat(
      withTiming(1, { duration: cfg.speed * 1.5, easing: Easing.inOut(Easing.quad) }),
      -1,
      true
    );
  }, [state, cfg.speed]);

  const coreStyle = useAnimatedStyle(() => {
    const scale = interpolate(pulse.value, [0, 1], [0.95, 1.05]);
    const opacity = interpolate(pulse.value, [0, 1], [0.8, 1]);
    return { transform: [{ scale }], opacity };
  });

  const glowStyle = useAnimatedStyle(() => {
    const scale = interpolate(outerPulse.value, [0, 1], [1.0, 1.3]);
    const opacity = interpolate(outerPulse.value, [0, 1], [0.3, 0.0]);
    return { transform: [{ scale }], opacity };
  });

  const ringStyle = useAnimatedStyle(() => {
    const deg = interpolate(rotate.value, [0, 1], [0, 360]);
    const scale = interpolate(pulse.value, [0, 1], [0.98, 1.02]);
    return {
      transform: [{ rotate: `${deg}deg` }, { scale }],
    };
  });

  const innerRingStyle = useAnimatedStyle(() => {
    const deg = interpolate(rotate.value, [0, 1], [0, -360]);
    return {
      transform: [{ rotate: `${deg}deg` }],
    };
  });

  const r = size / 2;

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      {/* Outer ambient glow */}
      <Animated.View
        style={[
          styles.circle,
          {
            width: size * 1.8,
            height: size * 1.8,
            borderRadius: (size * 1.8) / 2,
            backgroundColor: cfg.glow,
            position: "absolute",
            top: -(size * 0.4),
            left: -(size * 0.4),
          },
          glowStyle,
        ]}
      />

      {/* Outer rotating ring */}
      <Animated.View
        style={[
          styles.ring,
          {
            width: size * 0.94,
            height: size * 0.94,
            borderRadius: size * 0.47,
            borderColor: cfg.glow,
            borderWidth: 1,
            position: "absolute",
            top: size * 0.03,
            left: size * 0.03,
          },
          ringStyle,
        ]}
      />

      {/* Inner counter-rotating ring */}
      <Animated.View
        style={[
          styles.ring,
          {
            width: size * 0.78,
            height: size * 0.78,
            borderRadius: size * 0.39,
            borderColor: cfg.glow,
            borderWidth: 1,
            borderStyle: "dashed",
            position: "absolute",
            top: size * 0.11,
            left: size * 0.11,
          },
          innerRingStyle,
        ]}
      />

      {/* Core orb */}
      <Animated.View
        style={[
          styles.core,
          {
            width: size * 0.65,
            height: size * 0.65,
            borderRadius: (size * 0.65) / 2,
            backgroundColor: cfg.core,
            borderColor: cfg.glow,
            borderWidth: 1,
            top: size * 0.175,
            left: size * 0.175,
          },
          coreStyle,
        ]}
      />

      {/* Gold accent dot */}
      <View
        style={[
          styles.dot,
          {
            width: size * 0.08,
            height: size * 0.08,
            borderRadius: (size * 0.08) / 2,
            backgroundColor: "#C9883A",
            top: r - size * 0.04,
            left: r - size * 0.04,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
  },
  circle: {
    position: "absolute",
  },
  ring: {
    position: "absolute",
    backgroundColor: "transparent",
  },
  core: {
    position: "absolute",
  },
  dot: {
    position: "absolute",
  },
});
