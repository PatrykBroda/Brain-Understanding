import React from "react";
import Svg, { Circle, Polygon } from "react-native-svg";
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
  /** Full spin duration in ms. Lower = faster. */
  durationMs?: number;
}

function octagonPoints(radius: number, rotationDeg = 22.5): string {
  const pts: string[] = [];
  for (let i = 0; i < 8; i++) {
    const angle = ((rotationDeg + i * 45) * Math.PI) / 180;
    const x = radius * Math.cos(angle);
    const y = radius * Math.sin(angle);
    pts.push(`${x.toFixed(2)},${y.toFixed(2)}`);
  }
  return pts.join(" ");
}

/**
 * FRAME loading mark — the same woven octagon the web prototype uses
 * (components/frame-octagon): an outer octagon layered with 8 inner octagons,
 * each offset 5.625°, plus a filled center dot. Stroke-only so it reads as a
 * slowly rotating mandala. Defaults to white to mirror the prototype's
 * currentColor render.
 */
export function OctagonSpinner({
  size = 20,
  color = "#EDEDED",
  durationMs = 4000,
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

  const half = size / 2;
  const outerR = half * 0.96;
  const innerR = half * 0.72;
  const strokeOuter = Math.max(0.8, size / 64);
  const strokeInner = Math.max(0.5, size / 110);

  return (
    <Animated.View style={[{ width: size, height: size }, animStyle]}>
      <Svg
        width={size}
        height={size}
        viewBox={`${-half} ${-half} ${size} ${size}`}
      >
        <Polygon
          points={octagonPoints(outerR)}
          fill="none"
          stroke={color}
          strokeWidth={strokeOuter}
          opacity={0.95}
        />
        {Array.from({ length: 8 }).map((_, i) => (
          <Polygon
            key={i}
            points={octagonPoints(innerR, 22.5 + i * (45 / 8))}
            fill="none"
            stroke={color}
            strokeWidth={strokeInner}
            opacity={0.55 + (i % 2) * 0.18}
          />
        ))}
        <Circle cx={0} cy={0} r={innerR * 0.06} fill={color} opacity={0.8} />
      </Svg>
    </Animated.View>
  );
}
