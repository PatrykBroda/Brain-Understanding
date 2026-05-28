import { Component, Suspense, useEffect, useMemo, useRef, useState, type ErrorInfo, type ReactNode } from "react";
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

function useFresnelMaterial(color: THREE.Color, intensity: number, power = 2.4) {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uColor: { value: color.clone() },
          uIntensity: { value: intensity },
          uPower: { value: power },
        },
        vertexShader: fresnelVertex,
        fragmentShader: fresnelFragment,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    [],
  );
  useEffect(() => {
    mat.uniforms.uColor.value.copy(color);
    mat.uniforms.uIntensity.value = intensity;
    mat.uniforms.uPower.value = power;
  }, [color, intensity, power, mat]);
  useEffect(() => () => mat.dispose(), [mat]);
  return mat;
}

/* ------------------------------- Scene parts ------------------------------ */

function Sphere({ cfg }: { cfg: Cfg }) {
  const group = useRef<THREE.Group>(null);
  const distortRef = useRef<{ distort: number; speed: number }>({
    distort: cfg.distort,
    speed: cfg.distortSpeed,
  });

  // Smoothly interpolate distortion params on state change to avoid pops.
  useFrame((_, dt) => {
    if (!group.current) return;
    group.current.rotation.y += cfg.rotSpeed * dt;
    group.current.rotation.x += cfg.rotSpeed * 0.35 * dt;

    const breath =
      1 + Math.sin(performance.now() * 0.001 * cfg.breathSpeed) * cfg.breathAmt;
    group.current.scale.setScalar(breath);
  });

  const rimColor = useMemo(() => hsl(cfg.hue, cfg.sat, cfg.light), [cfg.hue, cfg.sat, cfg.light]);
  const emissiveColor = useMemo(
    () => hsl(cfg.hue, cfg.sat * 0.9, Math.min(0.5, cfg.light * 0.8)),
    [cfg.hue, cfg.sat, cfg.light],
  );
  const rimMat = useFresnelMaterial(rimColor, 1.6 + cfg.emissive * 2.0, 2.6);
  const innerGlowMat = useFresnelMaterial(rimColor, 0.55 + cfg.emissive * 0.8, 1.6);

  // Effective distort = base * (0.3 + breath swing) — gentle "pulse" without redoing material.
  useEffect(() => {
    distortRef.current.distort = cfg.distort;
    distortRef.current.speed = cfg.distortSpeed;
  }, [cfg.distort, cfg.distortSpeed]);

  return (
    <group ref={group}>
      {/* Core sphere — organic, slightly displaced, low-emissive amber.
          Detail kept modest: MeshDistortMaterial mutates vertices each frame,
          so high subdivision balloons CPU + GPU cost on mobile. */}
      <mesh>
        <icosahedronGeometry args={[1, 6]} />
        <MeshDistortMaterial
          color={new THREE.Color("#0a0a0a")}
          emissive={emissiveColor}
          emissiveIntensity={cfg.emissive}
          roughness={0.55}
          metalness={0.35}
          distort={cfg.distort}
          speed={cfg.distortSpeed}
        />
      </mesh>
      {/* Inner soft glow (small rim outside surface) */}
      <mesh scale={1.015} material={innerGlowMat}>
        <icosahedronGeometry args={[1, 3]} />
      </mesh>
      {/* Outer fresnel rim — the signature amber halo */}
      <mesh scale={1.06} material={rimMat}>
        <icosahedronGeometry args={[1, 3]} />
      </mesh>
    </group>
  );
}

function Rings({ cfg }: { cfg: Cfg }) {
  const a = useRef<THREE.Mesh>(null);
  const b = useRef<THREE.Mesh>(null);
  const c = useRef<THREE.Mesh>(null);

  useFrame((_, dt) => {
    if (a.current) a.current.rotation.z += cfg.ringSpeed * dt;
    if (b.current) {
      b.current.rotation.x += cfg.ringSpeed * 0.7 * dt;
      b.current.rotation.y += cfg.ringSpeed * 0.4 * dt;
    }
    if (c.current) {
      c.current.rotation.y += cfg.ringSpeed * -0.55 * dt;
      c.current.rotation.z += cfg.ringSpeed * 0.3 * dt;
    }
  });

  const color = useMemo(() => hsl(cfg.hue, cfg.sat, cfg.light + 0.05), [cfg.hue, cfg.sat, cfg.light]);
  const opacity = 0.18 + cfg.emissive * 0.7;

  return (
    <group>
      <mesh ref={a} rotation={[Math.PI / 2.2, 0, 0]}>
        <torusGeometry args={[1.45, 0.0035, 8, 200]} />
        <meshBasicMaterial color={color} transparent opacity={opacity} />
      </mesh>
      <mesh ref={b} rotation={[Math.PI / 3.5, Math.PI / 5, 0]}>
        <torusGeometry args={[1.62, 0.0028, 8, 200]} />
        <meshBasicMaterial color={color} transparent opacity={opacity * 0.75} />
      </mesh>
      <mesh ref={c} rotation={[Math.PI / 2.8, Math.PI / 3, 0]}>
        <torusGeometry args={[1.82, 0.0022, 8, 200]} />
        <meshBasicMaterial color={color} transparent opacity={opacity * 0.55} />
      </mesh>
    </group>
  );
}

function Scene({ state }: { state: OrbState }) {
  const cfg = VISUALS[state];
  const sparkleColor = useMemo(() => hsl(cfg.hue, cfg.sat, cfg.light + 0.05), [cfg.hue, cfg.sat, cfg.light]);

  return (
    <>
      <ambientLight intensity={0.18} />
      <directionalLight position={[3, 4, 5]} intensity={0.55} color="#fff2dd" />
      <directionalLight position={[-4, -2, -3]} intensity={0.22} color="#3a4a66" />
      <pointLight position={[0, 0, 2.2]} intensity={0.6} color={sparkleColor} distance={6} />

      <Sphere cfg={cfg} />
      <Rings cfg={cfg} />

      <Sparkles
        count={cfg.sparkleCount}
        scale={4.2}
        size={1.6}
        speed={cfg.sparkleSpeed}
        opacity={0.55}
        color={sparkleColor}
        noise={1.4}
      />
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
  useEffect(() => {
    setWebglOk(detectWebGL());
  }, []);

  return (
    <div
      className={`relative aspect-square select-none pointer-events-none ${className}`}
      aria-hidden
    >
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
              // Prevent context-lost events from bubbling as runtime errors.
              gl.domElement.addEventListener("webglcontextlost", (e) => e.preventDefault());
            }}
          >
            <Suspense fallback={null}>
              <Scene state={state} />
            </Suspense>
          </Canvas>
        </CanvasErrorBoundary>
      ) : null}
    </div>
  );
}
