import { Component, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ErrorInfo, type MutableRefObject, type ReactNode } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { MeshDistortMaterial, Sparkles } from "@react-three/drei";
import * as THREE from "three";

function detectWebGL(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const canvas = document.createElement("canvas");
    const gl =
      canvas.getContext("webgl2") ||
      canvas.getContext("webgl") ||
      canvas.getContext("experimental-webgl");
    return !!gl;
  } catch {
    return false;
  }
}

export type OrbState =
  | "dormant"
  | "stable"
  | "loaded"
  | "recovering"
  | "tight"
  | "volatile"
  | "composed"
  | "overextended"
  | "streaming";

interface CosmicOrbProps {
  state?: OrbState;
  className?: string;
}

interface Cfg {
  hue: number;
  sat: number;
  light: number;
  rotSpeed: number;
  distortSpeed: number;
  distort: number;
  emissive: number;
  breathSpeed: number;
  breathAmt: number;
  sparkleCount: number;
  sparkleSpeed: number;
  ringSpeed: number;
}

// Per-state nervous-system temperatures. Dark and sinister — crimson void for
// dormant/recovering/overextended, faded gold for active states. No blue-grey.
const VISUALS: Record<OrbState, Cfg> = {
  dormant:      { hue: 0,   sat: 0.12, light: 0.16, rotSpeed: 0.04, distortSpeed: 0.5, distort: 0.08, emissive: 0.03, breathSpeed: 0.55, breathAmt: 0.012, sparkleCount: 10, sparkleSpeed: 0.14, ringSpeed: 0.06 },
  stable:       { hue: 32,  sat: 0.24, light: 0.36, rotSpeed: 0.08, distortSpeed: 0.7, distort: 0.10, emissive: 0.08, breathSpeed: 0.80, breathAmt: 0.018, sparkleCount: 26, sparkleSpeed: 0.24, ringSpeed: 0.14 },
  loaded:       { hue: 22,  sat: 0.48, light: 0.40, rotSpeed: 0.15, distortSpeed: 1.2, distort: 0.16, emissive: 0.14, breathSpeed: 1.10, breathAmt: 0.025, sparkleCount: 48, sparkleSpeed: 0.46, ringSpeed: 0.26 },
  recovering:   { hue: 358, sat: 0.20, light: 0.20, rotSpeed: 0.04, distortSpeed: 0.4, distort: 0.07, emissive: 0.04, breathSpeed: 0.50, breathAmt: 0.012, sparkleCount: 14, sparkleSpeed: 0.14, ringSpeed: 0.06 },
  tight:        { hue: 38,  sat: 0.28, light: 0.34, rotSpeed: 0.20, distortSpeed: 1.6, distort: 0.07, emissive: 0.07, breathSpeed: 1.30, breathAmt: 0.009, sparkleCount: 22, sparkleSpeed: 0.28, ringSpeed: 0.36 },
  volatile:     { hue: 4,   sat: 0.62, light: 0.38, rotSpeed: 0.26, distortSpeed: 2.4, distort: 0.22, emissive: 0.22, breathSpeed: 1.35, breathAmt: 0.028, sparkleCount: 65, sparkleSpeed: 0.68, ringSpeed: 0.42 },
  composed:     { hue: 35,  sat: 0.46, light: 0.40, rotSpeed: 0.10, distortSpeed: 0.8, distort: 0.11, emissive: 0.10, breathSpeed: 0.90, breathAmt: 0.016, sparkleCount: 34, sparkleSpeed: 0.28, ringSpeed: 0.18 },
  overextended: { hue: 0,   sat: 0.08, light: 0.12, rotSpeed: 0.02, distortSpeed: 0.3, distort: 0.05, emissive: 0.02, breathSpeed: 0.40, breathAmt: 0.008, sparkleCount: 8,  sparkleSpeed: 0.10, ringSpeed: 0.04 },
  streaming:    { hue: 35,  sat: 0.62, light: 0.48, rotSpeed: 0.28, distortSpeed: 1.8, distort: 0.18, emissive: 0.25, breathSpeed: 1.50, breathAmt: 0.022, sparkleCount: 76, sparkleSpeed: 0.72, ringSpeed: 0.44 },
};

