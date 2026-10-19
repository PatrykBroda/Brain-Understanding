import React, { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Feather } from "@expo/vector-icons";

import { parseDismissed, pointersKey, pointersToShow, type PointerId } from "@/lib/pointers";

/**
 * Up to three short, dismissible first-use hints. Each one goes away when dismissed or when the
 * athlete has already done the thing it points to. Original look: hairline rows, spaced labels.
 */
export function FirstUsePointers({
  userId,
  hasCheckinToday,
  hasEverCheckedIn,
  hasChatted,
  onAction,
}: {
  userId: string | null;
  hasCheckinToday: boolean;
  hasEverCheckedIn: boolean;
  hasChatted: boolean;
  onAction: (id: PointerId) => void;
}) {
  const [dismissed, setDismissed] = useState<PointerId[] | null>(null);

  useEffect(() => {
    if (!userId) return;
    let alive = true;
    AsyncStorage.getItem(pointersKey(userId))
      .then((raw) => alive && setDismissed(parseDismissed(raw)))
      .catch(() => alive && setDismissed([]));
    return () => {
      alive = false;
    };
  }, [userId]);

  const dismiss = useCallback(
    (id: PointerId) => {
      setDismissed((cur) => {
        const next = [...new Set([...(cur ?? []), id])];
        if (userId) AsyncStorage.setItem(pointersKey(userId), JSON.stringify(next)).catch(() => {});
        return next;
      });
    },
    [userId],
  );

  if (dismissed == null) return null;
  const shown = pointersToShow({ dismissed, hasCheckinToday, hasEverCheckedIn, hasChatted });
  if (shown.length === 0) return null;

  return (
    <View style={s.wrap}>
      {shown.map((p, i) => (
        <View key={p.id} style={[s.row, i > 0 && s.rule]}>
          <Pressable
            style={({ pressed }) => [s.main, pressed && { opacity: 0.75 }]}
            onPress={() => onAction(p.id)}
            accessibilityRole="button"
            accessibilityLabel={`${p.title}. ${p.body} ${p.action}`}
          >
            <Text style={s.title}>{p.title.toUpperCase()}</Text>
            <Text style={s.body}>{p.body}</Text>
            <View style={s.actionRow}>
              <Text style={s.action}>{p.action.toUpperCase()}</Text>
              <Feather name="chevron-right" size={11} color="#8A6A2F" />
            </View>
          </Pressable>
          <Pressable
            onPress={() => dismiss(p.id)}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={`Dismiss: ${p.title}`}
            style={s.close}
          >
            <Feather name="x" size={16} color="#555" />
          </Pressable>
        </View>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: {
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
  },
  row: { flexDirection: "row", alignItems: "flex-start" },
  rule: { borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.07)" },
  main: { flex: 1, paddingVertical: 14, gap: 6 },
  title: { fontFamily: "SpaceMono", fontSize: 10, letterSpacing: 4, color: "#aaa" },
  body: { fontFamily: "Outfit", fontSize: 14, lineHeight: 20, color: "#8a8a8a" },
  actionRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 },
  action: { fontFamily: "SpaceMono", fontSize: 9, letterSpacing: 3, color: "#8A6A2F" },
  close: { width: 36, height: 44, alignItems: "center", justifyContent: "center" },
});
