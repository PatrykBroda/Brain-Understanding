import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import React, { useEffect, useRef } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useActiveCompetition } from "@/hooks/useCompetition";
import type { PressureTier } from "@/lib/competition";
import { fonts, palette, radius } from "@/constants/theme";

// Visual pressure scales with the camp phase: calm amber far out, hard red in
// fight week. Ported to match the web banner (coach/competition-banner.tsx):
// top/bottom rules, uppercase event name, and a weigh-in + days-out readout.
const TIER_STYLE: Record<PressureTier, { border: string; accent: string; pulse: boolean }> = {
  base: { border: palette.goldHair, accent: palette.goldLight, pulse: false },
  build: { border: "rgba(199,161,90,0.40)", accent: palette.goldLight, pulse: false },
  sharpen: { border: "rgba(224,86,78,0.40)", accent: palette.redLight, pulse: false },
  peak: { border: "rgba(224,86,78,0.55)", accent: palette.redLight, pulse: true },
  fight_week: { border: "rgba(240,118,107,0.75)", accent: "#F0766B", pulse: true },
};

export function CompetitionBanner() {
  const router = useRouter();
  const { data } = useActiveCompetition();
  const pressure = data?.pressure;
  const competition = data?.competition;

  const tier = pressure ? (TIER_STYLE[pressure.tier] ?? TIER_STYLE.base) : TIER_STYLE.base;

  // Subtle breathing pulse in the closing phases (peak / fight week), matching
  // the web `.comp-pulse` animation.
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!tier.pulse) {
      pulse.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.82, duration: 1200, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 1200, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [tier.pulse, pulse]);

  if (!pressure || !competition) return null;

  const dayWord = pressure.daysToEvent === 1 ? "DAY" : "DAYS";
  const showWeighIn =
    pressure.daysToWeighIn !== null && pressure.daysToWeighIn <= pressure.daysToEvent;

  return (
    <Pressable
      accessibilityRole="button"
      style={styles.press}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        router.push("/competition");
      }}
    >
      <Animated.View
        style={[
          styles.banner,
          { borderColor: tier.border, opacity: pulse },
        ]}
      >
        <LinearGradient
          colors={[palette.goldWash, "rgba(255,246,232,0.02)"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        <View style={styles.row}>
          <View style={styles.left}>
            <Text style={[styles.tierLabel, { color: tier.accent }]} numberOfLines={1}>
              {pressure.tierLabel.toUpperCase()}
            </Text>
            <Text style={styles.event} numberOfLines={2}>
              {competition.eventName}
            </Text>
          </View>
          <View style={styles.right}>
            {showWeighIn ? (
              <View style={styles.metric}>
                <Text style={[styles.weighNum, { color: tier.accent }]}>
                  {pressure.daysToWeighIn}
                </Text>
                <Text style={styles.metricLabel}>WEIGH-IN</Text>
              </View>
            ) : null}
            <View style={styles.metric}>
              <Text style={[styles.daysNum, { color: tier.accent }]}>
                {pressure.daysToEvent}
              </Text>
              <Text style={styles.metricLabel}>{dayWord}</Text>
            </View>
          </View>
        </View>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  press: {
    marginHorizontal: 20,
    marginTop: 12,
  },
  banner: {
    borderWidth: 1,
    borderRadius: radius.lg,
    minHeight: 64,
    paddingHorizontal: 20,
    paddingVertical: 12,
    justifyContent: "center",
    overflow: "hidden",
    backgroundColor: palette.graphite1,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  left: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  tierLabel: {
    fontFamily: fonts.textMedium,
    fontSize: 10.5,
    letterSpacing: 1.8,
  },
  event: {
    fontFamily: fonts.displayItalic,
    fontSize: 18,
    lineHeight: 21,
    color: palette.textHi,
  },
  right: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 14,
  },
  metric: {
    flexDirection: "row",
    alignItems: "baseline",
  },
  weighNum: {
    fontFamily: fonts.numeral,
    fontSize: 20,
  },
  daysNum: {
    fontFamily: fonts.numeralXL,
    fontSize: 34,
    lineHeight: 38,
    letterSpacing: -1,
  },
  metricLabel: {
    fontFamily: fonts.textMedium,
    fontSize: 9.5,
    letterSpacing: 1.4,
    color: palette.textMid,
    marginLeft: 5,
  },
});
