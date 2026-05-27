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
  /** Core sphere base hue — kept biological, never neon. */
  coreHue: string;
  /** Soft environmental glow that sits behind the sphere. */
  bloomHue: string;
  /** Inner atmospheric tint. */
  atmosphereHue: string;
  /** Outer rim tint — the "edge of presence". */
  rimHue: string;
  /** Seconds per breath cycle. Slower = more composed, faster = more activated. */
  breathSeconds: number;
  /** Seconds per ambient opacity drift. */
  driftSeconds: number;
  /** Base luminance of the bloom (0..1). */
  bloomLuminance: number;
  /** Slight scale delta on breath (e.g. 0.02 = 2% breathing range). */
  breathAmplitude: number;
}

/**
 * State visuals. Read each block as a posture — these aren't gaming-UI palettes,
 * they're nervous-system temperatures. Default neutral is warm-grey; activated
 * states warm slightly; recovering states cool slightly; volatile widens the
 * breath range; composed tightens it.
 */
const VISUALS: Record<OrbState, OrbVisuals> = {
  dormant: {
    coreHue: "215 8% 14%",
    bloomHue: "215 12% 32%",
    atmosphereHue: "215 14% 38%",
    rimHue: "215 14% 42%",
    breathSeconds: 9,
    driftSeconds: 14,
    bloomLuminance: 0.32,
    breathAmplitude: 0.012,
  },
  stable: {
    coreHue: "30 6% 12%",
    bloomHue: "30 14% 38%",
    atmosphereHue: "30 18% 46%",
    rimHue: "30 22% 52%",
    breathSeconds: 7.5,
    driftSeconds: 13,
    bloomLuminance: 0.5,
    breathAmplitude: 0.016,
  },
  loaded: {
    coreHue: "20 12% 14%",
    bloomHue: "20 30% 42%",
    atmosphereHue: "20 38% 50%",
    rimHue: "20 42% 56%",
    breathSeconds: 6,
    driftSeconds: 11,
    bloomLuminance: 0.62,
    breathAmplitude: 0.022,
  },
  recovering: {
    coreHue: "205 10% 12%",
    bloomHue: "205 22% 36%",
    atmosphereHue: "205 26% 44%",
    rimHue: "205 28% 50%",
    breathSeconds: 10,
    driftSeconds: 16,
    bloomLuminance: 0.42,
    breathAmplitude: 0.013,
  },
  tight: {
    coreHue: "35 8% 12%",
    bloomHue: "35 18% 36%",
    atmosphereHue: "35 22% 42%",
    rimHue: "35 24% 48%",
    breathSeconds: 5,
    driftSeconds: 10,
    bloomLuminance: 0.46,
    breathAmplitude: 0.01,
  },
  volatile: {
    coreHue: "12 14% 14%",
    bloomHue: "12 34% 44%",
    atmosphereHue: "12 38% 52%",
    rimHue: "12 42% 58%",
    breathSeconds: 5.5,
    driftSeconds: 9,
    bloomLuminance: 0.7,
    breathAmplitude: 0.026,
  },
  composed: {
    coreHue: "var(--primary-h) 10% 14%",
    bloomHue: "var(--primary-h) 30% 42%",
    atmosphereHue: "var(--primary-h) 36% 50%",
    rimHue: "var(--primary-h) 40% 56%",
    breathSeconds: 7,
    driftSeconds: 12,
    bloomLuminance: 0.6,
    breathAmplitude: 0.015,
  },
  overextended: {
    coreHue: "220 8% 11%",
    bloomHue: "220 14% 30%",
    atmosphereHue: "220 16% 36%",
    rimHue: "220 18% 40%",
    breathSeconds: 11,
    driftSeconds: 18,
    bloomLuminance: 0.28,
    breathAmplitude: 0.009,
  },
  streaming: {
    coreHue: "var(--primary-h) 14% 16%",
    bloomHue: "var(--primary-h) 50% 52%",
    atmosphereHue: "var(--primary-h) 54% 58%",
    rimHue: "var(--primary-h) 58% 62%",
    breathSeconds: 4.5,
    driftSeconds: 8,
    bloomLuminance: 0.82,
    breathAmplitude: 0.024,
  },
};

