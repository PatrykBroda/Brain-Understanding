/**
 * FrameOrb — SVG-based 3D nervous-system orb for the mobile home screen.
 *
 * Replicates the web CosmicOrb look using react-native-svg + Reanimated:
 *   • Animated meridian ellipses → rotating wireframe sphere illusion
 *   • Latitude circles          → geodesic-grid depth
 *   • 5 orbital rings           → tilted torus arcs at various inclinations
 *   • Fresnel-style rim glow    → SVG radial gradient
 *   • State-driven colour/speed → mirrors web VISUALS config
 */
import React from "react";
import Animated, {
  useSharedValue,
  withRepeat,
  withTiming,
  Easing,
  useAnimatedProps,
  type SharedValue,
} from "react-native-reanimated";
import Svg, {
  Circle,
  Defs,
  Ellipse,
  RadialGradient,
  Stop,
} from "react-native-svg";
import { View } from "react-native";

// ── Types ─────────────────────────────────────────────────────────────────────

export type OrbState =
  | "Dormant"
  | "Stable"
  | "Loaded"
  | "Recovering"
  | "Tight"
  | "Volatile"
  | "Composed"
  | "Overextended";

interface OrbCfg {
  hue: number;        // 0-360
  sat: number;        // 0-1
  light: number;      // 0-1
  rotMs: number;      // ms per full sphere rotation
  ringMs: number;     // ms per full ring rotation
  wireAlpha: number;  // wireframe opacity
  rimAlpha: number;   // rim glow opacity
}

// Mirror web VISUALS (dark / sinister palette — crimson void for dormant,
// faded gold for active states).
const VISUALS: Record<OrbState, OrbCfg> = {
  Dormant:      { hue: 0,   sat: 0.12, light: 0.16, rotMs: 28000, ringMs: 42000, wireAlpha: 0.11, rimAlpha: 0.28 },
  Stable:       { hue: 32,  sat: 0.24, light: 0.36, rotMs: 13000, ringMs: 19000, wireAlpha: 0.22, rimAlpha: 0.55 },
  Loaded:       { hue: 22,  sat: 0.48, light: 0.40, rotMs:  7500, ringMs: 11000, wireAlpha: 0.32, rimAlpha: 0.70 },
  Recovering:   { hue: 358, sat: 0.20, light: 0.20, rotMs: 30000, ringMs: 46000, wireAlpha: 0.13, rimAlpha: 0.33 },
  Tight:        { hue: 38,  sat: 0.28, light: 0.34, rotMs:  5500, ringMs:  8500, wireAlpha: 0.24, rimAlpha: 0.50 },
  Volatile:     { hue: 4,   sat: 0.62, light: 0.38, rotMs:  3800, ringMs:  5800, wireAlpha: 0.42, rimAlpha: 0.76 },
  Composed:     { hue: 35,  sat: 0.46, light: 0.40, rotMs: 10500, ringMs: 16000, wireAlpha: 0.28, rimAlpha: 0.60 },
  Overextended: { hue: 0,   sat: 0.08, light: 0.12, rotMs: 38000, ringMs: 58000, wireAlpha: 0.07, rimAlpha: 0.18 },
};

// ── Colour helpers ─────────────────────────────────────────────────────────────

function hsl(h: number, s: number, l: number, a = 1): string {
  return `hsla(${Math.round(h)},${Math.round(s * 100)}%,${Math.round(l * 100)}%,${a})`;
}

// ── Geometry constants ─────────────────────────────────────────────────────────
// ViewBox 0 0 300 300, sphere centre (150, 150), sphere radius R.
// Rings extend beyond the viewBox and are naturally clipped — intentional.

const VB = 300;
const CX = 150;
const CY = 150;
const R  = 100; // sphere radius in viewBox units

// 10 meridian great-circles, evenly spaced across 0..π
const N_MERIDIANS = 10;
const MERIDIAN_PHASES = Array.from({ length: N_MERIDIANS }, (_, i) => (i * Math.PI) / N_MERIDIANS);

// Latitude circles: y-offset as fraction of R, clipped naturally since rx < R
const LATITUDES: { yFrac: number; alpha: number }[] = [
  { yFrac: -0.65, alpha: 0.55 },
  { yFrac: -0.30, alpha: 0.70 },
  { yFrac:  0,    alpha: 0.80 },
  { yFrac:  0.30, alpha: 0.70 },
  { yFrac:  0.65, alpha: 0.55 },
];

// Orbital rings: rx/ry in viewBox units, initial degree offset, rotation speed multiplier.
// Derived from Three.js torus radii (1.42, 1.60, 1.78, 1.96, 2.16) × R
// and inclination angles matching the web CosmicOrb's ring rotations.
const RING_DEFS = [
  { rx: R * 1.42, ry: R * 0.072, deg:   0, speed:  1.00, alpha: 0.72 }, // near-equatorial
  { rx: R * 1.60, ry: R * 0.600, deg:  22, speed:  0.68, alpha: 0.58 },
  { rx: R * 1.78, ry: R * 0.400, deg:  60, speed: -0.52, alpha: 0.48 },
  { rx: R * 1.96, ry: R * 0.700, deg: 100, speed: -0.44, alpha: 0.38 },
  { rx: R * 2.16, ry: R * 0.900, deg: 145, speed:  0.32, alpha: 0.28 },
] as const;

// ── Animated sub-components ───────────────────────────────────────────────────

const AnimatedEllipse = Animated.createAnimatedComponent(Ellipse);

