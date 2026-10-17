import { useRouter } from "expo-router";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useActiveCompetition } from "@/hooks/useCompetition";
import type { PressureTier } from "@/lib/competition";
import { haptic } from "@/components/ui/haptics";
import { fonts, palette, radius } from "@/constants/theme";

// Camp pressure scales with the phase. Far out = neutral/gold hairline; the
// closing phases move to a red hairline AND keep the written tier label, so
// colour is never the only signal. Static: no pulsing, no glow.
const TIER_STYLE: Record<PressureTier, { border: string; accent: string }> = {
  base: { border: palette.goldHair, accent: palette.gold },
  build: { border: palette.goldHair, accent: palette.gold },
  sharpen: { border: palette.redHair, accent: palette.redText },
  peak: { border: palette.redHair, accent: palette.redText },
  fight_week: { border: palette.redHair, accent: palette.redText },
};

export function CompetitionBanner() {
  const router = useRouter();
  const { data } = useActiveCompetition();
  const pressure = data?.pressure;
  const competition = data?.competition;

  if (!pressure || !competition) return null;

  const tier = TIER_STYLE[pressure.tier] ?? TIER_STYLE.base;
  const dayWord = pressure.daysToEvent === 1 ? "day" : "days";
  const showWeighIn =
    pressure.daysToWeighIn !== null && pressure.daysToWeighIn <= pressure.daysToEvent;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${competition.eventName}, ${pressure.tierLabel}, ${pressure.daysToEvent} ${dayWord} to go`}
      style={({ pressed }) => [styles.press, pressed && { opacity: 0.85 }]}
      onPress={() => {
        haptic.select();
        router.push("/competition");
      }}
    >
      <View style={[styles.banner, { borderColor: tier.border }]}>
        <View style={styles.left}>
          <Text style={[styles.tierLabel, { color: tier.accent }]} numberOfLines={1}>
            {pressure.tierLabel}
          </Text>
          <Text style={styles.event} numberOfLines={2}>
            {competition.eventName}
          </Text>
        </View>
        <View style={styles.right}>
          {showWeighIn ? (
            <View style={styles.metric}>
              <Text style={styles.num}>{pressure.daysToWeighIn}</Text>
              <Text style={styles.metricLabel}>weigh-in</Text>
            </View>
          ) : null}
          <View style={styles.metric}>
            <Text style={[styles.num, styles.daysNum]}>{pressure.daysToEvent}</Text>
            <Text style={styles.metricLabel}>{dayWord}</Text>
          </View>
        </View>
        <Feather name="chevron-right" size={18} color={palette.textLow} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  press: { marginHorizontal: 20, marginTop: 16 },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderRadius: radius.lg,
    minHeight: 64,
    paddingHorizontal: 18,
    paddingVertical: 14,
    backgroundColor: palette.surface,
  },
  left: { flex: 1, minWidth: 0, gap: 2 },
  tierLabel: { fontFamily: fonts.medium, fontSize: 13, lineHeight: 18 },
  event: { fontFamily: fonts.semi, fontSize: 16, lineHeight: 21, color: palette.textHi },
  right: { flexDirection: "row", alignItems: "flex-end", gap: 16 },
  metric: { alignItems: "flex-end" },
  num: { fontFamily: fonts.semi, fontSize: 18, lineHeight: 22, color: palette.textHi, fontVariant: ["tabular-nums"] },
  daysNum: { fontSize: 22, lineHeight: 26 },
  metricLabel: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 16, color: palette.textMid },
});
