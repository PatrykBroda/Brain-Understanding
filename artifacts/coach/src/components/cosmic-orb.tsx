import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from "react";

export type OrbState = "dormant" | "calm" | "warming" | "lockedIn" | "streaming";

interface CosmicOrbProps {
  state?: OrbState;
  className?: string;
}

interface OrbVisuals {
  glowColor: string;
  glowSecondary: string;
  bloomColor: string;
  glowOpacity: number;
  glowBlur: number;
  bloomBlur: number;
  spinSeconds: number;
  pulseSeconds: number;
  rimColor: string;
}

const VISUALS: Record<OrbState, OrbVisuals> = {
  dormant: {
    glowColor: "hsla(215, 35%, 65%, 0.45)",
    glowSecondary: "hsla(220, 30%, 55%, 0.18)",
    bloomColor: "hsla(210, 30%, 60%, 0.22)",
    glowOpacity: 0.85,
    glowBlur: 36,
    bloomBlur: 80,
    spinSeconds: 52,
    pulseSeconds: 8,
    rimColor: "hsla(210, 40%, 70%, 0.5)",
  },
  calm: {
    glowColor: "hsla(200, 75%, 65%, 0.55)",
    glowSecondary: "hsla(210, 65%, 55%, 0.22)",
    bloomColor: "hsla(200, 70%, 60%, 0.28)",
    glowOpacity: 0.95,
    glowBlur: 44,
    bloomBlur: 90,
    spinSeconds: 40,
    pulseSeconds: 6.5,
    rimColor: "hsla(200, 75%, 70%, 0.6)",
  },
  warming: {
    glowColor: "hsla(32, 90%, 62%, 0.6)",
    glowSecondary: "hsla(20, 80%, 55%, 0.25)",
    bloomColor: "hsla(28, 85%, 60%, 0.3)",
    glowOpacity: 1,
    glowBlur: 48,
    bloomBlur: 96,
    spinSeconds: 32,
    pulseSeconds: 5.5,
    rimColor: "hsla(30, 90%, 68%, 0.65)",
  },
  lockedIn: {
    glowColor: "hsla(var(--primary), 0.85)",
    glowSecondary: "hsla(var(--primary), 0.32)",
    bloomColor: "hsla(var(--primary), 0.42)",
    glowOpacity: 1,
    glowBlur: 54,
    bloomBlur: 110,
    spinSeconds: 26,
    pulseSeconds: 4.5,
    rimColor: "hsla(var(--primary), 0.7)",
  },
  streaming: {
    glowColor: "hsla(var(--primary), 1)",
    glowSecondary: "hsla(var(--primary), 0.45)",
    bloomColor: "hsla(var(--primary), 0.6)",
    glowOpacity: 1,
    glowBlur: 60,
    bloomBlur: 130,
    spinSeconds: 18,
    pulseSeconds: 3.2,
    rimColor: "hsla(var(--primary), 0.85)",
  },
};

