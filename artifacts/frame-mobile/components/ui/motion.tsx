import React, { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing, type ViewStyle } from "react-native";

import { motion } from "@/constants/theme";

/** True when the OS asks for reduced motion — gates every non-essential animation. */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let live = true;
    AccessibilityInfo.isReduceMotionEnabled?.()
      .then((v) => live && setReduced(v))
      .catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener?.("reduceMotionChanged", setReduced);
    return () => {
      live = false;
      sub?.remove?.();
    };
  }, []);
  return reduced;
}

/** One short rise-and-fade on mount (opacity + transform, ~320ms); `index` staggers siblings. Instant when reduced. */
export function FadeIn({
  index = 0,
  children,
  style,
}: {
  index?: number;
  children: React.ReactNode;
  style?: ViewStyle | ViewStyle[];
}) {
  const reduced = useReducedMotion();
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduced) {
      v.setValue(1);
      return;
    }
    Animated.timing(v, {
      toValue: 1,
      duration: motion.slow,
      delay: index * motion.stagger,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [reduced, index, v]);
  return (
    <Animated.View
      style={[
        style as ViewStyle,
        { opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }] },
      ]}
    >
      {children}
    </Animated.View>
  );
}
