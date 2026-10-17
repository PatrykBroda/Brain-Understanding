import React from "react";
import { StyleSheet } from "react-native";
import Svg, { Defs, RadialGradient, Rect, Stop } from "react-native-svg";

export type LightFocus = "topRight" | "topLeft" | "top" | "center" | "bottom";
export type LightTone = "silver" | "champagne";

const FOCUS: Record<LightFocus, { cx: string; cy: string; rx: string; ry: string }> = {
  topRight: { cx: "88%", cy: "-6%", rx: "120%", ry: "58%" },
  topLeft: { cx: "6%", cy: "-8%", rx: "120%", ry: "56%" },
  top: { cx: "50%", cy: "-10%", rx: "110%", ry: "52%" },
  center: { cx: "50%", cy: "36%", rx: "100%", ry: "46%" },
  bottom: { cx: "30%", cy: "108%", rx: "120%", ry: "50%" },
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
        <RadialGradient id={id} cx={f.cx} cy={f.cy} rx={f.rx} ry={f.ry} fx={f.cx} fy={f.cy}>
          <Stop offset="0" stopColor={t.core} stopOpacity={0.16 * intensity} />
          <Stop offset="0.45" stopColor={t.mid} stopOpacity={0.06 * intensity} />
          <Stop offset="1" stopColor={t.mid} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id})`} />
    </Svg>
  );
}