/** Hue/sat/light for each orb state — exported so sibling UI (e.g. the state
 *  label on Home) can tint itself to match the orb's current palette. */
export const ORB_PALETTE: Record<OrbState, { hue: number; sat: number; light: number }> = Object.fromEntries(
  (Object.entries(VISUALS) as [OrbState, Cfg][]).map(([k, v]) => [k, { hue: v.hue, sat: v.sat, light: v.light }])
) as Record<OrbState, { hue: number; sat: number; light: number }>;

function hsl(h: number, s: number, l: number): THREE.Color {
  return new THREE.Color().setHSL(h / 360, s, l);
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
// Shortest-path interpolation around the 360° hue wheel so colour transitions
// never sweep the long way through unrelated hues.
function lerpHue(a: number, b: number, t: number) {
  const d = ((b - a + 540) % 360) - 180;
  return a + d * t;
}

/**
 * Smoothly drives a live Cfg toward the target every frame. State changes glide
 * instead of snapping — every numeric channel (incl. colour) eases over, which
 * is what makes the orb feel smooth rather than stepped. Frame-rate independent
 * via an exponential approach (1 - e^(-k·dt)).
 */
function useLiveCfg(target: Cfg): MutableRefObject<Cfg> {
  const live = useRef<Cfg>({ ...target });
  const targetRef = useRef<Cfg>(target);
  targetRef.current = target;
  useFrame((_, dt) => {
    const k = 1 - Math.exp(-dt * 2.4);
    const l = live.current;
    const t = targetRef.current;
    l.hue = lerpHue(l.hue, t.hue, k);
    l.sat = lerp(l.sat, t.sat, k);
    l.light = lerp(l.light, t.light, k);
    l.rotSpeed = lerp(l.rotSpeed, t.rotSpeed, k);
    l.distortSpeed = lerp(l.distortSpeed, t.distortSpeed, k);
    l.distort = lerp(l.distort, t.distort, k);
    l.emissive = lerp(l.emissive, t.emissive, k);
    l.breathSpeed = lerp(l.breathSpeed, t.breathSpeed, k);
    l.breathAmt = lerp(l.breathAmt, t.breathAmt, k);
    l.sparkleSpeed = lerp(l.sparkleSpeed, t.sparkleSpeed, k);
    l.ringSpeed = lerp(l.ringSpeed, t.ringSpeed, k);
    // count is discrete — snap it (Sparkles can't tween instance count)
    l.sparkleCount = t.sparkleCount;
  });
  return live;
}

/* --------------------------- Fresnel rim shader --------------------------- */

const fresnelVertex = /* glsl */ `
  varying vec3 vN;
  varying vec3 vP;
  void main() {
    vN = normalize(normalMatrix * normal);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vP = mv.xyz;
    gl_Position = projectionMatrix * mv;
  }
`;
const fresnelFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uIntensity;
  uniform float uPower;
  varying vec3 vN;
  varying vec3 vP;
  void main() {
    vec3 v = normalize(-vP);
    float f = 1.0 - max(dot(v, vN), 0.0);
    f = pow(f, uPower) * uIntensity;
    gl_FragColor = vec4(uColor * f, f);
  }
`;

function makeFresnelMaterial(power: number) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color() },
      uIntensity: { value: 1 },
      uPower: { value: power },
    },
    vertexShader: fresnelVertex,
    fragmentShader: fresnelFragment,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

/* ------------------------------- Scene parts ------------------------------ */

function Sphere({ live }: { live: MutableRefObject<Cfg> }) {
  const group = useRef<THREE.Group>(null);
  const distortMat = useRef<THREE.MeshStandardMaterial | null>(null);

  // Long-lived materials + scratch colours (no per-frame allocation).
  const innerGlowMat = useMemo(() => makeFresnelMaterial(1.6), []);
  const rimMat = useMemo(() => makeFresnelMaterial(2.6), []);
  const haloMat = useMemo(() => makeFresnelMaterial(3.4), []);
  const scratchRim = useMemo(() => new THREE.Color(), []);
  const scratchEm = useMemo(() => new THREE.Color(), []);
  useEffect(
    () => () => {
      innerGlowMat.dispose();
      rimMat.dispose();
      haloMat.dispose();
    },
    [innerGlowMat, rimMat, haloMat],
  );

  useFrame((_, dt) => {
    const cfg = live.current;
    if (group.current) {
      // Graceful base rotation keeps even dormant feeling alive and majestic.
      group.current.rotation.y += (cfg.rotSpeed + 0.015) * dt;
      group.current.rotation.x += (cfg.rotSpeed * 0.32 + 0.004) * dt;

      const t = performance.now() * 0.001;
      const breath = 1 + Math.sin(t * cfg.breathSpeed) * cfg.breathAmt;
      group.current.scale.setScalar(breath);
      group.current.position.x = Math.sin(t * 0.11) * 0.03;
      group.current.position.y = Math.cos(t * 0.085) * 0.024;
    }

    scratchRim.setHSL(cfg.hue / 360, cfg.sat, Math.min(0.85, cfg.light + 0.1));
    scratchEm.setHSL(cfg.hue / 360, cfg.sat * 0.9, Math.min(0.5, cfg.light * 0.8));

    if (distortMat.current) {
      distortMat.current.emissive.copy(scratchEm);
      distortMat.current.emissiveIntensity = cfg.emissive;
      // drei's MeshDistortMaterial exposes distort/speed as plain number setters.
      const u = distortMat.current as unknown as { distort: number; speed: number };
      u.distort = cfg.distort;
      u.speed = cfg.distortSpeed;
    }

    innerGlowMat.uniforms.uColor.value.copy(scratchRim);
    innerGlowMat.uniforms.uIntensity.value = 0.28 + cfg.emissive * 0.65;
    rimMat.uniforms.uColor.value.copy(scratchRim);
    rimMat.uniforms.uIntensity.value = 1.0 + cfg.emissive * 1.7;
    haloMat.uniforms.uColor.value.copy(scratchRim);
    haloMat.uniforms.uIntensity.value = 0.22 + cfg.emissive * 0.85;
  });

  return (
    <group ref={group}>
      {/* Core sphere — organic, slightly displaced, low-emissive amber.
          MeshDistortMaterial mutates vertices each frame, so detail is kept
          modest to stay cheap on mobile. */}
      <mesh>
        <icosahedronGeometry args={[1, 6]} />
        <MeshDistortMaterial
          ref={distortMat as never}
          color={new THREE.Color("#020202")}
          roughness={0.55}
          metalness={0.35}
        />
      </mesh>
      {/* Inner soft glow */}
      <mesh scale={1.015} material={innerGlowMat}>
        <icosahedronGeometry args={[1, 3]} />
      </mesh>
      {/* Signature amber rim */}
      <mesh scale={1.06} material={rimMat}>
        <icosahedronGeometry args={[1, 3]} />
      </mesh>
      {/* Grand outer halo — wide, faint atmosphere for the majestic feel */}
      <mesh scale={1.3} material={haloMat}>
        <icosahedronGeometry args={[1, 2]} />
      </mesh>
    </group>
  );
}

/**
 * Two layered geodesic wireframes: a dense fine triangulation (the "more lines"
 * mesh) and a bolder structural shell that drifts the other way. Layering the
 * two builds depth and the sense of a structure energy is flowing across.
 */
function Wireframe({ live }: { live: MutableRefObject<Cfg> }) {
  const fine = useRef<THREE.LineSegments>(null);
  const bold = useRef<THREE.LineSegments>(null);

  const fineGeo = useMemo(
    () => new THREE.WireframeGeometry(new THREE.IcosahedronGeometry(1.09, 5)),
    [],
  );
  const boldGeo = useMemo(
    () => new THREE.WireframeGeometry(new THREE.IcosahedronGeometry(1.16, 2)),
    [],
  );
  const fineMat = useMemo(
    () =>
      new THREE.LineBasicMaterial({
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    [],
  );
  const boldMat = useMemo(
    () =>
      new THREE.LineBasicMaterial({
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    [],
  );
  const scratch = useMemo(() => new THREE.Color(), []);
  useEffect(
    () => () => {
      fineGeo.dispose();
      boldGeo.dispose();
      fineMat.dispose();
      boldMat.dispose();
    },
    [fineGeo, boldGeo, fineMat, boldMat],
  );

  useFrame((_, dt) => {
    const cfg = live.current;
    scratch.setHSL(cfg.hue / 360, cfg.sat, Math.min(0.85, cfg.light + 0.12));
    fineMat.color.copy(scratch);
    // Keep the geodesic structure legible even at rest, brightening with load.
    // Toned down so the white lattice reads as texture, not glare.
    fineMat.opacity = 0.018 + cfg.emissive * 0.15;
    boldMat.color.copy(scratch);
    boldMat.opacity = 0.03 + cfg.emissive * 0.18;

    if (fine.current) {
      fine.current.rotation.y -= (cfg.rotSpeed * 0.5 + 0.018) * dt;
      fine.current.rotation.x += cfg.rotSpeed * 0.18 * dt;
    }
    if (bold.current) {
      bold.current.rotation.y += (cfg.rotSpeed * 0.22 + 0.01) * dt;
      bold.current.rotation.z -= cfg.rotSpeed * 0.12 * dt;
    }
  });

  return (
    <group>
      <lineSegments ref={fine} geometry={fineGeo} material={fineMat} />
      <lineSegments ref={bold} geometry={boldGeo} material={boldMat} />
    </group>
  );
}

// Each orbiting line: radius, tube thickness, initial tilt, and per-axis spin
// multipliers (all scaled by the live ringSpeed). Adding a line = adding a row.
interface RingDef {
  r: number;
  tube: number;
  tilt: [number, number, number];
  spin: { x?: number; y?: number; z?: number };
}
// The sphere spins +y (and slightly +x), so the rings are deliberately given
// dominant -y / -x / opposite-z spins — they orbit AGAINST the sphere so the
// lines read as independent orbits crossing it, not paint stuck to its surface.
const RING_DEFS: RingDef[] = [
  // Closest ring — near equatorial, thickest
  { r: 1.42, tube: 0.011, tilt: [Math.PI / 2.1, 0, 0], spin: { z: 1.15 } },
  // Tight inner counter-orbit
  { r: 1.50, tube: 0.010, tilt: [Math.PI / 2.6, Math.PI / 4.5, 0.2], spin: { x: -0.7, y: -0.45 } },
  // Strong counter-spin against the sphere's +y
  { r: 1.60, tube: 0.009, tilt: [Math.PI / 3.4, Math.PI / 5.5, 0], spin: { y: -0.85, z: 0.3 } },
  // Steep polar-ish crosser, reversed
  { r: 1.70, tube: 0.008, tilt: [Math.PI / 2.3, Math.PI / 2.8, 0.5], spin: { x: 0.6, z: -0.55 } },
  // Opposite tilt, counter-y
  { r: 1.78, tube: 0.008, tilt: [Math.PI / 2.7, Math.PI / 3.2, 0], spin: { y: -0.65, z: 0.4 } },
  // Mid outer band, canted the other way
  { r: 1.88, tube: 0.007, tilt: [Math.PI / 4.5, Math.PI / 3.6, -0.4], spin: { x: -0.6, z: 0.5 } },
  // Outer halo band
  { r: 1.96, tube: 0.006, tilt: [Math.PI / 4, Math.PI / 6, 0.4], spin: { y: -0.55, x: 0.42 } },
  // Widest outer sentinel
  { r: 2.16, tube: 0.005, tilt: [Math.PI / 5.5, Math.PI / 4, 0.8], spin: { z: -0.75, y: 0.35 } },
];
// Fade weights per ring — inner rings brightest, outer rings still clearly visible
const RING_FADE = RING_DEFS.map((_, i) => Math.max(0.5, 1 - i * 0.07));

function Rings({ live }: { live: MutableRefObject<Cfg> }) {
  const refs = useMemo(
    () => RING_DEFS.map(() => ({ current: null as THREE.Mesh | null })),
    [],
  );
  const mats = useMemo(
    () => RING_DEFS.map(() => ({ current: null as THREE.MeshBasicMaterial | null })),
    [],
  );
  const scratch = useMemo(() => new THREE.Color(), []);

  useFrame((_, dt) => {
    const cfg = live.current;
    for (let i = 0; i < RING_DEFS.length; i++) {
      const mesh = refs[i].current;
      if (!mesh) continue;
      const s = RING_DEFS[i].spin;
      if (s.x) mesh.rotation.x += cfg.ringSpeed * s.x * dt;
      if (s.y) mesh.rotation.y += cfg.ringSpeed * s.y * dt;
      if (s.z) mesh.rotation.z += cfg.ringSpeed * s.z * dt;
    }
    // Ring colour matches orb state — softened band so they read against the dark sphere
    scratch.setHSL(cfg.hue / 360, cfg.sat * 0.7, Math.min(0.8, cfg.light + 0.16));
    // Toned down further — orbits sit behind the sphere as quiet structure, not bright glare
    const baseOp = 0.17 + cfg.emissive * 0.38;
    for (let i = 0; i < RING_DEFS.length; i++) {
      const m = mats[i].current;
      if (m) { m.color.copy(scratch); m.opacity = Math.min(0.38, baseOp * RING_FADE[i]); }
    }
  });

  return (
    <group>
      {RING_DEFS.map((d, i) => (
        <mesh key={i} ref={refs[i]} rotation={d.tilt}>
          <torusGeometry args={[d.r, d.tube, 8, 256]} />
          <meshBasicMaterial ref={mats[i]} transparent blending={THREE.AdditiveBlending} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}

function SparkleField({ live, state }: { live: MutableRefObject<Cfg>; state: OrbState }) {
  const cfg = VISUALS[state];
  const sparkleColor = useMemo(() => hsl(cfg.hue, cfg.sat, cfg.light + 0.05), [cfg.hue, cfg.sat, cfg.light]);
  // Sparkle count/speed can't tween smoothly, so read the target for those but
  // keep the colour following the live (smoothed) palette via a parent light.
  return (
    <Sparkles
      count={cfg.sparkleCount}
      scale={4.4}
      size={1.6}
      speed={cfg.sparkleSpeed}
      opacity={0.5}
      color={sparkleColor}
      noise={1.4}
    />
  );
}

interface MouseXY { x: number; y: number }

function Scene({ state, mouseRef }: { state: OrbState; mouseRef: MutableRefObject<MouseXY> }) {
  const live = useLiveCfg(VISUALS[state]);
  const keyLight = useRef<THREE.PointLight>(null);
  const tiltGroup = useRef<THREE.Group>(null);
  const scratch = useMemo(() => new THREE.Color(), []);

  useFrame(() => {
    const cfg = live.current;
    if (keyLight.current) {
      scratch.setHSL(cfg.hue / 360, cfg.sat, cfg.light + 0.05);
      keyLight.current.color.copy(scratch);
      keyLight.current.intensity = 0.7 + cfg.emissive * 1.2;
    }
    // Subtle mouse-reactive parallax tilt — max ≈8°, smooth follow
    if (tiltGroup.current) {
      const targetX = mouseRef.current.y * 0.14;
      const targetY = mouseRef.current.x * 0.18;
      tiltGroup.current.rotation.x += (targetX - tiltGroup.current.rotation.x) * 0.035;
      tiltGroup.current.rotation.y += (targetY - tiltGroup.current.rotation.y) * 0.035;
    }
  });

  return (
    <>
      <ambientLight intensity={0.05} />
      <directionalLight position={[3, 4, 5]} intensity={0.18} color="#ffead0" />
      <directionalLight position={[-4, -2, -3]} intensity={0.10} color="#1a1a1a" />
      <pointLight ref={keyLight} position={[0, 0, 2.2]} intensity={0.48} distance={6} />
      {/* Sinister crimson underlight — gives the void its depth */}
      <pointLight position={[0, -2.2, 0.6]} intensity={0.14} color="#3d0000" distance={5} />
      <group ref={tiltGroup}>
        <Sphere live={live} />
        <Wireframe live={live} />
        <Rings live={live} />
        <SparkleField live={live} state={state} />
      </group>
    </>
  );
}

/* --------------------------------- Export --------------------------------- */

class CanvasErrorBoundary extends Component<
  { fallback: ReactNode; children: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(_error: Error, _info: ErrorInfo) {
    // Swallow R3F/WebGL init or render failures so the dev runtime overlay
    // does not surface — the static fallback orb is rendered instead.
  }
  render() {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}

function FallbackOrb({ state }: { state: OrbState }) {
  const cfg = VISUALS[state];
  const rim = `hsla(${cfg.hue}, ${cfg.sat * 100}%, ${cfg.light * 100}%, 0.65)`;
  const rimSoft = `hsla(${cfg.hue}, ${cfg.sat * 100}%, ${cfg.light * 100}%, 0.2)`;
  return (
    <div className="absolute inset-[18%] rounded-full"
      style={{
        background: `radial-gradient(circle at 36% 28%, hsl(0 0% 14%) 0%, hsl(0 0% 6%) 60%, #000 100%)`,
        boxShadow: `inset 0 1px 1px ${rim}, inset 0 0 60px hsl(0 0% 0% / 0.6), 0 0 90px ${rimSoft}`,
      }}
    />
  );
}

