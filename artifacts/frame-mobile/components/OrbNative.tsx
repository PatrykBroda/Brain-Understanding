import React, { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Circle, Ellipse, Defs, RadialGradient, Stop, G, ClipPath } from "react-native-svg";
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

/**
 * Native FRAME orb — a react-native-svg + reanimated re-creation of the
 * website's WebGL CosmicOrb. Renders fully offline (no WebView / network):
 * dark lit sphere, amber Fresnel-style rim + soft atmosphere, orbital rings,
 * and a sparkle field. Per-state palette mirrors the web VISUALS table.
 */

type OrbState =
  | "Dormant"
  | "Stable"
  | "Loaded"
  | "Recovering"
  | "Tight"
  | "Volatile"
  | "Composed"
  | "Overextended";

interface Cfg {
  hue: number;
  sat: number;
  light: number;
  ringSpeed: number; // higher = faster orbit
  breathMs: number;
  sparkles: number;
  glow: number; // 0..1 overall emissive intensity
}

// Ported from coach/src/components/cosmic-orb.tsx VISUALS — dark & sinister:
// crimson void for dormant/recovering/overextended, faded gold for active.
const VISUALS: Record<OrbState, Cfg> = {
  Dormant:      { hue: 0,   sat: 0.12, light: 0.16, ringSpeed: 0.06, breathMs: 3600, sparkles: 8,  glow: 0.22 },
  Stable:       { hue: 32,  sat: 0.28, light: 0.40, ringSpeed: 0.16, breathMs: 2600, sparkles: 16, glow: 0.50 },
  Loaded:       { hue: 22,  sat: 0.50, light: 0.44, ringSpeed: 0.28, breathMs: 2000, sparkles: 24, glow: 0.72 },
  Recovering:   { hue: 358, sat: 0.22, light: 0.24, ringSpeed: 0.07, breathMs: 3400, sparkles: 10, glow: 0.30 },
  Tight:        { hue: 38,  sat: 0.30, light: 0.38, ringSpeed: 0.36, breathMs: 1700, sparkles: 16, glow: 0.52 },
  Volatile:     { hue: 4,   sat: 0.64, light: 0.42, ringSpeed: 0.46, breathMs: 1300, sparkles: 30, glow: 0.92 },
  Composed:     { hue: 35,  sat: 0.48, light: 0.44, ringSpeed: 0.18, breathMs: 2400, sparkles: 20, glow: 0.66 },
  Overextended: { hue: 0,   sat: 0.08, light: 0.14, ringSpeed: 0.04, breathMs: 4000, sparkles: 6,  glow: 0.20 },
};

