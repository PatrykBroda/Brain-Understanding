import React from "react";
import { View } from "react-native";
import Svg, { Line, Rect } from "react-native-svg";

import { palette } from "@/constants/theme";

/**
 * Linear score bar: hairline track, solid fill, quartile ticks. `value` 0..max.
 * (Name kept from v2; no glow, no dense rim.)
 */
export function TickScale({
  value,
  max = 100,
  width = 280,
  height = 14,
  tone = "gold",
}: {
  value: number;
  max?: number;
  width?: number;
  height?: number;
  /** @deprecated ignored */
  ticks?: number;
  tone?: "gold" | "red";
}) {
  const pct = Math.max(0, Math.min(1, max > 0 ? value / max : 0));
  const fill = tone === "red" ? palette.redText : palette.gold;
  const barH = 4;
  const y = (height - barH) / 2;
  return (
    <View accessible accessibilityRole="progressbar" accessibilityValue={{ min: 0, max, now: Math.round(value) }}>
      <Svg width={width} height={height}>
        <Rect x={0} y={y} width={width} height={barH} rx={2} fill="rgba(255,255,255,0.08)" />
        {pct > 0 ? <Rect x={0} y={y} width={Math.max(barH, width * pct)} height={barH} rx={2} fill={fill} /> : null}
        {[0.25, 0.5, 0.75].map((q) => (
          <Line key={q} x1={width * q} x2={width * q} y1={y - 2} y2={y + barH + 2} stroke="rgba(255,255,255,0.14)" strokeWidth={1} />
        ))}
      </Svg>
    </View>
  );
}
