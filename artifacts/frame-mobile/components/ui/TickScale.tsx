import React from "react";
import { View } from "react-native";
import Svg, { Circle, Line } from "react-native-svg";

import { palette } from "@/constants/theme";

/**
 * Horizontal tick-mark scale (like a ruler / dial rim) with a glowing marker.
 * `value` 0..max. Used for linear scores where a full gauge would be heavy.
 */
export function TickScale({
  value,
  max = 100,
  width = 280,
  height = 34,
  ticks = 41,
  tone = "gold",
}: {
  value: number;
  max?: number;
  width?: number;
  height?: number;
  ticks?: number;
  tone?: "gold" | "red";
}) {
  const pct = Math.max(0, Math.min(1, max > 0 ? value / max : 0));
  const lit = tone === "red" ? palette.redLight : palette.goldLight;
  const x = 6 + (width - 12) * pct;
  return (
    <View accessible accessibilityRole="progressbar" accessibilityValue={{ min: 0, max, now: Math.round(value) }}>
      <Svg width={width} height={height}>
        {Array.from({ length: ticks }, (_, i) => {
          const tx = 6 + ((width - 12) * i) / (ticks - 1);
          const major = i % 5 === 0;
          const on = tx <= x;
          return (
            <Line
              key={i}
              x1={tx}
              x2={tx}
              y1={height - (major ? 16 : 10)}
              y2={height - 2}
              stroke={on ? lit : "rgba(255,244,224,0.20)"}
              strokeWidth={major ? 1.4 : 1}
              strokeLinecap="round"
            />
          );
        })}
        <Circle cx={x} cy={height - 20} r={6} fill={lit} opacity={0.25} />
        <Circle cx={x} cy={height - 20} r={3} fill={lit} />
      </Svg>
    </View>
  );
}
