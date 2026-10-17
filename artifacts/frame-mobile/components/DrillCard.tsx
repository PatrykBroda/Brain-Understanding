import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { fonts, palette, radius } from "@/constants/theme";

export type Drill = {
  title?: string;
  objective?: string;
  startPosition?: string;
  constraint?: string;
  rounds?: string;
  failureCondition?: string;
  progression?: string;
};

const FIELDS: { key: keyof Drill; label: string }[] = [
  { key: "objective", label: "Objective" },
  { key: "startPosition", label: "Start" },
  { key: "constraint", label: "Constraint" },
  { key: "rounds", label: "Rounds" },
  { key: "failureCondition", label: "Failure → Reset" },
  { key: "progression", label: "Progression" },
];

export function DrillCard({ drill }: { drill: Drill }) {
  return (
    <View style={s.card}>
      <View style={s.head}>
        <Text style={s.headLabel}>PRESCRIPTION</Text>
        <Text style={s.headKind}>DRILL</Text>
      </View>
      {drill.title ? <Text style={s.title}>{drill.title}</Text> : null}
      <View style={s.body}>
        {FIELDS.map(({ key, label }) =>
          drill[key] ? (
            <View key={key} style={s.fieldRow}>
              <Text style={s.fieldLabel}>{label}</Text>
              <Text style={s.fieldValue}>{drill[key]}</Text>
            </View>
          ) : null,
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    marginVertical: 10,
    borderWidth: 1,
    borderColor: palette.goldHair,
    borderRadius: radius.md,
    backgroundColor: "rgba(138,106,47,0.10)",
    overflow: "hidden",
  },
  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: palette.hairline,
    backgroundColor: palette.goldWash,
  },
  headLabel: {
    fontFamily: fonts.textMedium,
    fontSize: 10.5,
    letterSpacing: 1.8,
    color: palette.goldLight,
  },
  headKind: {
    fontFamily: fonts.textMedium,
    fontSize: 10.5,
    letterSpacing: 1.4,
    color: palette.textMid,
  },
  title: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 4,
    fontFamily: fonts.displayThin,
    fontSize: 17,
    lineHeight: 21,
    color: palette.textHi,
  },
  body: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 16,
    gap: 12,
  },
  fieldRow: {
    gap: 3,
  },
  fieldLabel: {
    fontFamily: fonts.textMedium,
    fontSize: 10.5,
    letterSpacing: 1.6,
    color: palette.goldLight,
    textTransform: "uppercase",
  },
  fieldValue: {
    fontFamily: fonts.text,
    fontSize: 14.5,
    color: palette.text,
    lineHeight: 21,
  },
});
