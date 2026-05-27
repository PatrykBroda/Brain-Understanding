import { useId } from "react";

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

interface OrbVisuals {
  coreL: number;
  rimHue: number;
  rimSat: number;
  rimLight: number;
  bloomHue: number;
  bloomSat: number;
  bloomAlpha: number;
  breathSeconds: number;
  breathAmplitude: number;
}

/**
 * Per-state visual posture. All stay inside a dark-warm palette — no neon,
 * no gaming HUD. The differences are subtle: rim brightness, glow saturation,
 * breath rate. Read each block as a nervous-system temperature.
 */
const VISUALS: Record<OrbState, OrbVisuals> = {
  dormant:      { coreL: 4, rimHue: 215, rimSat:  8, rimLight: 38, bloomHue: 215, bloomSat: 14, bloomAlpha: 0.10, breathSeconds: 9.5, breathAmplitude: 0.010 },
  stable:       { coreL: 4, rimHue:  32, rimSat: 18, rimLight: 46, bloomHue:  30, bloomSat: 22, bloomAlpha: 0.14, breathSeconds: 7.5, breathAmplitude: 0.014 },
  loaded:       { coreL: 5, rimHue:  24, rimSat: 32, rimLight: 52, bloomHue:  22, bloomSat: 36, bloomAlpha: 0.20, breathSeconds: 6.0, breathAmplitude: 0.020 },
  recovering:   { coreL: 4, rimHue: 205, rimSat: 22, rimLight: 44, bloomHue: 205, bloomSat: 24, bloomAlpha: 0.13, breathSeconds: 10.0, breathAmplitude: 0.011 },
  tight:        { coreL: 4, rimHue:  38, rimSat: 18, rimLight: 42, bloomHue:  36, bloomSat: 18, bloomAlpha: 0.12, breathSeconds: 5.2, breathAmplitude: 0.008 },
  volatile:     { coreL: 5, rimHue:  14, rimSat: 34, rimLight: 50, bloomHue:  12, bloomSat: 38, bloomAlpha: 0.22, breathSeconds: 5.5, breathAmplitude: 0.024 },
  composed:     { coreL: 4, rimHue:  35, rimSat: 38, rimLight: 52, bloomHue:  35, bloomSat: 40, bloomAlpha: 0.18, breathSeconds: 7.0, breathAmplitude: 0.013 },
  overextended: { coreL: 3, rimHue: 220, rimSat: 10, rimLight: 34, bloomHue: 220, bloomSat: 12, bloomAlpha: 0.08, breathSeconds: 11.0, breathAmplitude: 0.008 },
  streaming:    { coreL: 5, rimHue:  35, rimSat: 52, rimLight: 58, bloomHue:  35, bloomSat: 54, bloomAlpha: 0.28, breathSeconds: 4.5, breathAmplitude: 0.022 },
};

