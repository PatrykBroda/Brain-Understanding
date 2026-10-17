import React from "react";
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from "react-native-svg";

import { palette } from "@/constants/theme";

/** Thin refined line chart with a soft area wash and a glowing last point. */
export function Sparkline({
  data,
  width = 280,
  height = 64,
  tone = "gold",
}: {
  data: number[];
  width?: number;
  height?: number;
  tone?: "gold" | "red";
}) {
  if (data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const pad = 6;
  const pts = data.map((v, i) => ({
    x: pad + ((width - pad * 2) * i) / (data.length - 1),
    y: pad + (height - pad * 2) * (1 - (v - min) / span),
  }));
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const mx = (a.x + b.x) / 2;
    d += ` C ${mx} ${a.y} ${mx} ${b.y} ${b.x} ${b.y}`;
  }
  const last = pts[pts.length - 1];
  const stroke = tone === "red" ? palette.redLight : palette.goldLight;
  return (
    <Svg width={width} height={height}>
      <Defs>
        <LinearGradient id="spk" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={stroke} stopOpacity={0.22} />
          <Stop offset="1" stopColor={stroke} stopOpacity={0} />
        </LinearGradient>
      </Defs>
      <Path d={`${d} L ${last.x} ${height} L ${pts[0].x} ${height} Z`} fill="url(#spk)" />
      <Path d={d} stroke={stroke} strokeWidth={1.5} fill="none" strokeLinecap="round" />
      <Circle cx={last.x} cy={last.y} r={7} fill={stroke} opacity={0.22} />
      <Circle cx={last.x} cy={last.y} r={3} fill={stroke} />
    </Svg>
  );
}