export function CosmicOrb({ state = "dormant", className = "" }: CosmicOrbProps) {
  const [webglOk, setWebglOk] = useState<boolean | null>(null);
  const mouseRef = useRef<MouseXY>({ x: 0, y: 0 });

  useEffect(() => {
    setWebglOk(detectWebGL());
  }, []);

  // Global mouse tracking — doesn't need pointer-events on this element
  const onMouseMove = useCallback((e: MouseEvent) => {
    mouseRef.current.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouseRef.current.y = -((e.clientY / window.innerHeight) * 2 - 1);
  }, []);

  useEffect(() => {
    window.addEventListener("mousemove", onMouseMove, { passive: true });
    return () => window.removeEventListener("mousemove", onMouseMove);
  }, [onMouseMove]);

  return (
    <div
      className={`relative aspect-square select-none pointer-events-none ${className}`}
      aria-hidden
    >
      {/* Deep shadow beneath — brand requirement: shadow, not glow */}
      <div
        className="absolute left-1/2 bottom-[8%] pointer-events-none"
        style={{
          width: "55%",
          height: "16%",
          transform: "translate(-50%, 50%) scaleY(0.35)",
          background:
            "radial-gradient(ellipse at 50% 50%, rgba(0,0,0,1) 0%, rgba(0,0,0,0.75) 40%, transparent 70%)",
          filter: "blur(22px)",
        }}
      />
      {webglOk === false ? (
        <FallbackOrb state={state} />
      ) : webglOk === true ? (
        <CanvasErrorBoundary fallback={<FallbackOrb state={state} />}>
          <Canvas
            dpr={[1, 2]}
            gl={{ alpha: true, antialias: true, premultipliedAlpha: false }}
            camera={{ position: [0, 0, 3.6], fov: 38 }}
            style={{ background: "transparent" }}
            onCreated={({ gl }) => {
              gl.domElement.addEventListener("webglcontextlost", (e) => e.preventDefault());
            }}
          >
            <Suspense fallback={null}>
              <Scene state={state} mouseRef={mouseRef} />
            </Suspense>
          </Canvas>
        </CanvasErrorBoundary>
      ) : null}
    </div>
  );
}