export function CosmicOrb({ state = "dormant", className = "" }: CosmicOrbProps) {
  const v = VISUALS[state];
  const uid = useId().replace(/:/g, "");
  const ringFade = `frame-ring-fade-${uid}`;
  const ringMask = `frame-ring-mask-${uid}`;
  const meshFade = `frame-mesh-fade-${uid}`;
  const sphereClip = `frame-sphere-clip-${uid}`;
  const meshMask = `frame-mesh-mask-${uid}`;
  const core = `hsl(0 0% ${v.coreL}%)`;
  const coreDeep = `hsl(0 0% 0%)`;
  const rim = `hsla(${v.rimHue} ${v.rimSat}% ${v.rimLight}% / 0.85)`;
  const rimSoft = `hsla(${v.rimHue} ${v.rimSat}% ${v.rimLight}% / 0.35)`;
  const bloom = `hsla(${v.bloomHue} ${v.bloomSat}% 50% / ${v.bloomAlpha})`;
  const bloomEdge = `hsla(${v.bloomHue} ${v.bloomSat}% 50% / 0)`;
  const breathUp = (1 + v.breathAmplitude).toFixed(4);
  const breathDown = (1 - v.breathAmplitude * 0.5).toFixed(4);

  return (
    <div
      key={state}
      className={`relative aspect-square select-none pointer-events-none ${className}`}
      style={
        {
          ["--breath-up" as string]: breathUp,
          ["--breath-down" as string]: breathDown,
          ["--breath-s" as string]: `${v.breathSeconds}s`,
        } as React.CSSProperties
      }
    >
      {/* Outer volumetric glow — atmosphere, not a halo. Wide, soft, low-alpha. */}
      <div
        className="absolute -inset-[35%] rounded-full"
        style={{
          background: `radial-gradient(circle at 50% 50%, ${bloom} 0%, ${bloomEdge} 60%)`,
          filter: "blur(40px)",
          mixBlendMode: "screen",
          animation: `frame-orb-glow ${(v.breathSeconds * 1.4).toFixed(2)}s ease-in-out infinite`,
        }}
      />

      {/* Concentric orbital rings behind the sphere — targeting marks, ultra-subtle. */}
      <svg viewBox="0 0 200 200" className="absolute inset-0 w-full h-full" aria-hidden>
        <defs>
          <radialGradient id={ringFade} cx="50%" cy="50%" r="50%">
            <stop offset="55%" stopColor="white" stopOpacity="0" />
            <stop offset="78%" stopColor="white" stopOpacity="1" />
            <stop offset="100%" stopColor="white" stopOpacity="0" />
          </radialGradient>
          <mask id={ringMask}>
            <rect width="200" height="200" fill={`url(#${ringFade})`} />
          </mask>
        </defs>
        <g mask={`url(#${ringMask})`} stroke="white" fill="none" strokeWidth="0.35">
          <circle cx="100" cy="100" r="62" opacity="0.07" />
          <circle cx="100" cy="100" r="74" opacity="0.05" />
          <circle cx="100" cy="100" r="88" opacity="0.035" />
        </g>
        <g stroke="white" strokeWidth="0.4" opacity="0.10">
          <line x1="100" y1="6" x2="100" y2="11" />
          <line x1="100" y1="189" x2="100" y2="194" />
          <line x1="6" y1="100" x2="11" y2="100" />
          <line x1="189" y1="100" x2="194" y2="100" />
        </g>
      </svg>

      {/* The sphere — breath animation lives here so the glow stays steady */}
      <div
        className="absolute inset-[18%] rounded-full"
        style={{
          background: `radial-gradient(circle at 36% 28%, hsl(0 0% 18%) 0%, hsl(0 0% 9%) 22%, ${core} 55%, ${coreDeep} 100%)`,
          boxShadow: `
            inset 0 1px 1px ${rim},
            inset 0 0 60px hsl(0 0% 0% / 0.6),
            inset 0 -30px 60px hsl(0 0% 0% / 0.5),
            0 30px 80px -10px hsl(0 0% 0% / 0.9),
            0 0 90px ${rimSoft}
          `,
          animation: `frame-orb-breath ${v.breathSeconds}s ease-in-out infinite`,
        }}
      >
        {/* Internal mesh — latitude lines, masked to sphere, suggest planet topology */}
        <svg
          viewBox="0 0 100 100"
          className="absolute inset-0 w-full h-full rounded-full overflow-hidden"
          aria-hidden
          preserveAspectRatio="xMidYMid slice"
        >
          <defs>
            <radialGradient id={meshFade} cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="white" stopOpacity="0.6" />
              <stop offset="70%" stopColor="white" stopOpacity="0.3" />
              <stop offset="100%" stopColor="white" stopOpacity="0" />
            </radialGradient>
            <clipPath id={sphereClip}>
              <circle cx="50" cy="50" r="50" />
            </clipPath>
            <mask id={meshMask}>
              <circle cx="50" cy="50" r="50" fill={`url(#${meshFade})`} />
            </mask>
          </defs>
          <g
            clipPath={`url(#${sphereClip})`}
            mask={`url(#${meshMask})`}
            stroke={`hsla(${v.rimHue} ${v.rimSat}% ${v.rimLight + 8}% / 0.5)`}
            fill="none"
            strokeWidth="0.18"
          >
            <ellipse cx="50" cy="50" rx="48" ry="6" opacity="0.55" />
            <ellipse cx="50" cy="38" rx="44" ry="5" opacity="0.35" />
            <ellipse cx="50" cy="62" rx="44" ry="5" opacity="0.35" />
            <ellipse cx="50" cy="28" rx="38" ry="4" opacity="0.22" />
            <ellipse cx="50" cy="72" rx="38" ry="4" opacity="0.22" />
            <ellipse cx="50" cy="20" rx="30" ry="3" opacity="0.14" />
            <ellipse cx="50" cy="80" rx="30" ry="3" opacity="0.14" />
            <ellipse cx="50" cy="50" rx="6" ry="48" opacity="0.18" />
          </g>
        </svg>

        {/* Inner atmospheric tint — equatorial warmth that breathes opacity */}
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background: `radial-gradient(circle at 50% 62%, hsla(${v.rimHue} ${v.rimSat}% ${v.rimLight}% / 0.35) 0%, transparent 55%)`,
            mixBlendMode: "screen",
            animation: `frame-orb-atmos ${(v.breathSeconds * 1.3).toFixed(2)}s ease-in-out infinite`,
          }}
        />

        {/* Specular — single bright highlight, makes it feel material not digital */}
        <div
          className="absolute inset-0 rounded-full pointer-events-none"
          style={{
            background:
              "radial-gradient(circle at 32% 24%, hsla(0 0% 100% / 0.18) 0%, hsla(0 0% 100% / 0.04) 14%, transparent 34%)",
          }}
        />

        {/* Outer-edge vignette — re-asserts roundness against any rim-light lift */}
        <div
          className="absolute inset-0 rounded-full pointer-events-none"
          style={{
            background:
              "radial-gradient(circle at center, transparent 58%, hsla(0 0% 0% / 0.55) 88%, hsla(0 0% 0% / 0.95) 100%)",
          }}
        />
      </div>

      <style>{`
        @keyframes frame-orb-breath {
          0%, 100% { transform: scale(var(--breath-down, 0.992)); }
          50%      { transform: scale(var(--breath-up, 1.018)); }
        }
        @keyframes frame-orb-glow {
          0%, 100% { opacity: 0.55; }
          50%      { opacity: 1; }
        }
        @keyframes frame-orb-atmos {
          0%, 100% { opacity: 0.5; }
          50%      { opacity: 0.95; }
        }
      `}</style>
    </div>
  );
}
