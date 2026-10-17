import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { fonts, palette, radius } from "@/constants/theme";

/**
 * Shared anatomy for structured coach replies (drill / breath / regulate):
 * solid card, a small kind label (+ optional right meta), a title, then
 * labelled rows separated by hairlines. No glow, no tint wash.
 */
export function BlockCard({
  kind,
  meta,
  title,
  subtitle,
  children,
}: {
  kind: string;
  meta?: string;
  title?: string;
  subtitle?: string;
  children?: React.ReactNode;
}) {
  return (
    <View style={s.card}>
      <View style={s.head}>
        <View style={s.kindRow}>
          <View style={s.kindDot} />
          <Text style={s.kind}>{kind}</Text>
        </View>
        {meta ? <Text style={s.meta}>{meta}</Text> : null}
      </View>
      {title ? <Text style={s.title}>{title}</Text> : null}
      {subtitle ? <Text style={s.subtitle}>{subtitle}</Text> : null}
      {children}
    </View>
  );
}

/** One labelled row inside a BlockCard. */
export function BlockRow({ label, value, first }: { label: string; value: string; first?: boolean }) {
  return (
    <View style={[s.row, !first && s.rowRule]}>
      <Text style={s.rowLabel}>{label}</Text>
      <Text style={s.rowValue}>{value}</Text>
    </View>
  );
}

export const blockStyles = {
  pad: 16,
};

const s = StyleSheet.create({
  card: {
    marginVertical: 12,
    borderWidth: 1,
    borderColor: palette.borderStrong,
    borderRadius: radius.lg,
    backgroundColor: palette.surface,
    overflow: "hidden",
    paddingBottom: 4,
  },
  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 14,
  },
  kindRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  kindDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: palette.gold },
  kind: { fontFamily: fonts.medium, fontSize: 13, color: palette.textMid },
  meta: { fontFamily: fonts.medium, fontSize: 13, color: palette.textMid, fontVariant: ["tabular-nums"] },
  title: {
    paddingHorizontal: 16,
    paddingTop: 8,
    fontFamily: fonts.semi,
    fontSize: 19,
    lineHeight: 25,
    letterSpacing: -0.3,
    color: palette.textHi,
  },
  subtitle: {
    paddingHorizontal: 16,
    paddingTop: 4,
    fontFamily: fonts.regular,
    fontSize: 14,
    lineHeight: 20,
    color: palette.textMid,
  },
  row: { paddingHorizontal: 16, paddingVertical: 12, gap: 3 },
  rowRule: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.borderStrong },
  rowLabel: { fontFamily: fonts.medium, fontSize: 13, color: palette.textMid },
  rowValue: { fontFamily: fonts.regular, fontSize: 15.5, lineHeight: 22, color: palette.textHi },
});
