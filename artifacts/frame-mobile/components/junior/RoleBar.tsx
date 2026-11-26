import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSegments } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";
import { palette } from "@/constants/entryTheme";
import { useRoleSwitch } from "@/components/junior/useRoleSwitch";
import type { JuniorMe, JuniorRole } from "@/lib/junior";

const LABEL: Record<JuniorRole, string> = { athlete: "Athlete", parent: "Parent", coach: "Coach" };

/**
 * THE role switcher. One control, used at the top of every parent / coach page and on the athlete Profile,
 * so it feels like one app with extra layers: tap a layer to switch. Hidden when the account has one layer.
 */
export function RoleBar({ current }: { current?: JuniorRole }) {
  const me = useQuery<JuniorMe>({ queryKey: ["junior", "me"], queryFn: () => apiGet<JuniorMe>("/junior/me"), retry: false });
  const { switchTo, busy, consentModal } = useRoleSwitch();
  const segments = useSegments() as string[];
  const layer: JuniorRole | undefined = segments[0] === "(coach)" ? "coach" : segments[0] === "(parent)" ? "parent" : segments[0] === "(tabs)" ? "athlete" : undefined;
  const roles = (me.data?.roles ?? []) as JuniorRole[];
  if (roles.length < 2) return null;
  const active: JuniorRole = current ?? layer ?? me.data?.activeRole ?? "athlete";
  const order: JuniorRole[] = (["athlete", "parent", "coach"] as const).filter((r) => roles.includes(r));
  return (
    <View style={s.bar} testID="role-switcher" accessibilityRole="tablist">
      {order.map((r) => {
        const on = r === active;
        return (
          <Pressable
            key={r}
            disabled={busy}
            onPress={() => (on ? undefined : void switchTo(r))}
            style={[s.item, on && s.on]}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={`${LABEL[r]} view`}
          >
            <Text style={[s.text, on && { color: "#0B0C0E" }]} numberOfLines={1}>{LABEL[r]}</Text>
          </Pressable>
        );
      })}
      {consentModal}
    </View>
  );
}

const s = StyleSheet.create({
  bar: { flexDirection: "row", backgroundColor: "#121316", borderRadius: 999, padding: 3, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" },
  item: { flex: 1, alignItems: "center", paddingVertical: 8, borderRadius: 999 },
  on: { backgroundColor: palette.gold },
  text: { color: palette.textMid, fontSize: 13, fontWeight: "600" },
});
