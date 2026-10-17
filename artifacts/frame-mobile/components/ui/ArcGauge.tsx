import React, { useEffect, useRef, useState } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, G, Path } from "react-native-svg";

import { fonts, palette } from "@/constants/theme";
import { useReducedMotion } from "./motion";

function polar(cx: number, cy: number, r: number, deg: number) {
  const a = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}
function arc(cx: number, cy: number, r: number, from: number, to: number) {
  const s = polar(cx, cy, r, from);
  const e = polar(cx, cy, r, to);
  return `M ${s.x} ${s.y} A ${r} ${r} 0 ${to - from > 180 ? 1 : 0} 1 ${e.x} ${e.y}`;
}

/**
 * 240° dial: tick-mark rim, thin track, bronze (or crimson) value arc with a
 * glowing end knob and an oversized thin numeral in the middle.
 * `value` 0..max. Pure SVG; the sweep animates once unless motion is reduced.
 */
export function ArcGauge({
  value,
  max = 100,
  size = 220,
  label,
  unit,
  tone = "gold",
  display,
}: {
  value: number;
  max?: number;
  size?: number;
  label?: string;
  unit?: string;
  tone?: "gold" | "red";
  /** override the centre text (defaults to rounded value) */
  display?: string;
}) {
  const reduced = useReducedMotion();
  const pct = Math.max(0, Math.min(1, max > 0 ? value / max : 0));
  const sweep = useRef(new Animated.Value(0)).current;
  const [p, setP] = useState(0);
  useEffect(() => {
    const id = sweep.addListener(({ value: v }) => setP(v));
    if (reduced) {
      sweep.setValue(pct);
    } else {
      Animated.timing(sweep, {
        toValue: pct,
        duration: 600,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }).start();
    }
    return () => sweep.removeListener(id);
  }, [pct, reduced, sweep]);

  const START = -120;
  const END = 120;
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 12;
  const valDeg = START + (END - START) * p;
  const hi = tone === "red" ? palette.redText : palette.gold;
  const knob = polar(cx, cy, r, valDeg);
  const text = display ?? String(Math.round(value));
  return (
    <View
      style={{ width: size, height: size * 0.86 }}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={`${label ?? "Score"} ${text}${unit ? " " + unit : ""}`}
      accessibilityValue={{ min: 0, max, now: Math.round(value) }}
    >
      <Svg width={size} height={size}>
        <Path
          d={arc(cx, cy, r, START, END)}
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={6}
          fill="none"
          strokeLinecap="round"
        />
        {p > 0.003 ? (
          <Path
            d={arc(cx, cy, r, START, valDeg)}
            stroke={hi}
            strokeWidth={6}
            fill="none"
            strokeLinecap="round"
          />
        ) : null}
        <G>
          <Circle cx={knob.x} cy={knob.y} r={5} fill={palette.textHi} />
        </G>
      </Svg>
      <View style={[StyleSheet.absoluteFill, styles.center]} pointerEvents="none">
        <Text style={[styles.num, { fontSize: size * 0.28, lineHeight: size * 0.32 }]}>{text}</Text>
        {unit ? <Text style={styles.unit}>{unit}</Text> : null}
        {label ? <Text style={styles.label}>{label}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: "center", justifyContent: "center", paddingBottom: 6 },
  num: { fontFamily: fonts.semi, color: palette.textHi, letterSpacing: -2, includeFontPadding: false, fontVariant: ["tabular-nums"] },
  unit: { fontFamily: fonts.text, fontSize: 12, color: palette.textMid, marginTop: 2 },
  label: { fontFamily: fonts.medium, fontSize: 13, color: palette.textMid, marginTop: 4 },
});