export function CosmicOrb({ state = "dormant", className = "" }: CosmicOrbProps) {
  const visuals = VISUALS[state];

  const surfaceRef = useRef<HTMLDivElement>(null);
  const sphereRef = useRef<HTMLDivElement>(null);
  const offsetRef = useRef(0);
  const velocityRef = useRef(0);
  const draggingRef = useRef(false);
  const lastPointerXRef = useRef(0);
  const lastMoveTimeRef = useRef(0);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const baseSpeed = 50 / visuals.spinSeconds;

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      if (!draggingRef.current) {
        velocityRef.current *= Math.pow(0.25, dt);
        const speed = baseSpeed + velocityRef.current;
        offsetRef.current = ((offsetRef.current + speed * dt) % 50 + 50) % 50;
      }

      if (surfaceRef.current) {
        surfaceRef.current.style.transform = `translate3d(${-offsetRef.current}%, 0, 0)`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [visuals.spinSeconds]);

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    draggingRef.current = true;
    lastPointerXRef.current = e.clientX;
    lastMoveTimeRef.current = performance.now();
    velocityRef.current = 0;
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const width = rect.width || 1;
    const pctPerPx = 50 / width;
    const dx = e.clientX - lastPointerXRef.current;
    lastPointerXRef.current = e.clientX;
    const now = performance.now();
    const dt = Math.max(0.005, (now - lastMoveTimeRef.current) / 1000);
    lastMoveTimeRef.current = now;

    offsetRef.current = ((offsetRef.current - dx * pctPerPx) % 50 + 50) % 50;
    velocityRef.current = (-dx * pctPerPx) / dt;
  };

  const endDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* noop */
    }
  };

  return (
    <div
      className={`relative aspect-square select-none ${className}`}
      style={{ animation: `cosmic-orb-breath ${(visuals.pulseSeconds * 1.7).toFixed(1)}s ease-in-out infinite` }}
    >
      {/* outermost bloom — wide, soft, slow breathing — this is the new "alive" layer */}
      <div
        className="absolute -inset-[55%] rounded-full pointer-events-none cosmic-bloom"
        style={{
          background: `radial-gradient(circle at 50% 50%, ${visuals.bloomColor} 0%, transparent 60%)`,
          filter: `blur(${visuals.bloomBlur}px)`,
          animation: `cosmic-bloom-pulse ${(visuals.pulseSeconds * 1.4).toFixed(1)}s ease-in-out infinite`,
        }}
      />

      {/* mid glow */}
      <div
        className="absolute -inset-[30%] rounded-full pointer-events-none cosmic-glow"
        style={{
          background: `radial-gradient(circle at 50% 50%, ${visuals.glowColor} 0%, ${visuals.glowSecondary} 28%, transparent 65%)`,
          opacity: visuals.glowOpacity,
          filter: `blur(${visuals.glowBlur}px)`,
          animation: `cosmic-glow-pulse ${visuals.pulseSeconds}s ease-in-out infinite`,
        }}
      />

      <div className="absolute -inset-[6%] rounded-full border border-foreground/[0.06]" />
      <div className="absolute -inset-[18%] rounded-full border border-foreground/[0.04]" />
      <div className="absolute -inset-[32%] rounded-full border border-foreground/[0.025]" />

      <CrosshairTicks />

      <div
        ref={sphereRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        className="absolute inset-[6%] rounded-full overflow-hidden cursor-grab active:cursor-grabbing touch-none"
        style={{
          background:
            "radial-gradient(circle at 32% 26%, #34343a 0%, #161618 38%, #08080a 72%, #000 100%)",
          boxShadow: `0 0 80px ${visuals.glowColor}, 0 0 60px rgba(0,0,0,0.75), inset 0 0 24px rgba(0,0,0,0.55)`,
        }}
      >
        <div
          ref={surfaceRef}
          className="absolute inset-0 pointer-events-none"
          style={{ willChange: "transform" }}
        >
          <TopoSurface />
        </div>

        {/* atmosphere — inner edge tint that breathes */}
        <div
          className="absolute inset-0 pointer-events-none rounded-full cosmic-atmosphere"
          style={{
            background: `radial-gradient(circle at center, transparent 50%, ${visuals.glowColor} 92%, transparent 100%)`,
            mixBlendMode: "screen",
            opacity: 0.55,
            animation: `cosmic-atmosphere ${(visuals.pulseSeconds * 1.2).toFixed(1)}s ease-in-out infinite`,
          }}
        />

        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(circle at center, transparent 38%, rgba(0,0,0,0.45) 78%, rgba(0,0,0,0.92) 100%)",
          }}
        />

        {/* specular highlight */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(circle at 28% 22%, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0.05) 18%, transparent 42%)",
          }}
        />

        {/* warm under-rim glow */}
        <div
          className="absolute inset-0 pointer-events-none rounded-full mix-blend-screen"
          style={{
            background: `radial-gradient(circle at 50% 100%, ${visuals.glowColor} 0%, transparent 38%)`,
            opacity: 0.7,
          }}
        />
      </div>

      <style>{`
        @keyframes cosmic-glow-pulse {
          0%, 100% { transform: scale(0.98); opacity: ${(visuals.glowOpacity * 0.8).toFixed(3)}; }
          50%      { transform: scale(1.08); opacity: ${visuals.glowOpacity.toFixed(3)}; }
        }
        @keyframes cosmic-bloom-pulse {
          0%, 100% { transform: scale(0.92); opacity: 0.65; }
          50%      { transform: scale(1.12); opacity: 1; }
        }
        @keyframes cosmic-atmosphere {
          0%, 100% { opacity: 0.4; }
          50%      { opacity: 0.75; }
        }
        @keyframes cosmic-orb-breath {
          0%, 100% { transform: scale(1); }
          50%      { transform: scale(1.018); }
        }
      `}</style>
    </div>
  );
}

function CrosshairTicks() {
  return (
    <svg
      className="absolute inset-0 pointer-events-none"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
    >
      <g
        stroke="rgba(200,200,210,0.7)"
        strokeWidth="0.4"
        fill="none"
        vectorEffect="non-scaling-stroke"
      >
        <line x1="50" y1="0" x2="50" y2="4.5" />
        <line x1="50" y1="95.5" x2="50" y2="100" />
        <line x1="0" y1="50" x2="4.5" y2="50" />
        <line x1="95.5" y1="50" x2="100" y2="50" />
      </g>
    </svg>
  );
}

function TopoSurface() {
  const W = 400;
  const H = 200;
  const lineCount = 16;
  const step = 6;

  const paths: { d: string; opacity: number; sw: number }[] = [];
  for (let i = 0; i < lineCount; i++) {
    const baseY = 10 + (i / (lineCount - 1)) * (H - 20);
    const distFromCenter = Math.abs(baseY - H / 2) / (H / 2);
    const equatorWeight = 1 - distFromCenter;
    const amp = 2.5 + equatorWeight * 6;
    const phase1 = i * 0.55;
    const phase2 = i * 1.3 + 0.7;

    const pts: string[] = [];
    for (let x = 0; x <= W * 2; x += step) {
      const t = (x / W) * Math.PI * 2;
      const y =
        baseY +
        Math.sin(t * 2 + phase1) * amp +
        Math.sin(t * 5 + phase2) * amp * 0.35;
      pts.push(`${x === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(2)}`);
    }

    const opacity = 0.5 - distFromCenter * 0.32;
    const sw = 0.55 + equatorWeight * 0.4;
    paths.push({ d: pts.join(" "), opacity, sw });
  }

  return (
    <svg
      viewBox={`0 0 ${W * 2} ${H}`}
      preserveAspectRatio="none"
      width="200%"
      height="100%"
      style={{ display: "block" }}
    >
      {paths.map((p, i) => (
        <path
          key={i}
          d={p.d}
          stroke={`rgba(230,232,238,${p.opacity.toFixed(3)})`}
          strokeWidth={p.sw}
          fill="none"
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </svg>
  );
}
