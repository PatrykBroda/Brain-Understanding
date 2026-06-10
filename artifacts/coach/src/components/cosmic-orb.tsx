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

// Per-state nervous-system temperatures. Restrained palette, never neon.
const VISUALS: Record<OrbState, Cfg> = {
  dormant:      { hue: 215, sat: 0.10, light: 0.35, rotSpeed: 0.06, distortSpeed: 0.6, distort: 0.10, emissive: 0.04, breathSpeed: 0.6,  breathAmt: 0.015, sparkleCount: 24, sparkleSpeed: 0.2,  ringSpeed: 0.10 },
  stable:       { hue: 32,  sat: 0.30, light: 0.50, rotSpeed: 0.10, distortSpeed: 0.8, distort: 0.12, emissive: 0.10, breathSpeed: 0.85, breathAmt: 0.020, sparkleCount: 36, sparkleSpeed: 0.30, ringSpeed: 0.18 },
  loaded:       { hue: 22,  sat: 0.55, light: 0.55, rotSpeed: 0.18, distortSpeed: 1.4, distort: 0.18, emissive: 0.18, breathSpeed: 1.20, breathAmt: 0.028, sparkleCount: 60, sparkleSpeed: 0.55, ringSpeed: 0.32 },
  recovering:   { hue: 205, sat: 0.30, light: 0.48, rotSpeed: 0.05, distortSpeed: 0.5, distort: 0.09, emissive: 0.06, breathSpeed: 0.55, breathAmt: 0.014, sparkleCount: 22, sparkleSpeed: 0.20, ringSpeed: 0.08 },
  tight:        { hue: 38,  sat: 0.30, light: 0.46, rotSpeed: 0.22, distortSpeed: 1.8, distort: 0.07, emissive: 0.08, breathSpeed: 1.35, breathAmt: 0.010, sparkleCount: 30, sparkleSpeed: 0.35, ringSpeed: 0.40 },
  volatile:     { hue: 14,  sat: 0.55, light: 0.54, rotSpeed: 0.28, distortSpeed: 2.6, distort: 0.24, emissive: 0.24, breathSpeed: 1.40, breathAmt: 0.030, sparkleCount: 78, sparkleSpeed: 0.75, ringSpeed: 0.45 },
  composed:     { hue: 35,  sat: 0.55, light: 0.55, rotSpeed: 0.12, distortSpeed: 0.9, distort: 0.13, emissive: 0.13, breathSpeed: 0.95, breathAmt: 0.018, sparkleCount: 44, sparkleSpeed: 0.35, ringSpeed: 0.20 },
  overextended: { hue: 220, sat: 0.12, light: 0.32, rotSpeed: 0.03, distortSpeed: 0.4, distort: 0.06, emissive: 0.03, breathSpeed: 0.45, breathAmt: 0.009, sparkleCount: 16, sparkleSpeed: 0.15, ringSpeed: 0.05 },
  streaming:    { hue: 35,  sat: 0.70, light: 0.60, rotSpeed: 0.32, distortSpeed: 2.0, distort: 0.20, emissive: 0.30, breathSpeed: 1.60, breathAmt: 0.024, sparkleCount: 90, sparkleSpeed: 0.80, ringSpeed: 0.50 },
};

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
    innerGlowMat.uniforms.uIntensity.value = 0.55 + cfg.emissive * 0.8;
    rimMat.uniforms.uColor.value.copy(scratchRim);
    rimMat.uniforms.uIntensity.value = 1.6 + cfg.emissive * 2.0;
    haloMat.uniforms.uColor.value.copy(scratchRim);
    haloMat.uniforms.uIntensity.value = 0.5 + cfg.emissive * 1.1;
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
          color={new THREE.Color("#080808")}
          roughness={0.5}
          metalness={0.4}
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
    fineMat.opacity = 0.13 + cfg.emissive * 0.6;
    boldMat.color.copy(scratch);
    boldMat.opacity = 0.2 + cfg.emissive * 0.8;

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

function Rings({ live }: { live: MutableRefObject<Cfg> }) {
  const a = useRef<THREE.Mesh>(null);
  const b = useRef<THREE.Mesh>(null);
  const c = useRef<THREE.Mesh>(null);
  const matA = useRef<THREE.MeshBasicMaterial>(null);
  const matB = useRef<THREE.MeshBasicMaterial>(null);
  const matC = useRef<THREE.MeshBasicMaterial>(null);
  const scratch = useMemo(() => new THREE.Color(), []);

  useFrame((_, dt) => {
    const cfg = live.current;
    if (a.current) a.current.rotation.z += cfg.ringSpeed * dt;
    if (b.current) {
      b.current.rotation.x += cfg.ringSpeed * 0.7 * dt;
      b.current.rotation.y += cfg.ringSpeed * 0.4 * dt;
    }
    if (c.current) {
      c.current.rotation.y += cfg.ringSpeed * -0.55 * dt;
      c.current.rotation.z += cfg.ringSpeed * 0.3 * dt;
    }
    scratch.setHSL(cfg.hue / 360, cfg.sat, Math.min(0.85, cfg.light + 0.05));
    const op = 0.24 + cfg.emissive * 0.8;
    if (matA.current) { matA.current.color.copy(scratch); matA.current.opacity = op; }
    if (matB.current) { matB.current.color.copy(scratch); matB.current.opacity = op * 0.75; }
    if (matC.current) { matC.current.color.copy(scratch); matC.current.opacity = op * 0.55; }
  });

  return (
    <group>
      <mesh ref={a} rotation={[Math.PI / 2.2, 0, 0]}>
        <torusGeometry args={[1.45, 0.0035, 8, 240]} />
        <meshBasicMaterial ref={matA} transparent />
      </mesh>
      <mesh ref={b} rotation={[Math.PI / 3.5, Math.PI / 5, 0]}>
        <torusGeometry args={[1.62, 0.0028, 8, 240]} />
        <meshBasicMaterial ref={matB} transparent />
      </mesh>
      <mesh ref={c} rotation={[Math.PI / 2.8, Math.PI / 3, 0]}>
        <torusGeometry args={[1.82, 0.0022, 8, 240]} />
        <meshBasicMaterial ref={matC} transparent />
      </mesh>
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
      <ambientLight intensity={0.18} />
      <directionalLight position={[3, 4, 5]} intensity={0.55} color="#fff2dd" />
      <directionalLight position={[-4, -2, -3]} intensity={0.22} color="#1a1a1a" />
      <pointLight ref={keyLight} position={[0, 0, 2.2]} intensity={0.85} distance={6} />
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
