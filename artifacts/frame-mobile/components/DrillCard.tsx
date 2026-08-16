import React from "react";
import { StyleSheet, Text, View } from "react-native";

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
    borderColor: "rgba(138,106,47,0.30)",
    backgroundColor: "rgba(138,106,47,0.05)",
  },
  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(138,106,47,0.20)",
    backgroundColor: "rgba(138,106,47,0.10)",
  },
  headLabel: {
    fontFamily: "SpaceMono",
    fontSize: 9,
    letterSpacing: 2,
    color: "rgba(138,106,47,0.85)",
  },
  headKind: {
    fontFamily: "SpaceMono",
    fontSize: 9,
    letterSpacing: 1,
    color: "rgba(138,106,47,0.6)",
  },
  title: {
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 4,
    fontFamily: "SpaceMono",
    fontSize: 13,
    letterSpacing: 1,
    color: "#e0e0e0",
  },
  body: {
    paddingHorizontal: 14,
    paddingTop: 6,
    paddingBottom: 14,
    gap: 8,
  },
  fieldRow: {
    gap: 2,
  },
  fieldLabel: {
    fontFamily: "SpaceMono",
    fontSize: 9,
    letterSpacing: 2,
    color: "#666",
  },
  fieldValue: {
    fontFamily: "Outfit",
    fontSize: 14,
    color: "#cdcdcd",
    lineHeight: 20,
  },
});
