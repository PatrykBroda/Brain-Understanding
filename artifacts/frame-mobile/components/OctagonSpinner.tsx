import React, { useMemo } from "react";
import Svg, { Polygon } from "react-native-svg";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

interface Props {
  size?: number;
  color?: string;
  strokeWidth?: number;
  /** Full spin duration in ms. Lower = faster. */
  durationMs?: number;
}

/**
 * FRAME loading indicator — a rotating octagon (the cage). Replaces the default
 * radial ActivityIndicator so the "thinking" state reads on-brand. A dim
 * octagon outline sits under a single bright arc that travels the perimeter as
 * the whole shape spins; the octagon's 8-fold symmetry keeps the outline
 * apparently still while the highlight sweeps.
 */
export function OctagonSpinner({
  size = 20,
  color = "#C9883A",
  strokeWidth = 2,
  durationMs = 1100,
}: Props) {
  const spin = useSharedValue(0);

  React.useEffect(() => {
    spin.value = withRepeat(
      withTiming(1, { duration: durationMs, easing: Easing.linear }),
      -1,
      false,
    );
  }, [durationMs, spin]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${spin.value * 360}deg` }],
  }));

  const { points, perimeter } = useMemo(() => {
    const r = size / 2 - strokeWidth;
    const cx = size / 2;
    const cy = size / 2;
    const verts: Array<[number, number]> = [];
    // Flat-topped octagon: 8 vertices, first offset by 22.5°.
    for (let i = 0; i < 8; i++) {
      const a = Math.PI / 8 + (i * Math.PI) / 4;
      verts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
    const side = r * 2 * Math.sin(Math.PI / 8);
    return {
      points: verts.map(([x, y]) => `${x},${y}`).join(" "),
      perimeter: side * 8,
    };
  }, [size, strokeWidth]);

  const arc = perimeter * 0.3;

  return (
    <Animated.View style={[{ width: size, height: size }, animStyle]}>
      <Svg width={size} height={size}>
        <Polygon
          points={points}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeOpacity={0.22}
        />
        <Polygon
          points={points}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${arc}, ${perimeter}`}
        />
      </Svg>
    </Animated.View>
  );
}
