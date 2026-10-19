import React, { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { GlassCard, haptic } from "@/components/ui";
import { fonts, palette } from "@/constants/theme";
import { formatDay } from "@/lib/localDay";
import { barSlots, checkinScore } from "@/lib/readinessBars";
import type { DailyCheckinRow } from "@/lib/today";

/**
 * Readiness history as bars, one per day. Each bar with a check-in is a button: tap it to
 * open that day's check-in below. Bars are white (selected: gold edge); a day with no
 * check-in is an empty slot, never a guessed number.
 */
export function ReadinessBars({
  checkins,
  today,
  selected,
  onSelect,
}: {
  checkins: DailyCheckinRow[];
  today: string;
  selected: string | null;
  onSelect: (date: string | null) => void;
}) {
  const slots = useMemo(() => barSlots(checkins, today), [checkins, today]);
  const open = selected ? slots.find((s) => s.date === selected)?.checkin ?? null : null;
  return (
    <View>
      <View style={styles.row} accessibilityRole="list">
        {slots.map(({ date, checkin }) => {
          const score = checkin ? checkinScore(checkin) : null;
          const on = selected === date;
          return (
            <Pressable
              key={date}
              disabled={!checkin}
              onPress={() => {
                haptic.select();
                onSelect(on ? null : date);
              }}
              accessibilityRole="button"
              accessibilityLabel={
                checkin ? `${formatDay(date)}, readiness ${score}. Open this check-in` : `${formatDay(date)}, no check-in`
              }
              accessibilityState={{ selected: on, disabled: !checkin }}
              style={styles.slot}
              hitSlop={{ top: 8, bottom: 8 }}
            >
              <View style={styles.track}>
                {score != null ? (
                  <View style={[styles.bar, { height: `${Math.max(6, score)}%` }, on && styles.barOn]} />
                ) : (
                  <View style={styles.empty} />
                )}
              </View>
              <Text style={[styles.tick, on && styles.tickOn]}>{Number(date.slice(8))}</Text>
            </Pressable>
          );
        })}
      </View>
      {open ? (
        <GlassCard raised padding={16} style={{ marginTop: 12 }}>
          <Text style={styles.detailTitle}>
            {formatDay(open.checkinDate)}
            {open.checkinDate === today ? " · today" : ""}
          </Text>
          <Text style={styles.detailNote}>
            {open.checkinDate === today ? "Logged today." : "A past check-in. It is not today's state."}
          </Text>
          <View style={styles.detailGrid}>
            <Metric label="Readiness" value={checkinScore(open)} strong />
            <Metric label="Sleep" value={open.sleep} />
            <Metric label="Energy" value={open.energy} />
            <Metric label="Soreness" value={100 - open.soreness} />
            <Metric label="Stress" value={100 - open.stress} />
            {open.restingHr != null ? <Metric label="Resting HR" value={open.restingHr} unit="bpm" /> : null}
          </View>
        </GlassCard>
      ) : null}
    </View>
  );
}

function Metric({ label, value, unit, strong }: { label: string; value: number; unit?: string; strong?: boolean }) {
  return (
    <View style={styles.metric} accessible accessibilityLabel={`${label} ${value}${unit ? ` ${unit}` : ""}`}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[styles.metricValue, strong && { color: palette.textHi }]}>
        {value}
        {unit ? <Text style={styles.metricUnit}> {unit}</Text> : null}
      </Text>
    </View>
  );
}

const BAR_H = 96;

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "flex-end", gap: 4 },
  slot: { flex: 1, alignItems: "center", gap: 6 },
  track: { width: "100%", height: BAR_H, justifyContent: "flex-end", alignItems: "center" },
  bar: { width: "100%", maxWidth: 18, borderRadius: 4, backgroundColor: palette.textHi, opacity: 0.9, minHeight: 6 },
  barOn: { opacity: 1, borderWidth: 1.5, borderColor: palette.gold },
  empty: { width: "100%", maxWidth: 18, height: 2, borderRadius: 1, backgroundColor: palette.borderStrong },
  tick: { fontFamily: fonts.regular, fontSize: 11, color: palette.textLow, fontVariant: ["tabular-nums"] },
  tickOn: { color: palette.textHi, fontFamily: fonts.semi },
  detailTitle: { fontFamily: fonts.semi, fontSize: 17, color: palette.textHi },
  detailNote: { fontFamily: fonts.regular, fontSize: 13, color: palette.textMid, marginTop: 2 },
  detailGrid: { flexDirection: "row", flexWrap: "wrap", marginTop: 12, rowGap: 12 },
  metric: { width: "33.33%", gap: 2 },
  metricLabel: { fontFamily: fonts.regular, fontSize: 12, color: palette.textLow },
  metricValue: { fontFamily: fonts.semi, fontSize: 18, color: palette.textMid, fontVariant: ["tabular-nums"] },
  metricUnit: { fontFamily: fonts.regular, fontSize: 12, color: palette.textLow },
});
