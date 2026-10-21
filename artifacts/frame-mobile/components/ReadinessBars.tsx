import React, { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { formatDay } from "@/lib/localDay";
import { barSlots, checkinScore } from "@/lib/readinessBars";
import type { DailyCheckinRow } from "@/lib/today";
import { TEXT_SECONDARY, caption, meta, sectionTitle } from "@/constants/typography";

/**
 * Readiness history, one bar per calendar day over the last 14. Each bar with a
 * check-in is tappable: it opens that day's check-in underneath, dated. A day with
 * no check-in is an empty slot, never a guessed number. Original look: bronze
 * highlight on the selected/today bar, spaced mono labels.
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
  const open = selected ? slots.find((x) => x.date === selected)?.checkin ?? null : null;

  return (
    <View>
      <View style={s.row} accessibilityRole="list">
        {slots.map(({ date, checkin }) => {
          const score = checkin ? checkinScore(checkin) : null;
          const on = selected === date;
          const isToday = date === today;
          return (
            <Pressable
              key={date}
              disabled={!checkin}
              onPress={() => onSelect(on ? null : date)}
              accessibilityRole="button"
              accessibilityLabel={
                checkin ? `${formatDay(date)}, readiness ${score}. Open this check-in` : `${formatDay(date)}, no check-in`
              }
              accessibilityState={{ selected: on, disabled: !checkin }}
              style={s.slot}
              hitSlop={{ top: 8, bottom: 8 }}
            >
              <View style={s.track}>
                {score != null ? (
                  <View
                    style={[
                      s.bar,
                      { height: `${Math.max(6, score)}%` },
                      { backgroundColor: on || isToday ? "#8A6A2F" : "#3a3a3a" },
                      on && s.barOn,
                    ]}
                  />
                ) : (
                  <View style={s.empty} />
                )}
              </View>
              <Text style={[s.tick, on && s.tickOn]}>{Number(date.slice(8))}</Text>
            </Pressable>
          );
        })}
      </View>

      {open ? (
        <View style={s.detail}>
          <View style={s.detailHead}>
            <Text style={s.detailTitle}>
              {formatDay(open.checkinDate)}
              {open.checkinDate === today ? " · TODAY" : ""}
            </Text>
            <Text style={s.detailScore}>{checkinScore(open)}</Text>
          </View>
          <Text style={s.detailNote}>
            {open.checkinDate === today ? "Logged today." : "A past check-in. It is not today's state."}
          </Text>
          <View style={s.grid}>
            <Metric label="Sleep" value={open.sleep} />
            <Metric label="Energy" value={open.energy} />
            <Metric label="Soreness" value={100 - open.soreness} />
            <Metric label="Stress" value={100 - open.stress} />
            {open.restingHr != null ? <Metric label="Cardio HR" value={open.restingHr} unit="bpm" /> : null}
          </View>
        </View>
      ) : null}
    </View>
  );
}

function Metric({ label, value, unit }: { label: string; value: number; unit?: string }) {
  return (
    <View style={s.metric} accessible accessibilityLabel={`${label} ${value}${unit ? ` ${unit}` : ""}`}>
      <Text style={s.metricLabel}>{label}</Text>
      <Text style={s.metricValue}>
        {value}
        {unit ? <Text style={s.metricUnit}> {unit}</Text> : null}
      </Text>
    </View>
  );
}

const BAR_H = 64;

const s = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "flex-end", gap: 3 },
  slot: { flex: 1, alignItems: "center", gap: 6 },
  track: { width: "100%", height: BAR_H, justifyContent: "flex-end", alignItems: "center" },
  bar: { width: "100%", borderTopLeftRadius: 1, borderTopRightRadius: 1, minHeight: 4 },
  barOn: { borderWidth: 1, borderColor: "#e0e0e0" },
  empty: { width: "100%", height: 2, backgroundColor: "#1e1e1e" },
  tick: { ...meta, color: TEXT_SECONDARY },
  tickOn: { color: "#e0e0e0" },
  detail: {
    marginTop: 16,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.07)",
    paddingTop: 14,
  },
  detailHead: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" },
  detailTitle: { ...sectionTitle },
  detailScore: { fontFamily: "Outfit", fontSize: 22, color: "#8A6A2F" },
  detailNote: { ...meta, color: TEXT_SECONDARY, marginTop: 4 },
  grid: { flexDirection: "row", flexWrap: "wrap", marginTop: 14, rowGap: 12 },
  metric: { width: "33.33%", gap: 3 },
  metricLabel: { ...meta },
  metricValue: { fontFamily: "Outfit", fontSize: 16, color: "#d8d8d8" },
  metricUnit: { ...caption, color: TEXT_SECONDARY },
});