export function CosmicOrb({ state = "dormant", className = "" }: CosmicOrbProps) {
  const v = VISUALS[state];

  // Compose hsla colors. `coreHue` etc are space-separated H S% L% (or CSS var)
  const bloom = `hsla(${v.bloomHue} / ${(v.bloomLuminance * 0.7).toFixed(3)})`;
  const bloomEdge = `hsla(${v.bloomHue} / 0)`;
  const atmosphere = `hsla(${v.atmosphereHue} / 0.55)`;
  const rim = `hsla(${v.rimHue} / 0.65)`;
  const coreInner = `hsla(${v.coreHue} / 1)`;
  const coreMid = `hsla(${v.coreHue} / 1)`;

  // Stable React-key so animation seeds restart per state change
  return (
    <div
      key={state}
      className={`relative aspect-square select-none pointer-events-none ${className}`}
      style={
        {
          animation: `frame-orb-breath ${v.breathSeconds}s ease-in-out infinite`,
          ["--breath-up" as string]: (1 + v.breathAmplitude).toFixed(4),
          ["--breath-down" as string]: (1 - v.breathAmplitude * 0.4).toFixed(4),
        } as React.CSSProperties
      }
    >
      {/* outer environmental bloom — a held breath of light in the room around the orb */}
      <div
        className="absolute -inset-[48%] rounded-full"
        style={{
          background: `radial-gradient(circle at 50% 50%, ${bloom} 0%, ${bloomEdge} 62%)`,
          filter: "blur(48px)",
          animation: `frame-orb-drift ${v.driftSeconds}s ease-in-out infinite`,
          mixBlendMode: "screen",
        }}
      />

      {/* the sphere itself — dark, organic, lit from upper-left like a wet stone */}
      <div
        className="absolute inset-[8%] rounded-full overflow-hidden"
        style={{
          background: `
            radial-gradient(circle at 34% 28%, hsla(0 0% 22% / 1) 0%, ${coreMid} 32%, ${coreInner} 68%, #050507 100%)
          `,
          boxShadow: `
            0 30px 90px -20px rgba(0,0,0,0.85),
            inset 0 0 60px rgba(0,0,0,0.55),
            0 0 80px ${atmosphere}
          `,
        }}
      >
        {/* inner atmosphere — soft tint at the equator that drifts in opacity, like breath inside the surface */}
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background: `radial-gradient(circle at 50% 60%, ${atmosphere} 0%, transparent 55%)`,
            mixBlendMode: "screen",
            animation: `frame-orb-atmosphere ${(v.breathSeconds * 1.4).toFixed(2)}s ease-in-out infinite`,
          }}
        />

        {/* deep vignette so the sphere reads as round, not flat */}
        <div
          className="absolute inset-0 rounded-full pointer-events-none"
          style={{
            background:
              "radial-gradient(circle at center, transparent 40%, rgba(0,0,0,0.55) 82%, rgba(0,0,0,0.95) 100%)",
          }}
        />

        {/* specular — the single highlight that makes it feel material, not digital */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(circle at 30% 22%, rgba(255,255,255,0.14) 0%, rgba(255,255,255,0.04) 16%, transparent 38%)",
          }}
        />

        {/* faint under-rim warmth — light that exists just at the bottom curve, like reflected floor */}
        <div
          className="absolute inset-0 rounded-full pointer-events-none mix-blend-screen"
          style={{
            background: `radial-gradient(circle at 50% 100%, ${rim} 0%, transparent 36%)`,
            opacity: 0.55,
            animation: `frame-orb-atmosphere ${(v.breathSeconds * 1.6).toFixed(2)}s ease-in-out infinite`,
          }}
        />
      </div>

      <style>{`
        @keyframes frame-orb-breath {
          0%, 100% { transform: scale(var(--breath-down, 0.992)); }
          50%      { transform: scale(var(--breath-up, 1.018)); }
        }
        @keyframes frame-orb-drift {
          0%, 100% { opacity: 0.7; }
          50%      { opacity: 1; }
        }
        @keyframes frame-orb-atmosphere {
          0%, 100% { opacity: 0.45; }
          50%      { opacity: 0.85; }
        }
      `}</style>
    </div>
  );
}