/** One meridian ellipse — rx animated from 0→R as the sphere rotates. */
function MeridianLine({
  rotation,
  basePhase,
  stroke,
  opacity,
}: {
  rotation: SharedValue<number>;
  basePhase: number;
  stroke: string;
  opacity: number;
}) {
  const props = useAnimatedProps(() => {
    const phi = rotation.value * Math.PI * 2;
    const rx = R * Math.abs(Math.cos(basePhase + phi));
    return { rx: Math.max(0.2, rx), ry: R };
  });
  return (
    <AnimatedEllipse
      cx={CX}
      cy={CY}
      stroke={stroke}
      strokeWidth={0.6}
      fill="none"
      opacity={opacity}
      animatedProps={props}
    />
  );
}

/** One orbital ring — slowly rotates in the image plane. */
function OrbRing({
  rotation,
  rx,
  ry,
  deg: initialDeg,
  speed,
  stroke,
  opacity,
}: {
  rotation: SharedValue<number>;
  rx: number;
  ry: number;
  deg: number;
  speed: number;
  stroke: string;
  opacity: number;
}) {
  const props = useAnimatedProps(() => ({
    rotation: rotation.value * 360 * speed + initialDeg,
  }));
  return (
    <AnimatedEllipse
      cx={CX}
      cy={CY}
      rx={rx}
      ry={ry}
      stroke={stroke}
      strokeWidth={0.9}
      fill="none"
      opacity={opacity}
      origin={`${CX}, ${CY}`}
      animatedProps={props}
    />
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

interface Props {
  state?: OrbState;
  size?: number;
}

export function FrameOrb({ state = "Dormant", size = 180 }: Props) {
  const cfg = VISUALS[state] ?? VISUALS.Dormant;

  // Sphere rotation (0 → 1 continuously)
  const rotation = useSharedValue(0);

  React.useEffect(() => {
    rotation.value = 0;
    rotation.value = withRepeat(
      withTiming(1, { duration: cfg.rotMs, easing: Easing.linear }),
      -1,
      false,
    );
  }, [state, cfg.rotMs]);

  // Colour derivations — mirror web VISUALS logic
  const wireColor  = hsl(cfg.hue, cfg.sat, Math.min(0.85, cfg.light + 0.12));
  const rimColor   = hsl(cfg.hue, cfg.sat, Math.min(0.85, cfg.light + 0.10));
  const glowColor  = hsl(cfg.hue, cfg.sat, cfg.light);
  const coreColor  = hsl(cfg.hue, cfg.sat * 0.6, Math.max(0.04, cfg.light * 0.3));
  const ringColor  = hsl(cfg.hue, cfg.sat * 0.7, Math.min(0.92, cfg.light + 0.18));

  return (
    <View style={{ width: size, height: size }}>
      <Svg
        width={size}
        height={size}
        viewBox={`0 0 ${VB} ${VB}`}
      >
        <Defs>
          {/* Ambient glow behind sphere */}
          <RadialGradient id="fo-ambient" cx="50%" cy="50%" r="50%">
            <Stop offset="0%"   stopColor={glowColor} stopOpacity={cfg.rimAlpha * 0.6} />
            <Stop offset="100%" stopColor={glowColor} stopOpacity={0} />
          </RadialGradient>

          {/* Sphere core: very dark centre, state-coloured rim */}
          <RadialGradient id="fo-sphere" cx="38%" cy="32%" r="60%">
            <Stop offset="0%"   stopColor="#060606"  stopOpacity={1} />
            <Stop offset="72%"  stopColor={coreColor} stopOpacity={1} />
            <Stop offset="100%" stopColor={rimColor}  stopOpacity={0.9} />
          </RadialGradient>

          {/* Rim ring gradient (Fresnel approximation) */}
          <RadialGradient id="fo-rim" cx="50%" cy="50%" r="50%">
            <Stop offset="82%"  stopColor="transparent"  stopOpacity={0} />
            <Stop offset="100%" stopColor={rimColor}      stopOpacity={cfg.rimAlpha} />
          </RadialGradient>
        </Defs>

        {/* Ambient glow — larger than sphere */}
        <Circle
          cx={CX} cy={CY}
          r={R * 1.6}
          fill="url(#fo-ambient)"
        />

        {/* Sphere core */}
        <Circle
          cx={CX} cy={CY}
          r={R}
          fill="url(#fo-sphere)"
        />

        {/* Latitude circles (static, flat ellipses) */}
        {LATITUDES.map(({ yFrac, alpha }) => {
          const latR = R * Math.sqrt(1 - yFrac * yFrac);
          return (
            <Ellipse
              key={yFrac}
              cx={CX}
              cy={CY + yFrac * R}
              rx={latR}
              ry={latR * 0.08}
              stroke={wireColor}
              strokeWidth={0.5}
              fill="none"
              opacity={cfg.wireAlpha * alpha}
            />
          );
        })}

        {/* Animated meridian lines — create the 3D rotation illusion */}
        {MERIDIAN_PHASES.map((phase) => (
          <MeridianLine
            key={phase}
            rotation={rotation}
            basePhase={phase}
            stroke={wireColor}
            opacity={cfg.wireAlpha}
          />
        ))}

        {/* Fresnel rim overlay */}
        <Circle
          cx={CX} cy={CY}
          r={R}
          fill="url(#fo-rim)"
        />

        {/* Orbital rings — extend beyond sphere, clipped by viewBox */}
        {RING_DEFS.map((ring, i) => (
          <OrbRing
            key={i}
            rotation={rotation}
            rx={ring.rx}
            ry={ring.ry}
            deg={ring.deg}
            speed={ring.speed}
            stroke={ringColor}
            opacity={cfg.wireAlpha * ring.alpha}
          />
        ))}

        {/* Hard rim circle edge */}
        <Circle
          cx={CX} cy={CY}
          r={R}
          fill="none"
          stroke={rimColor}
          strokeWidth={0.8}
          opacity={cfg.rimAlpha * 0.6}
        />
      </Svg>
    </View>
  );
}
