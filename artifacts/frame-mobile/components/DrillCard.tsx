import React from "react";
import { View } from "react-native";

import { BlockCard, BlockRow } from "@/components/BlockCard";

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
  { key: "startPosition", label: "Start position" },
  { key: "constraint", label: "Constraint" },
  { key: "rounds", label: "Rounds" },
  { key: "failureCondition", label: "If it fails" },
  { key: "progression", label: "Progression" },
];

export function DrillCard({ drill }: { drill: Drill }) {
  const rows = FIELDS.filter(({ key }) => !!drill[key]);
  return (
    <BlockCard kind="Drill" title={drill.title}>
      <View style={{ marginTop: 10 }}>
        {rows.map(({ key, label }, i) => (
          <BlockRow key={key} label={label} value={String(drill[key])} first={i === 0} />
        ))}
      </View>
    </BlockCard>
  );
}
