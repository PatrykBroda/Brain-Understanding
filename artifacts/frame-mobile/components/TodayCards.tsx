import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";

import { GOLD } from "@/constants/colors";
import { formatDay } from "@/lib/localDay";
import type { FocusView, TodayView } from "@/lib/today";

/**
 * Said when FRAME holds nothing new today (or no check-in): what it knows, from
 * which day, and one clear action. Never dresses an old read up as today's.
 * Original look: hairline rule, spaced uppercase label, bronze action.
 */
export function DisclosureNotice({
  disclosure,
  onCheckIn,
  centered,
}: {
  disclosure: TodayView["disclosure"];
  onCheckIn: () => void;
  /** Centre the text and action (State screen). */
  centered?: boolean;
}) {
  if (disclosure.code === "none") return null;
  return (
    <View style={s.notice}>
      <Text style={[s.noticeText, centered && s.centered]} accessibilityRole="text">
        {disclosure.message}
      </Text>
      {disclosure.action === "check_in" ? (
        <Pressable onPress={onCheckIn} style={[s.noticeAction, centered && s.noticeActionCentered]} hitSlop={8} accessibilityRole="button">
          <Text style={s.noticeActionText}>Check in now</Text>
          <Feather name="chevron-right" size={13} color={GOLD} />
        </Pressable>
      ) : null}
    </View>
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
  const dateTag = focus?.forDate
    ? stale
      ? `FROM ${formatDay(focus.forDate).toUpperCase()}`
      : focus.carriedOver
        ? "SAME AS YESTERDAY"
        : "TODAY"
    : null;

  return (
    <View>
      <View style={s.head}>
        <Text style={s.title}>TODAY'S FOCUS</Text>
        {dateTag ? <Text style={[s.tag, stale && s.tagStale]}>{dateTag}</Text> : null}
      </View>

      {loading ? (
        <Text style={s.detail}>READING YOUR DAY…</Text>
      ) : focus ? (
        <>
          <Pressable
            style={s.focusRow}
            disabled={stale || !onAskCoach}
            accessibilityRole="button"
            accessibilityLabel="Talk this through with your coach"
            onPress={() =>
              onAskCoach?.(
                `My focus today is "${focus.title}". Walk me through how to work on it in my next session.`,
              )
            }
          >
            <Text style={[s.focusLabel, stale && { color: "#8a8a8a" }]}>{focus.title}</Text>
            {!stale && onAskCoach ? <Feather name="chevron-right" size={16} color="#555" /> : null}
          </Pressable>
          <Text style={s.detail}>{focus.detail}</Text>
          {focus.because.length > 0 ? (
            <View style={s.because}>
              {focus.because.map((b) => (
                <Text key={b} style={s.becauseLine}>
                  {b}
                </Text>
              ))}
            </View>
          ) : null}
          {stale ? (
            <Text style={s.staleNote}>
              NOT SET FOR TODAY. CHECK IN OR TELL YOUR COACH HOW TRAINING WENT AND FRAME WILL SET TODAY'S.
            </Text>
          ) : null}
        </>
      ) : (
        <>
          <Text style={[s.focusLabel, { color: "#666", paddingTop: 16 }]}>Your focus appears here</Text>
          <Text style={s.detail}>
            Log a check-in or tell your coach how training is going. FRAME sets a focus from what it knows about your day.
          </Text>
        </>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  notice: {
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: "rgba(138,106,47,0.35)",
    paddingVertical: 14,
    gap: 10,
  },
  noticeText: { fontFamily: "Outfit", fontSize: 14, lineHeight: 21, color: "#cfcfcf" },
  noticeAction: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start" },
  centered: { textAlign: "center" },
  noticeActionCentered: { alignSelf: "center" },
  noticeActionText: { fontFamily: "Outfit", fontSize: 14, color: GOLD },
  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.07)",
    paddingBottom: 8,
  },
  title: { fontFamily: "SpaceMono", fontSize: 10, letterSpacing: 6, color: "#777" },
  tag: { fontFamily: "SpaceMono", fontSize: 9, letterSpacing: 3, color: "#555" },
  tagStale: { color: "#8A6A2F" },
  focusRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 16,
    gap: 12,
  },
  focusLabel: { flex: 1, fontFamily: "Outfit", fontSize: 18, color: "#f0f0f0", lineHeight: 24 },
  detail: {
    fontFamily: "Outfit",
    fontSize: 14,
    lineHeight: 21,
    color: "#9a9a9a",
    marginTop: 8,
  },
  because: { marginTop: 12, gap: 4 },
  becauseLine: { fontFamily: "SpaceMono", fontSize: 9, letterSpacing: 2, lineHeight: 15, color: "#555" },
  staleNote: {
    fontFamily: "SpaceMono",
    fontSize: 9,
    letterSpacing: 2,
    lineHeight: 15,
    color: "#8A6A2F",
    marginTop: 12,
  },
});
