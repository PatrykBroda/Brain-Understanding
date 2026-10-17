import React from "react";
import { StyleSheet } from "react-native";
import Svg, { Defs, RadialGradient, Rect, Stop } from "react-native-svg";

export type LightFocus = "topRight" | "topLeft" | "top" | "center" | "bottom";
export type LightTone = "silver" | "champagne";

// Fractions of the layer box. `r` is the horizontal radius; `sy` squashes the
// vertical radius (ry = r * sy in box units) so the pool is broad and asymmetric.
// objectBoundingBox + gradientTransform renders the same on iOS, Android and web
// (web SVG has no rx/ry on radialGradient).
const FOCUS: Record<LightFocus, { cx: number; cy: number; r: number; sy: number }> = {
  topRight: { cx: 0.88, cy: -0.06, r: 1.2, sy: 0.48 },
  topLeft: { cx: 0.06, cy: -0.08, r: 1.2, sy: 0.48 },
  top: { cx: 0.5, cy: -0.1, r: 1.1, sy: 0.46 },
  center: { cx: 0.5, cy: 0.36, r: 1.0, sy: 0.46 },
  bottom: { cx: 0.3, cy: 1.08, r: 1.2, sy: 0.42 },
};

const TONE: Record<LightTone, { core: string; mid: string }> = {
  // smoky silver: cool grey-white
  silver: { core: "#C9CDD2", mid: "#6C7178" },
  // muted champagne
  champagne: { core: "#CDBB8E", mid: "#8A7A52" },
};

/**
 * Atmospheric light: ONE oversized, asymmetric, low-opacity radial gradient
 * (black → smoky silver, or black → muted champagne) concentrated at a single
 * focal point. Purely decorative: absolute, pointer-events none, no layout
 * effect. Put it behind content, never behind long text; one per screen.
 */
export function Atmosphere({
  focus = "topRight",
  tone = "silver",
  intensity = 1,
}: {
  focus?: LightFocus;
  tone?: LightTone;
  /** multiplier on the (already low) base opacity */
  intensity?: number;
}) {
  const f = FOCUS[focus];
  const t = TONE[tone];
  const id = `atm-${focus}-${tone}`;
  return (
    <Svg
      style={StyleSheet.absoluteFill}
      width="100%"
      height="100%"
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Defs>
        <RadialGradient
          id={id}
          gradientUnits="objectBoundingBox"
          cx={f.cx}
          cy={f.cy}
          r={f.r}
          fx={f.cx}
          fy={f.cy}
          gradientTransform={`translate(${f.cx} ${f.cy}) scale(1 ${f.sy}) translate(${-f.cx} ${-f.cy})`}
        >
          <Stop offset="0" stopColor={t.core} stopOpacity={0.16 * intensity} />
          <Stop offset="0.45" stopColor={t.mid} stopOpacity={0.06 * intensity} />
          <Stop offset="1" stopColor={t.mid} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id})`} />
    </Svg>
  );
}