const clamp = (v: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
const hsl = (h: number, s: number, l: number) =>
  `hsl(${Math.round(((h % 360) + 360) % 360)}, ${Math.round(clamp(s) * 100)}%, ${Math.round(clamp(l) * 100)}%)`;

// Deterministic sparkle layout (stable across renders). Angle + normalised
// radius + timing, so the field looks scattered but never reshuffles.
const SPARKLE_SEED = Array.from({ length: 30 }, (_, i) => {
  const a = (i * 137.508 * Math.PI) / 180; // golden-angle spiral
  const rad = 0.34 + ((i * 61) % 100) / 100 * 0.2; // 0.34..0.54 of size
  return {
    angle: a,
    radius: rad,
    dot: 1 + ((i * 17) % 3), // 1..3 px
    delay: (i * 231) % 1800,
    dur: 1400 + ((i * 97) % 1600),
  };
});

// Subtle orbital rings — thin and hugging the sphere (the web torus stack reads
// quiet; the dominant feature is the wireframe, not Saturn rings).
const RINGS = [
  { rx: 0.375, ry: 0.130, tilt: 12,  durBase: 11000, dir: 1,  op: 0.55, w: 1.1 },
  { rx: 0.400, ry: 0.225, tilt: -30, durBase: 14000, dir: -1, op: 0.36, w: 1.0 },
  { rx: 0.405, ry: 0.085, tilt: 62,  durBase: 17000, dir: 1,  op: 0.28, w: 0.9 },
];

// Geodesic-style wireframe over the sphere: meridians (longitude, as vertical
// ellipses of decreasing width) + parallels (latitude, as flattened horizontal
// ellipses at descending heights). Clipped to the sphere so it reads as a globe.
const MERIDIANS = [0.80, 0.55, 0.28]; // rx as a fraction of the core radius
const PARALLELS = [58, 30, 0, -30, -58]; // latitude in degrees; 0 = bright equator

interface Props {
  state?: OrbState;
  size?: number;
}

function Ring({
  ring,
  size,
  color,
  speed,
}: {
  ring: (typeof RINGS)[number];
  size: number;
  color: string;
  speed: number;
}) {
  const rot = useSharedValue(0);
  const c = size / 2;
  // Faster state -> shorter duration. speed ~0.04..0.46 -> factor.
  const duration = ring.durBase / (0.4 + speed * 1.6);

  useEffect(() => {
    rot.value = 0;
    rot.value = withRepeat(
      withTiming(360 * ring.dir, { duration, easing: Easing.linear }),
      -1,
      false,
    );
  }, [duration, ring.dir]);

  const style = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rot.value}deg` }],
  }));

  return (
    <Animated.View style={[StyleSheet.absoluteFill, style]} pointerEvents="none">
      <Svg width={size} height={size}>
        <Ellipse
          cx={c}
          cy={c}
          rx={ring.rx * size}
          ry={ring.ry * size}
          stroke={color}
          strokeOpacity={ring.op}
          strokeWidth={ring.w}
          fill="none"
          rotation={ring.tilt}
          origin={`${c}, ${c}`}
        />
      </Svg>
    </Animated.View>
  );
}

function Sparkle({
  seed,
  size,
  color,
}: {
  seed: (typeof SPARKLE_SEED)[number];
  size: number;
  color: string;
}) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withDelay(
      seed.delay,
      withRepeat(withTiming(1, { duration: seed.dur, easing: Easing.inOut(Easing.sin) }), -1, true),
    );
  }, []);

  const c = size / 2;
  const x = c + Math.cos(seed.angle) * seed.radius * size - seed.dot / 2;
  const y = c + Math.sin(seed.angle) * seed.radius * size - seed.dot / 2;

  const style = useAnimatedStyle(() => ({
    opacity: interpolate(t.value, [0, 1], [0.08, 0.7]),
    transform: [{ scale: interpolate(t.value, [0, 1], [0.6, 1]) }],
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: "absolute",
          left: x,
          top: y,
          width: seed.dot,
          height: seed.dot,
          borderRadius: seed.dot / 2,
          backgroundColor: color,
        },
        style,
      ]}
    />
  );
}

export function OrbNative({ state = "Dormant", size = 200 }: Props) {
  const cfg = VISUALS[state] ?? VISUALS.Dormant;
  const c = size / 2;
  const rCore = 0.335 * size;

  const glowColor = hsl(cfg.hue, cfg.sat, cfg.light + 0.2);
  const ringColor = hsl(cfg.hue, cfg.sat * 0.75, cfg.light + 0.22);
  const rimColor = hsl(cfg.hue, cfg.sat, cfg.light + 0.18);
  const coreHi = hsl(cfg.hue, cfg.sat * 0.5, Math.max(0.06, cfg.light * 0.5));
  const coreMid = hsl(cfg.hue, cfg.sat * 0.5, cfg.light * 0.18);
  const sparkleColor = hsl(cfg.hue, cfg.sat, cfg.light + 0.15);
  const wireColor = hsl(cfg.hue, cfg.sat * 0.7, cfg.light + 0.16);
  const equatorColor = hsl(cfg.hue, cfg.sat * 0.4, cfg.light + 0.34);
  const wireOp = 0.08 + cfg.glow * 0.18;

  // Breathing (shared by core scale + glow).
  const breath = useSharedValue(0);
  useEffect(() => {
    breath.value = withRepeat(
      withTiming(1, { duration: cfg.breathMs, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
  }, [cfg.breathMs]);

  const glowStyle = useAnimatedStyle(() => ({
    opacity: interpolate(breath.value, [0, 1], [0.75, 1]),
    transform: [{ scale: interpolate(breath.value, [0, 1], [0.98, 1.06]) }],
  }));
  const coreStyle = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(breath.value, [0, 1], [0.985, 1.02]) }],
  }));

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      {/* Outer atmosphere / glow */}
      <Animated.View style={[StyleSheet.absoluteFill, glowStyle]} pointerEvents="none">
        <Svg width={size} height={size}>
          <Defs>
            <RadialGradient id="glow" cx="50%" cy="50%" r="50%">
              <Stop offset="0%" stopColor={glowColor} stopOpacity={cfg.glow * 0.55} />
              <Stop offset="42%" stopColor={glowColor} stopOpacity={cfg.glow * 0.16} />
              <Stop offset="72%" stopColor={glowColor} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Circle cx={c} cy={c} r={0.5 * size} fill="url(#glow)" />
        </Svg>
      </Animated.View>

      {/* Orbital rings */}
      {RINGS.map((ring, i) => (
        <Ring key={i} ring={ring} size={size} color={ringColor} speed={cfg.ringSpeed} />
      ))}

      {/* Core sphere + rim */}
      <Animated.View style={[StyleSheet.absoluteFill, coreStyle]} pointerEvents="none">
        <Svg width={size} height={size}>
          <Defs>
            <RadialGradient id="core" cx="38%" cy="32%" r="75%">
              <Stop offset="0%" stopColor={coreHi} stopOpacity={1} />
              <Stop offset="46%" stopColor={coreMid} stopOpacity={1} />
              <Stop offset="100%" stopColor="#000000" stopOpacity={1} />
            </RadialGradient>
            <RadialGradient id="rimGlow" cx="50%" cy="50%" r="50%">
              <Stop offset="70%" stopColor={rimColor} stopOpacity={0} />
              <Stop offset="92%" stopColor={rimColor} stopOpacity={cfg.glow * 0.55} />
              <Stop offset="100%" stopColor={rimColor} stopOpacity={0} />
            </RadialGradient>
            <ClipPath id="sphereClip">
              <Circle cx={c} cy={c} r={rCore} />
            </ClipPath>
          </Defs>

          {/* Inner fresnel bloom just inside the sphere edge */}
          <Circle cx={c} cy={c} r={rCore * 1.14} fill="url(#rimGlow)" />
          {/* Dark lit core */}
          <Circle cx={c} cy={c} r={rCore} fill="url(#core)" />

          {/* Geodesic wireframe globe (clipped to the sphere) */}
          <G clipPath="url(#sphereClip)">
            {/* Meridians — longitude lines */}
            {MERIDIANS.map((m, i) => (
              <Ellipse
                key={`m${i}`}
                cx={c}
                cy={c}
                rx={rCore * m}
                ry={rCore}
                stroke={wireColor}
                strokeOpacity={wireOp}
                strokeWidth={0.7}
                fill="none"
              />
            ))}
            {/* Parallels — latitude lines; equator (0deg) rendered brighter */}
            {PARALLELS.map((deg, i) => {
              const rad = (deg * Math.PI) / 180;
              const rx = rCore * Math.cos(rad);
              const cy = c - rCore * Math.sin(rad);
              const isEq = deg === 0;
              return (
                <Ellipse
                  key={`p${i}`}
                  cx={c}
                  cy={cy}
                  rx={rx}
                  ry={Math.max(2, rx * 0.14)}
                  stroke={isEq ? equatorColor : wireColor}
                  strokeOpacity={isEq ? clamp(0.3 + cfg.glow * 0.4) : wireOp}
                  strokeWidth={isEq ? 1.1 : 0.7}
                  fill="none"
                />
              );
            })}
          </G>

          {/* Crisp amber rim */}
          <Circle
            cx={c}
            cy={c}
            r={rCore}
            stroke={rimColor}
            strokeOpacity={clamp(0.35 + cfg.glow * 0.6)}
            strokeWidth={1.6}
            fill="none"
          />
          {/* Specular highlight — sells the 3D lit sphere */}
          <Ellipse
            cx={c - rCore * 0.32}
            cy={c - rCore * 0.38}
            rx={rCore * 0.34}
            ry={rCore * 0.22}
            fill={hsl(cfg.hue, cfg.sat * 0.4, cfg.light + 0.32)}
            opacity={0.12 + cfg.glow * 0.1}
            rotation={-28}
            origin={`${c - rCore * 0.32}, ${c - rCore * 0.38}`}
          />
        </Svg>
      </Animated.View>

      {/* Sparkle field */}
      {SPARKLE_SEED.slice(0, cfg.sparkles).map((seed, i) => (
        <Sparkle key={i} seed={seed} size={size} color={sparkleColor} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
  },
});
