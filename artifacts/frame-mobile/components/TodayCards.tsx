import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";

import { Body, Button, Display, Eyebrow, GlassCard, haptic } from "@/components/ui";
import { fonts, MIN_TAP, palette, radius } from "@/constants/theme";
import { formatDay } from "@/lib/localDay";
import type { FocusView, TodayView } from "@/lib/today";

/**
 * Said when FRAME holds nothing new today (or no check-in): what it knows, from
 * which day, and one clear action. Never dresses an old read up as today's.
 */
export function DisclosureNotice({
  disclosure,
  onCheckIn,
}: {
  disclosure: TodayView["disclosure"];
  onCheckIn: () => void;
}) {
  if (disclosure.code === "none") return null;
  const stale = disclosure.code === "no_info_today" || disclosure.code === "no_info_ever";
  return (
    <GlassCard tone={stale ? "gold" : "neutral"} padding={16} style={styles.noticeCard}>
      <View style={styles.noticeRow}>
        <Feather name={stale ? "clock" : "info"} size={18} color={stale ? palette.goldPale : palette.textMid} style={{ marginTop: 2 }} />
        <View style={{ flex: 1, gap: 10 }}>
          <Text style={styles.noticeText} accessibilityRole="text">
            {disclosure.message}
          </Text>
          {disclosure.action === "check_in" ? (
            <Button title="Check in now" variant="secondary" onPress={onCheckIn} style={styles.noticeBtn} />
          ) : null}
        </View>
      </View>
    </GlassCard>
  );
}

/** Today's Focus: one thing, why, and which day it belongs to. */
export function FocusCard({
  focus,
  loading,
  onAskCoach,
}: {
  focus: FocusView | null;
  loading?: boolean;
  onAskCoach?: (prompt: string) => void;
}) {
  const stale = focus != null && !focus.current;
  return (
    <GlassCard padding={20}>
      <View style={styles.focusHead}>
        <Eyebrow>Today&apos;s focus</Eyebrow>
        {focus?.forDate ? (
          <View style={[styles.chip, stale && styles.chipStale]}>
            <Text style={[styles.chipText, stale && styles.chipTextStale]}>
              {stale ? `From ${formatDay(focus.forDate)}` : focus.carriedOver ? "Same as yesterday" : "Today"}
            </Text>
          </View>
        ) : null}
      </View>
      {loading ? (
        <Body small style={{ marginTop: 10 }}>
          Reading your day…
        </Body>
      ) : focus ? (
        <>
          <Display size="heading" style={[styles.focusTitle, stale && { color: palette.textMid }]}>
            {focus.title}
          </Display>
          <Text style={styles.focusDetail}>{focus.detail}</Text>
          {focus.because.length > 0 ? (
            <View style={styles.because}>
              {focus.because.map((b) => (
                <Text key={b} style={styles.becauseLine}>
                  {b}
                </Text>
              ))}
            </View>
          ) : null}
          {stale ? (
            <Text style={styles.staleNote}>Not set for today. Check in or tell your coach how training went and FRAME will set today&apos;s.</Text>
          ) : onAskCoach ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Talk this through with your coach"
              onPress={() => {
                haptic.select();
                onAskCoach(`My focus today is "${focus.title}". Walk me through how to work on it in my next session.`);
              }}
              style={({ pressed }) => [styles.askRow, pressed && { backgroundColor: palette.raised }]}
            >
              <Text style={styles.askText}>Talk it through with your coach</Text>
              <Feather name="arrow-up-right" size={16} color={palette.textMid} />
            </Pressable>
          ) : null}
        </>
      ) : (
        <>
          <Display size="heading" style={styles.focusTitle}>
            Your focus appears here
          </Display>
          <Text style={styles.focusDetail}>Log a check-in or tell your coach how training is going. FRAME sets a focus from what it knows about your day.</Text>
        </>
      )}
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  noticeCard: { marginTop: 0 },
  noticeRow: { flexDirection: "row", gap: 12 },
  noticeText: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 22, color: palette.textHi },
  noticeBtn: { minHeight: 44, alignSelf: "flex-start", paddingHorizontal: 18 },
  focusHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  chip: {
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.raised,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  chipStale: { borderColor: palette.goldHair, backgroundColor: palette.goldWash },
  chipText: { fontFamily: fonts.medium, fontSize: 12, color: palette.textMid, fontVariant: ["tabular-nums"] },
  chipTextStale: { color: palette.goldPale },
  focusTitle: { marginTop: 10 },
  focusDetail: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 22, color: palette.textMid, marginTop: 6 },
  because: { marginTop: 12, gap: 4, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.borderStrong },
  becauseLine: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18, color: palette.textLow },
  staleNote: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18, color: palette.goldPale, marginTop: 12 },
  askRow: {
    marginTop: 14,
    minHeight: MIN_TAP,
    borderRadius: radius.sm,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: palette.border,
  },
  askText: { fontFamily: fonts.medium, fontSize: 14, color: palette.textHi },
});
