import React, { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Feather } from "@expo/vector-icons";

import { GlassCard, haptic } from "@/components/ui";
import { fonts, MIN_TAP, palette, radius } from "@/constants/theme";
import { parseDismissed, pointersKey, pointersToShow, type PointerId } from "@/lib/pointers";

/**
 * Up to three short, dismissible first-use hints. Each one goes away when dismissed or when the
 * athlete has already done the thing it points to.
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
      haptic.select();
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
    <GlassCard padding={0}>
      {shown.map((p, i) => (
        <View key={p.id} style={[s.row, i > 0 && s.rule]}>
          <Pressable
            style={({ pressed }) => [s.main, pressed && { opacity: 0.75 }]}
            onPress={() => {
              haptic.select();
              onAction(p.id);
            }}
            accessibilityRole="button"
            accessibilityLabel={`${p.title}. ${p.body} ${p.action}`}
          >
            <Text style={s.title}>{p.title}</Text>
            <Text style={s.body}>{p.body}</Text>
            <Text style={s.action}>{p.action}</Text>
          </Pressable>
          <Pressable
            onPress={() => dismiss(p.id)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={`Dismiss: ${p.title}`}
            style={s.close}
          >
            <Feather name="x" size={18} color={palette.textLow} />
          </Pressable>
        </View>
      ))}
    </GlassCard>
  );
}


const s = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "flex-start" },
  rule: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.borderStrong },
  main: { flex: 1, paddingHorizontal: 20, paddingVertical: 16, gap: 4 },
  title: { fontFamily: fonts.semi, fontSize: 16, color: palette.textHi },
  body: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 20, color: palette.textMid },
  action: { fontFamily: fonts.medium, fontSize: 14, color: palette.goldPale, marginTop: 6 },
  close: { width: MIN_TAP, height: MIN_TAP, alignItems: "center", justifyContent: "center", marginTop: 6, marginRight: 4, borderRadius: radius.sm },
});
