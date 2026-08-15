import React, { useEffect, useMemo } from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Circle, Defs, Line, RadialGradient, Stop } from "react-native-svg";
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
 * website's WebGL CosmicOrb (coach/src/components/cosmic-orb.tsx). Renders fully
 * offline (no WebView / network). The dominant visual is a TRIANGULATED
 * icosphere wireframe (two counter-rotating layers), not a lat/long globe.
 * Around it sweep five orbital rings that extend well beyond the sphere, an
 * additive amber Fresnel rim + soft halo, and a deterministic sparkle field.
 * Per-state palette mirrors the web VISUALS table.
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
  rotSpeed: number; // mesh yaw speed (rad/s-ish)
  ringSpeed: number; // higher = faster orbit
  breathMs: number;
  sparkles: number;
  glow: number; // 0..1 overall emissive intensity
}

// Ported from coach/src/components/cosmic-orb.tsx VISUALS — dark & sinister:
// crimson void for dormant/recovering/overextended, faded gold for active.
// sparkle counts pushed toward the web VISUALS (stable ~26, volatile ~65).
const VISUALS: Record<OrbState, Cfg> = {
  Dormant:      { hue: 0,   sat: 0.12, light: 0.16, rotSpeed: 0.05, ringSpeed: 0.06, breathMs: 3600, sparkles: 10, glow: 0.22 },
  Stable:       { hue: 32,  sat: 0.28, light: 0.40, rotSpeed: 0.10, ringSpeed: 0.16, breathMs: 2600, sparkles: 26, glow: 0.50 },
  Loaded:       { hue: 22,  sat: 0.50, light: 0.44, rotSpeed: 0.17, ringSpeed: 0.28, breathMs: 2000, sparkles: 48, glow: 0.72 },
  Recovering:   { hue: 358, sat: 0.22, light: 0.24, rotSpeed: 0.05, ringSpeed: 0.07, breathMs: 3400, sparkles: 14, glow: 0.30 },
  Tight:        { hue: 38,  sat: 0.30, light: 0.38, rotSpeed: 0.22, ringSpeed: 0.36, breathMs: 1700, sparkles: 22, glow: 0.52 },
  Volatile:     { hue: 4,   sat: 0.64, light: 0.42, rotSpeed: 0.28, ringSpeed: 0.46, breathMs: 1300, sparkles: 65, glow: 0.92 },
  Composed:     { hue: 35,  sat: 0.48, light: 0.44, rotSpeed: 0.12, ringSpeed: 0.18, breathMs: 2400, sparkles: 34, glow: 0.66 },
  Overextended: { hue: 0,   sat: 0.08, light: 0.14, rotSpeed: 0.03, ringSpeed: 0.04, breathMs: 4000, sparkles: 8,  glow: 0.20 },
};

