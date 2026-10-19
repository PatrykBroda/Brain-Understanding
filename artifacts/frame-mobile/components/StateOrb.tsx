import React, { useEffect, useRef } from "react";
import { Animated, Easing, Pressable, StyleSheet, View } from "react-native";
import Svg, { Circle, Defs, Ellipse, LinearGradient, RadialGradient, Stop } from "react-native-svg";

import { useReducedMotion } from "@/components/ui";
import { haptic } from "@/components/ui/haptics";
import { motion, palette } from "@/constants/theme";

/**
 * StateOrb - the signature state visual: a sculptural black sphere with silver
 * shading and a restrained champagne bounce light. Pure SVG gradients, no GL,
 * no particles, so it is light enough to be the always-on version.
 *
 * It is decoration only: it never encodes a biometric. The only motion is a
 * very slow ambient drift of the highlight layer (opacity-neutral transform,
 * ~16s each way). With reduced motion there is no drift and press/expand
 * feedback is instant - a fully static sphere.
 *
 * States: idle · pressed (scale 0.98 + a brightness step, ~180ms, haptic) ·
 * expanded (a champagne hairline ring fades in over ~300ms; the parent shows
 * the factors panel). It is a real button: role, label and expanded state.
 */
export function StateOrb({
  size = 240,
  stateLabel,
  expanded = false,
  onToggle,
}: {
  size?: number;
  stateLabel: string;
  expanded?: boolean;
  /** Omit for a purely visual orb (the State screen): it is then not a button. */
  onToggle?: () => void;
}) {
  const reduced = useReducedMotion();
  const press = useRef(new Animated.Value(0)).current;
  const open = useRef(new Animated.Value(expanded ? 1 : 0)).current;
  const drift = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reduced) {
      drift.setValue(0.5);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(drift, { toValue: 1, duration: 16000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(drift, { toValue: 0, duration: 16000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [reduced, drift]);

  useEffect(() => {
    Animated.timing(open, {
      toValue: expanded ? 1 : 0,
      duration: reduced ? 0 : motion.slow,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [expanded, reduced, open]);

  const animatePress = (to: number) =>
    Animated.timing(press, {
      toValue: to,
      duration: reduced ? 0 : motion.fast,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();

  const shift = size * 0.035;
  const pad = size * 0.08;
  const ring = size + 20;

  return (
    <Pressable
      accessibilityRole={onToggle ? "button" : "image"}
      accessibilityLabel={`State: ${stateLabel}`}
      accessibilityHint={onToggle ? (expanded ? "Hides the factors behind this state" : "Shows the factors behind this state") : undefined}
      accessibilityState={onToggle ? { expanded } : undefined}
      disabled={!onToggle}
      onPressIn={() => animatePress(1)}
      onPressOut={() => animatePress(0)}
      onPress={() => {
        haptic.select();
        onToggle?.();
      }}
      hitSlop={8}
      style={{ width: ring, height: ring, alignItems: "center", justifyContent: "center" }}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          styles.ring,
          { width: ring, height: ring, borderRadius: ring / 2, opacity: open },
        ]}
      />
      <Animated.View
        style={{
          width: size,
          height: size,
          transform: [{ scale: press.interpolate({ inputRange: [0, 1], outputRange: [1, 0.98] }) }],
        }}
      >
        <View style={[styles.clip, { width: size, height: size, borderRadius: size / 2 }]}>
          {/* body: black sphere, silver key light top-left, edge falloff */}
          <Svg width={size} height={size} viewBox="0 0 100 100" style={StyleSheet.absoluteFill}>
            <Defs>
              <RadialGradient id="orbBody" cx="50" cy="50" r="50" fx="38" fy="31" gradientUnits="userSpaceOnUse">
                <Stop offset="0" stopColor="#3B4048" />
                <Stop offset="0.34" stopColor="#1C1F23" />
                <Stop offset="0.74" stopColor="#0C0E10" />
                <Stop offset="1" stopColor="#040506" />
              </RadialGradient>
              <LinearGradient id="orbRim" x1="0" y1="0" x2="1" y2="1">
                <Stop offset="0" stopColor="#C9CDD2" stopOpacity="0.55" />
                <Stop offset="0.5" stopColor="#C9CDD2" stopOpacity="0.06" />
                <Stop offset="1" stopColor="#CDBB8E" stopOpacity="0.32" />
              </LinearGradient>
            </Defs>
            <Circle cx="50" cy="50" r="50" fill="url(#orbBody)" />
            {/* fine sculptural meridians */}
            <Ellipse cx="50" cy="50" rx="49.5" ry="17" fill="none" stroke="#fff" strokeOpacity="0.05" strokeWidth="0.35" rotation="-24" origin="50, 50" />
            <Ellipse cx="50" cy="50" rx="17" ry="49.5" fill="none" stroke="#fff" strokeOpacity="0.045" strokeWidth="0.35" rotation="18" origin="50, 50" />
            <Circle cx="50" cy="50" r="49.6" fill="none" stroke="url(#orbRim)" strokeWidth="0.8" />
          </Svg>

          {/* highlights: slow ambient drift (transform only) */}
          <Animated.View
            pointerEvents="none"
            style={{
              position: "absolute",
              left: -pad,
              top: -pad,
              width: size + pad * 2,
              height: size + pad * 2,
              transform: [
                { translateX: drift.interpolate({ inputRange: [0, 1], outputRange: [-shift, shift] }) },
                { translateY: drift.interpolate({ inputRange: [0, 1], outputRange: [shift * 0.6, -shift * 0.6] }) },
              ],
            }}
          >
            <Svg width={size + pad * 2} height={size + pad * 2} viewBox="-8 -8 116 116">
              <Defs>
                <RadialGradient id="orbSpec" cx="33" cy="27" r="26" gradientUnits="userSpaceOnUse">
                  <Stop offset="0" stopColor="#E9EBED" stopOpacity="0.34" />
                  <Stop offset="0.5" stopColor="#C9CDD2" stopOpacity="0.1" />
                  <Stop offset="1" stopColor="#C9CDD2" stopOpacity="0" />
                </RadialGradient>
                <RadialGradient id="orbChamp" cx="72" cy="76" r="32" gradientUnits="userSpaceOnUse">
                  <Stop offset="0" stopColor="#CDBB8E" stopOpacity="0.2" />
                  <Stop offset="1" stopColor="#CDBB8E" stopOpacity="0" />
                </RadialGradient>
              </Defs>
              <Circle cx="72" cy="76" r="32" fill="url(#orbChamp)" />
              <Circle cx="33" cy="27" r="26" fill="url(#orbSpec)" />
            </Svg>
          </Animated.View>

          {/* pressed: one brightness step */}
          <Animated.View
            pointerEvents="none"
            style={[StyleSheet.absoluteFill, { backgroundColor: "#fff", opacity: press.interpolate({ inputRange: [0, 1], outputRange: [0, 0.07] }) }]}
          />
        </View>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  clip: { overflow: "hidden", backgroundColor: "#050607" },
  ring: { position: "absolute", borderWidth: 1, borderColor: palette.goldHair },
});
