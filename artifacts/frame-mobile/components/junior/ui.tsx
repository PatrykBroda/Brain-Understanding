import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View, RefreshControl } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Screen, Button } from "@/components/entry";
import { palette, radius } from "@/constants/entryTheme";
import { RoleBar } from "@/components/junior/RoleBar";

/** One spacing / type scale for every parent, coach and gym screen. */
export const space = { page: 20, gap: 14, card: 16, inner: 10 } as const;
export const type = { title: 28, h: 17, body: 15, small: 13, label: 11 } as const;

import { errMsg } from "@/components/junior/errMsg";
export { errMsg };

export function Page({ title, children, onRefresh, refreshing, roleBar = true, subtitle }: { title: string; children: React.ReactNode; onRefresh?: () => void; refreshing?: boolean; roleBar?: boolean; subtitle?: string }) {
  const insets = useSafeAreaInsets();
  return (
    <Screen light={null}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingTop: insets.top + space.card, paddingHorizontal: space.page, paddingBottom: 120, gap: space.gap }}
        refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={palette.gold} /> : undefined}
      >
        <Text style={s.title} accessibilityRole="header">{title}</Text>
        {subtitle ? <Text style={[s.t, { color: palette.textMid, marginTop: -8 }]}>{subtitle}</Text> : null}
        {roleBar ? <RoleBar /> : null}
        {children}
      </ScrollView>
    </Screen>
  );
}

export function Card({ children }: { children: React.ReactNode }) {
  return <View style={s.card}>{children}</View>;
}
export function H({ children }: { children: React.ReactNode }) {
  return <Text style={s.h}>{children}</Text>;
}
export function T({ children, dim }: { children: React.ReactNode; dim?: boolean }) {
  return <Text style={[s.t, dim && { color: palette.textMid }]}>{children}</Text>;
}
export function Notice({ children }: { children: React.ReactNode }) {
  return (
    <View style={s.notice}>
      <Text style={s.t}>{children}</Text>
    </View>
  );
}
export function ErrorBox({ error, retry }: { error: unknown; retry?: () => void }) {
  return (
    <Card>
      <T>{errMsg(error)}</T>
      {retry ? <Button title="Try again" variant="secondary" onPress={retry} /> : null}
    </Card>
  );
}

/** Section heading between cards (smaller than a card title, same family). */
export function Section({ children }: { children: React.ReactNode }) {
  return <Text style={s.section}>{children}</Text>;
}

/** Friendly empty state: what is missing, and one thing to do about it. */
export function EmptyCard({ title, body, action }: { title: string; body: string; action?: { label: string; onPress: () => void } }) {
  return (
    <View style={s.card} testID="empty-state">
      <Text style={s.h}>{title}</Text>
      <Text style={[s.t, { color: palette.textMid }]}>{body}</Text>
      {action ? <Button title={action.label} variant="secondary" onPress={action.onPress} /> : null}
    </View>
  );
}

/** Numbered "what to do first" card, one per role. */
export function WhatFirst({ title = "What to do first", steps, action }: { title?: string; steps: string[]; action?: { label: string; onPress: () => void } }) {
  return (
    <View style={[s.card, { borderColor: palette.goldHair }]} testID="what-first">
      <Text style={s.h}>{title}</Text>
      {steps.map((st, i) => (
        <View key={i} style={s.stepRow}>
          <Text style={s.stepNo}>{i + 1}</Text>
          <Text style={[s.t, { flex: 1 }]}>{st}</Text>
        </View>
      ))}
      {action ? <Button title={action.label} onPress={action.onPress} /> : null}
    </View>
  );
}

export type PillTone = "wait" | "ok" | "no" | "idle";
const toneColor: Record<PillTone, { fg: string; bg: string }> = {
  wait: { fg: "#E8C46A", bg: "rgba(232,196,106,0.14)" },
  ok: { fg: "#7BD389", bg: "rgba(123,211,137,0.14)" },
  no: { fg: "#F08080", bg: "rgba(240,128,128,0.14)" },
  idle: { fg: "#A0A0A0", bg: "rgba(255,255,255,0.08)" },
};
export function StatusPill({ label, tone }: { label: string; tone: PillTone }) {
  const c = toneColor[tone];
  return (
    <View style={[s.pill, { backgroundColor: c.bg }]}>
      <Text style={[s.pillText, { color: c.fg }]}>{label}</Text>
    </View>
  );
}

/** Week / Month / Term style filter. */
export function Segmented<K extends string>({ value, options, onChange }: { value: K; options: { key: K; label: string }[]; onChange: (k: K) => void }) {
  return (
    <View style={s.seg} accessibilityRole="tablist">
      {options.map((o) => (
        <Pressable key={o.key} onPress={() => onChange(o.key)} style={[s.segItem, value === o.key && s.segOn]} accessibilityRole="tab" accessibilityState={{ selected: value === o.key }}>
          <Text style={[s.segText, value === o.key && { color: "#0B0C0E" }]}>{o.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

/** Big number with a small label under it. */
export function Stat({ value, label }: { value: string | number; label: string }) {
  return (
    <View style={s.stat}>
      <Text style={s.statV}>{value}</Text>
      <Text style={s.statL}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  title: { color: palette.text, fontSize: type.title, fontWeight: "700" },
  card: { backgroundColor: "#121316", borderRadius: radius.lg, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", padding: space.card, gap: space.inner },
  h: { color: palette.text, fontSize: type.h, fontWeight: "600" },
  t: { color: palette.text, fontSize: type.body, lineHeight: 21 },
  section: { color: palette.textMid, fontSize: type.label, letterSpacing: 1.2, textTransform: "uppercase", marginTop: 6 },
  stepRow: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  stepNo: { color: palette.gold, fontSize: type.body, fontWeight: "700", width: 18 },
  pill: { alignSelf: "flex-start", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  pillText: { fontSize: type.small, fontWeight: "600" },
  seg: { flexDirection: "row", backgroundColor: "#121316", borderRadius: 999, padding: 3, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" },
  segItem: { flex: 1, alignItems: "center", paddingVertical: 8, borderRadius: 999 },
  segOn: { backgroundColor: palette.gold },
  segText: { color: palette.textMid, fontSize: type.small, fontWeight: "600" },
  stat: { flex: 1, minWidth: 90 },
  statV: { color: palette.text, fontSize: 24, fontWeight: "700" },
  statL: { color: palette.textMid, fontSize: type.small },
  notice: { backgroundColor: palette.goldWash, borderColor: palette.goldHair, borderWidth: 1, borderRadius: 14, padding: 12 },
});