const clamp = (v: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
const hsl = (h: number, s: number, l: number) =>
  `hsl(${Math.round(((h % 360) + 360) % 360)}, ${Math.round(clamp(s) * 100)}%, ${Math.round(clamp(l) * 100)}%)`;

/* ---------------------------- Icosphere geometry --------------------------- */
// Built once at module load. An icosahedron subdivided N times, projected
// orthographically. Front edges (higher avg z) drawn brighter/thicker, back
// edges dimmer, so the wireframe reads as a turning 3D energy sphere.

type Vec3 = [number, number, number];
interface Geo {
  verts: Vec3[];
  edges: [number, number][];
}

function makeIcosahedron(): { verts: Vec3[]; faces: [number, number, number][] } {
  const t = (1 + Math.sqrt(5)) / 2;
  const verts: Vec3[] = [
    [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
    [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
    [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1],
  ];
  const faces: [number, number, number][] = [
    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
    [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
    [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
  ];
  return { verts, faces };
}

function subdivide(
  g: { verts: Vec3[]; faces: [number, number, number][] },
): { verts: Vec3[]; faces: [number, number, number][] } {
  const verts = g.verts.map((v) => [...v] as Vec3);
  const cache: Record<string, number> = {};
  const mid = (a: number, b: number): number => {
    const k = a < b ? `${a}_${b}` : `${b}_${a}`;
    if (cache[k] != null) return cache[k];
    const p: Vec3 = [
      (g.verts[a][0] + g.verts[b][0]) / 2,
      (g.verts[a][1] + g.verts[b][1]) / 2,
      (g.verts[a][2] + g.verts[b][2]) / 2,
    ];
    verts.push(p);
    return (cache[k] = verts.length - 1);
  };
  const faces: [number, number, number][] = [];
  for (const [a, b, c] of g.faces) {
    const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a);
    faces.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]);
  }
  return { verts, faces };
}

function buildGeo(detail: number, radius: number): Geo {
  let g = makeIcosahedron();
  for (let i = 0; i < detail; i++) g = subdivide(g);
  // project onto unit sphere, then scale
  const verts: Vec3[] = g.verts.map((v) => {
    const len = Math.hypot(v[0], v[1], v[2]) || 1;
    return [(v[0] / len) * radius, (v[1] / len) * radius, (v[2] / len) * radius];
  });
  const seen = new Set<string>();
  const edges: [number, number][] = [];
  for (const [a, b, c] of g.faces) {
    for (const [x, y] of [[a, b], [b, c], [c, a]] as [number, number][]) {
      const k = x < y ? `${x}_${y}` : `${y}_${x}`;
      if (seen.has(k)) continue;
      seen.add(k);
      edges.push([x, y]);
    }
  }
  return { verts, edges };
}

// Fine dense triangulation (detail 3 = 1920 edges) + bolder structural shell
// (detail 2 = 480 edges). Radii mirror the site's 1.09 / 1.16 ratio. The site
// uses detail 5 (thousands); detail 3 keeps it dense but phone-affordable.
const FINE_GEO = buildGeo(3, 1.09);
const BOLD_GEO = buildGeo(2, 1.16);

// Rotate a vertex about Y then a fixed X tilt; return projected {x,y} in unit
// space plus depth z (for front/back weighting). Ortho projection uses x,y.
function project(v: Vec3, yaw: number, tilt: number) {
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  // yaw about Y
  let x = v[0] * cy + v[2] * sy;
  let z = -v[0] * sy + v[2] * cy;
  const y0 = v[1];
  // fixed tilt about X so poles are slightly visible (matches web's rot.x)
  const cx = Math.cos(tilt), sx = Math.sin(tilt);
  const y = y0 * cx - z * sx;
  z = y0 * sx + z * cx;
  return { x, y, z };
}

interface EdgeDraw {
  x1: number; y1: number; x2: number; y2: number; z: number;
}

function projectEdges(geo: Geo, yaw: number, tilt: number, c: number, scale: number): EdgeDraw[] {
  const P = geo.verts.map((v) => project(v, yaw, tilt));
  const out: EdgeDraw[] = new Array(geo.edges.length);
  for (let i = 0; i < geo.edges.length; i++) {
    const [a, b] = geo.edges[i];
    const pa = P[a], pb = P[b];
    out[i] = {
      x1: c + pa.x * scale,
      y1: c - pa.y * scale,
      x2: c + pb.x * scale,
      y2: c - pb.y * scale,
      z: (pa.z + pb.z) * 0.5,
    };
  }
  return out;
}

/* -------------------------------- Rings ----------------------------------- */
// Five sweeping rings at increasing radii (site radii 1.42..2.16 relative to a
// sphere radius of 1.0). Here the sphere core radius is rCore; ring radii are
// scaled so outer rings extend beyond the sphere toward the frame edges. Each
// rotates independently; inner brighter, outer ghostlier.
// The site shows only a FEW calm, bright, near-flat crossing arcs (thin,
// cream-white, sweeping well past the sphere) — not a nest of loops. So we
// keep just three prominent, low-eccentricity rings (nearly straight bands)
// plus one faint ghost. Low ecc => the ellipse reads as a gentle sweeping line
// rather than a tangled loop. Slow durations => calm drift, not a scribble.
// Large, flat (low-ecc) ellipses read as long calm arcs sweeping edge-to-edge
// past the frame — the site's restrained look — rather than tight loops.
// Each ring gets its own direction (alternating CW/CCW so neighbours scissor
// against each other) and its own DISTINCT base period — deliberately
// non-monotonic (6.5 / 10.5 / 8.2 / 13s) so the four don't drift in lockstep
// or read as one coordinated cascade. Periods are short enough that the orbit
// is plainly visible, not a 30-second creep that looks frozen.
const RINGS = [
  { rr: 1.55, ecc: 0.08, tilt: 8,   durBase: 6500,  dir: 1,  op: 1.0,  w: 1.0 },
  { rr: 1.9,  ecc: 0.13, tilt: -26, durBase: 10500, dir: -1, op: 0.66, w: 0.85 },
  { rr: 2.15, ecc: 0.07, tilt: 54,  durBase: 8200,  dir: 1,  op: 0.36, w: 0.72 },
  { rr: 2.5,  ecc: 0.18, tilt: -66, durBase: 13000, dir: -1, op: 0.16, w: 0.58 },
];

// Deterministic sparkle layout (stable across renders). Golden-angle spiral so
// the field looks scattered but never reshuffles. Sized for up to 65 sparkles.
const SPARKLE_SEED = Array.from({ length: 65 }, (_, i) => {
  const a = (i * 137.508 * Math.PI) / 180;
  const rad = 0.30 + ((i * 61) % 100) / 100 * 0.26; // 0.30..0.56 of size
  return {
    angle: a,
    radius: rad,
    dot: 1 + ((i * 17) % 3), // 1..3 px
    delay: (i * 231) % 1800,
    dur: 1400 + ((i * 97) % 1600),
  };
});

interface Props {
  state?: OrbState;
  size?: number;
}

function Ring({
  ring,
  size,
  rCore,
  color,
  speed,
}: {
  ring: (typeof RINGS)[number];
  size: number;
  rCore: number;
  color: string;
  speed: number;
}) {
  const rot = useSharedValue(0);
  const c = size / 2;
  const duration = ring.durBase / (0.6 + speed * 2.2);
  const rx = ring.rr * rCore;
  const ry = rx * ring.ecc;

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
      <Svg width={size} height={size} style={styles.overflow}>
        <Circle
          cx={c}
          cy={c}
          r={rx}
          stroke={color}
          strokeOpacity={ring.op}
          strokeWidth={ring.w}
          fill="none"
          // squash into an ellipse via scaleY, then tilt
          scaleY={ring.ecc}
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
    opacity: interpolate(t.value, [0, 1], [0.12, 0.85]),
    transform: [{ scale: interpolate(t.value, [0, 1], [0.6, 1.05]) }],
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

/**
 * Triangulated icosphere wireframe drawn ONCE. The turn is a UI-thread rotate
 * transform on the wrapping Animated.View, so it stays smooth regardless of how
 * many edges the shell has. Edges are depth sorted into front/back so the shell
 * still reads volumetric.
 */
function Mesh({
  size,
  rCore,
  color,
  glow,
  half = "all",
}: {
  size: number;
  rCore: number;
  color: string;
  glow: number;
  half?: "all" | "front";
}) {
  const c = size / 2;

  const tilt = 0.42; // fixed X tilt so it reads as a sphere, not a disc
  // Scale so the outermost (bold, r=1.16) shell lands exactly on the rim
  // circle at rCore — the mesh then sits INSIDE the sphere like the site,
  // instead of ballooning past the rim into top/bottom "caps".
  const mScale = rCore / 1.16;
  // Projected ONCE at a fixed yaw. The visible spin is a UI-thread rotate
  // transform on the wrapping Animated.View (see OrbNative) — NOT a per-frame
  // re-projection. This is the performance fix: we never reconcile thousands of
  // SVG <Line> nodes on the JS thread each frame, so the rotation stays smooth.
  const YAW0 = 0.6;
  const fine = useMemo(
    () => projectEdges(FINE_GEO, YAW0, tilt, c, mScale),
    [c, mScale],
  );
  const bold = useMemo(
    () => projectEdges(BOLD_GEO, -YAW0 * 0.72 + 0.6, tilt - 0.12, c, mScale),
    [c, mScale],
  );

  // depth range for normalising z -> brightness (radius-relative)
  const zmax = rCore;

  const renderEdges = (edges: EdgeDraw[], baseOp: number, baseW: number) =>
    edges.map((e, i) => {
      // normalise depth 0(back)..1(front)
      const d = clamp((e.z + zmax) / (2 * zmax));
      // "all" pass draws the whole delicate shell (front + back) under the
      // translucent core so the far side reads through like the site. "front"
      // pass re-draws only near edges crisply on top of the core.
      if (half === "front") {
        if (d < 0.44) return null;
      } else if (d < 0.05) return null;
      const op = baseOp * (0.32 + d * 0.68);
      const w = baseW * (0.6 + d * 0.55);
      return (
        <Line
          key={i}
          x1={e.x1}
          y1={e.y1}
          x2={e.x2}
          y2={e.y2}
          stroke={color}
          strokeOpacity={op}
          strokeWidth={w}
          strokeLinecap="round"
        />
      );
    });

  // Finer, more translucent than before — a delicate energy triangulation
  // rather than a heavy lumpy shell. The "front" pass gets a small boost so the
  // near hemisphere still reads crisply over the core.
  // Lean on the FINE triangulation for the delicate energy texture. The BOLD
  // shell is kept very faint (it otherwise draws big crossing chords that read
  // as a scribble) — just enough to hint structure, like the site.
  const fineBase = (half === "front" ? 0.15 : 0.055) + glow * 0.28;
  const boldBase = (half === "front" ? 0.045 : 0.02) + glow * 0.08;

  return (
    <Svg width={size} height={size} style={[StyleSheet.absoluteFill, styles.overflow]} pointerEvents="none">
      {renderEdges(bold, boldBase, 0.7)}
      {renderEdges(fine, fineBase, 0.4)}
    </Svg>
  );
}

export function OrbNative({ state = "Dormant", size = 200 }: Props) {
  const cfg = VISUALS[state] ?? VISUALS.Dormant;
  const c = size / 2;
  const rCore = 0.34 * size; // core sphere radius; rings extend to ~0.73*size

  // Mesh spin is a single UI-thread rotate transform (reanimated) on the two
  // mesh layers — NOT a per-frame JS re-projection. This is what keeps the
  // rotation buttery: the thousands of SVG <Line> nodes are laid out once and
  // just rotated by the compositor. Duration derives from the state's rotSpeed.
  const meshSpin = useSharedValue(0);
  const spinDurationMs = 60000 / (2 + cfg.rotSpeed * 22);
  useEffect(() => {
    meshSpin.value = 0;
    meshSpin.value = withRepeat(
      withTiming(360, { duration: spinDurationMs, easing: Easing.linear }),
      -1,
      false,
    );
  }, [spinDurationMs]);
  const meshSpinStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${meshSpin.value}deg` }],
  }));

  const glowColor = hsl(cfg.hue, cfg.sat, cfg.light + 0.2);
  // Rings on the site are near-white cream arcs — low saturation, high light —
  // so they read as clean light sweeps rather than coloured loops.
  const ringColor = hsl(cfg.hue, cfg.sat * 0.22, Math.min(0.95, cfg.light + 0.56));
  const rimColor = hsl(cfg.hue, cfg.sat, cfg.light + 0.22);
  // Warm translucent GLOWING core (amber-brown energy field, not a solid ball).
  // Brighter, warmer centre falling to a soft warm edge — high enough that the
  // back-hemisphere mesh reads through it like the site's lit-glass look.
  const coreHi = hsl(cfg.hue, cfg.sat * 0.75, Math.max(0.1, cfg.light * 0.6));
  const coreMid = hsl(cfg.hue, cfg.sat * 0.65, cfg.light * 0.34);
  const coreLo = hsl(cfg.hue, cfg.sat * 0.5, cfg.light * 0.16);
  const sparkleColor = hsl(cfg.hue, cfg.sat, cfg.light + 0.22);
  // Site's triangulation reads as a cool near-white filigree (low saturation,
  // high light) over the warm core — desaturate the mesh so it looks like fine
  // light lines rather than warm wires.
  const meshColor = hsl(cfg.hue, cfg.sat * 0.32, Math.min(0.92, cfg.light + 0.46));

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
    opacity: interpolate(breath.value, [0, 1], [0.78, 1]),
    transform: [{ scale: interpolate(breath.value, [0, 1], [0.99, 1.05]) }],
  }));
  const coreStyle = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(breath.value, [0, 1], [0.99, 1.015]) }],
  }));

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      {/* Outer atmosphere / halo */}
      <Animated.View style={[StyleSheet.absoluteFill, glowStyle]} pointerEvents="none">
        <Svg width={size} height={size} style={styles.overflow}>
          <Defs>
            <RadialGradient id="glow" cx="50%" cy="50%" r="50%">
              <Stop offset="0%" stopColor={glowColor} stopOpacity={cfg.glow * 0.5} />
              <Stop offset="40%" stopColor={glowColor} stopOpacity={cfg.glow * 0.14} />
              <Stop offset="72%" stopColor={glowColor} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Circle cx={c} cy={c} r={0.5 * size} fill="url(#glow)" />
        </Svg>
      </Animated.View>

      {/* Sweeping orbital rings (behind + around the sphere) */}
      {RINGS.map((ring, i) => (
        <Ring key={i} ring={ring} size={size} rCore={rCore} color={ringColor} speed={cfg.ringSpeed} />
      ))}

      {/* FULL triangulated icosphere (front + back) drawn UNDER the translucent
          core, so the far-side mesh reads through the glowing energy field. */}
      <Animated.View style={[StyleSheet.absoluteFill, meshSpinStyle]} pointerEvents="none">
        <Mesh size={size} rCore={rCore} color={meshColor} glow={cfg.glow} half="all" />
      </Animated.View>

      {/* Warm translucent glowing core + Fresnel rim (no specular highlight). */}
      <Animated.View style={[StyleSheet.absoluteFill, coreStyle]} pointerEvents="none">
        <Svg width={size} height={size} style={styles.overflow}>
          <Defs>
            <RadialGradient id="coreGlow" cx="48%" cy="46%" r="42%">
              <Stop offset="0%" stopColor={coreHi} stopOpacity={clamp(0.14 + cfg.glow * 0.22)} />
              <Stop offset="55%" stopColor={coreMid} stopOpacity={clamp(0.05 + cfg.glow * 0.1)} />
              <Stop offset="100%" stopColor={coreLo} stopOpacity={0} />
            </RadialGradient>
            <RadialGradient id="core" cx="46%" cy="44%" r="76%">
              <Stop offset="0%" stopColor={coreHi} stopOpacity={0.34} />
              <Stop offset="55%" stopColor={coreMid} stopOpacity={0.44} />
              <Stop offset="100%" stopColor={coreLo} stopOpacity={0.62} />
            </RadialGradient>
            <RadialGradient id="rimGlow" cx="50%" cy="50%" r="50%">
              <Stop offset="68%" stopColor={rimColor} stopOpacity={0} />
              <Stop offset="90%" stopColor={rimColor} stopOpacity={cfg.glow * 0.6} />
              <Stop offset="100%" stopColor={rimColor} stopOpacity={0} />
            </RadialGradient>
          </Defs>

          {/* Inner fresnel bloom just inside the sphere edge */}
          <Circle cx={c} cy={c} r={rCore * 1.16} fill="url(#rimGlow)" />
          {/* Translucent warm core body — mesh behind reads through */}
          <Circle cx={c} cy={c} r={rCore} fill="url(#core)" />
          {/* Emissive inner bloom — makes it glow like an energy field */}
          <Circle cx={c} cy={c} r={rCore * 0.92} fill="url(#coreGlow)" />
        </Svg>
      </Animated.View>

      {/* Crisp near-hemisphere mesh re-drawn on top of the core for depth.
          Same spin transform so front + back layers stay locked together. */}
      <Animated.View style={[StyleSheet.absoluteFill, meshSpinStyle]} pointerEvents="none">
        <Mesh size={size} rCore={rCore} color={meshColor} glow={cfg.glow} half="front" />
      </Animated.View>

      {/* Crisp additive amber rim on top of the mesh */}
      <Svg width={size} height={size} style={[StyleSheet.absoluteFill, styles.overflow]} pointerEvents="none">
        <Circle
          cx={c}
          cy={c}
          r={rCore}
          stroke={rimColor}
          strokeOpacity={clamp(0.4 + cfg.glow * 0.55)}
          strokeWidth={1.3}
          fill="none"
        />
      </Svg>

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
  overflow: {
    overflow: "visible",
  },
});
