import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import React, { useEffect, useRef } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useActiveCompetition } from "@/hooks/useCompetition";
import type { PressureTier } from "@/lib/competition";

// Visual pressure scales with the camp phase: calm amber far out, hard red in
// fight week. Ported to match the web banner (coach/competition-banner.tsx):
// top/bottom rules, uppercase event name, and a weigh-in + days-out readout.
const TIER_STYLE: Record<PressureTier, { border: string; accent: string; pulse: boolean }> = {
  base: { border: "rgba(201,136,58,0.30)", accent: "#C9883A", pulse: false },
  build: { border: "rgba(201,136,58,0.40)", accent: "#C9883A", pulse: false },
  sharpen: { border: "rgba(210,85,63,0.50)", accent: "#d2553f", pulse: false },
  peak: { border: "rgba(224,96,74,0.65)", accent: "#e0604a", pulse: true },
  fight_week: { border: "rgba(255,106,77,0.85)", accent: "#ff6a4d", pulse: true },
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
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        router.push("/competition");
      }}
    >
      <Animated.View
        style={[
          styles.banner,
          { borderTopColor: tier.border, borderBottomColor: tier.border, opacity: pulse },
        ]}
      >
        <LinearGradient
          colors={["rgba(0,0,0,0.4)", "rgba(0,0,0,0)"]}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        <View style={styles.row}>
          <View style={styles.left}>
            <Text style={[styles.tierLabel, { color: tier.accent }]} numberOfLines={1}>
              {pressure.tierLabel.toUpperCase()}
            </Text>
            <Text style={styles.event} numberOfLines={1}>
              {competition.eventName.toUpperCase()}
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
  banner: {
    borderTopWidth: 1,
    borderBottomWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginTop: 10,
    overflow: "hidden",
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
    gap: 2,
  },
  tierLabel: {
    fontFamily: "SpaceMono",
    fontSize: 9,
    letterSpacing: 3.6,
  },
  event: {
    fontFamily: "Outfit",
    fontSize: 12,
    letterSpacing: 0.7,
    color: "rgba(224,224,224,0.9)",
  },
  right: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 10,
  },
  metric: {
    flexDirection: "row",
    alignItems: "baseline",
  },
  weighNum: {
    fontFamily: "Outfit",
    fontWeight: "300",
    fontSize: 15,
  },
  daysNum: {
    fontFamily: "Outfit",
    fontWeight: "300",
    fontSize: 22,
  },
  metricLabel: {
    fontFamily: "SpaceMono",
    fontSize: 8,
    letterSpacing: 2.4,
    color: "rgba(224,224,224,0.55)",
    marginLeft: 4,
  },
});
