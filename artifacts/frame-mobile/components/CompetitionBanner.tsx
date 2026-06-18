import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import React from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useActiveCompetition } from "@/hooks/useCompetition";
import type { PressureTier } from "@/lib/competition";

const TIER_STYLE: Record<PressureTier, { border: string; bg: string; accent: string }> = {
  base: { border: "rgba(201,136,58,0.30)", bg: "rgba(201,136,58,0.06)", accent: "#C9883A" },
  build: { border: "rgba(201,136,58,0.45)", bg: "rgba(201,136,58,0.08)", accent: "#C9883A" },
  sharpen: { border: "rgba(192,57,43,0.45)", bg: "rgba(192,57,43,0.08)", accent: "#d2553f" },
  peak: { border: "rgba(192,57,43,0.6)", bg: "rgba(192,57,43,0.12)", accent: "#e0604a" },
  fight_week: { border: "rgba(214,48,32,0.85)", bg: "rgba(214,48,32,0.16)", accent: "#ff6a4d" },
};

function countdown(days: number): string {
  if (days <= 0) return "TODAY";
  if (days === 1) return "1 DAY OUT";
  return `${days} DAYS OUT`;
}

export function CompetitionBanner() {
  const router = useRouter();
  const { data } = useActiveCompetition();
  const pressure = data?.pressure;
  const competition = data?.competition;

  if (!pressure || !competition) return null;

  const tier = TIER_STYLE[pressure.tier] ?? TIER_STYLE.base;

  return (
    <Pressable
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        router.push("/competition");
      }}
      style={[styles.banner, { borderColor: tier.border, backgroundColor: tier.bg }]}
    >
      <View style={[styles.tick, { backgroundColor: tier.accent }]} />
      <View style={styles.body}>
        <View style={styles.topRow}>
          <Text style={[styles.tierLabel, { color: tier.accent }]}>
            {pressure.tierLabel.toUpperCase()}
          </Text>
          <Text style={[styles.count, { color: tier.accent }]}>
            {countdown(pressure.daysToEvent)}
          </Text>
        </View>
        <Text style={styles.event} numberOfLines={1}>
          {competition.eventName}
        </Text>
      </View>
      <Feather name="chevron-right" size={16} color={tier.accent} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    marginHorizontal: Platform.OS === "web" ? 16 : 16,
    marginTop: 10,
    paddingVertical: 10,
    paddingRight: 12,
    gap: 12,
  },
  tick: {
    width: 3,
    alignSelf: "stretch",
  },
  body: {
    flex: 1,
    gap: 3,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  tierLabel: {
    fontFamily: "SpaceMono",
    fontSize: 9,
    letterSpacing: 2,
  },
  count: {
    fontFamily: "SpaceMono",
    fontSize: 9,
    letterSpacing: 1.5,
  },
  event: {
    fontFamily: "Outfit",
    fontSize: 14,
    color: "#d0d0d0",
  },
});
