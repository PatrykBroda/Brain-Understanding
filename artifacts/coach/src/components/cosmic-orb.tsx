import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from "react";

export type OrbState = "dormant" | "calm" | "warming" | "lockedIn" | "streaming";

interface CosmicOrbProps {
  state?: OrbState;
  className?: string;
}

interface OrbVisuals {
  glowColor: string;
  glowSecondary: string;
  glowOpacity: number;
  glowBlur: number;
  spinSeconds: number;
  pulseSeconds: number;
}

const VISUALS: Record<OrbState, OrbVisuals> = {
  dormant: {
    glowColor: "hsla(215, 18%, 55%, 0.18)",
    glowSecondary: "hsla(220, 20%, 45%, 0.06)",
    glowOpacity: 0.55,
    glowBlur: 28,
    spinSeconds: 52,
    pulseSeconds: 9,
  },
  calm: {
    glowColor: "hsla(200, 60%, 60%, 0.32)",
    glowSecondary: "hsla(210, 55%, 50%, 0.12)",
    glowOpacity: 0.7,
    glowBlur: 38,
    spinSeconds: 40,
    pulseSeconds: 6.5,
  },
  warming: {
    glowColor: "hsla(35, 75%, 60%, 0.32)",
    glowSecondary: "hsla(210, 55%, 50%, 0.1)",
    glowOpacity: 0.75,
    glowBlur: 42,
    spinSeconds: 32,
    pulseSeconds: 5.5,
  },
  lockedIn: {
    glowColor: "hsla(var(--primary), 0.55)",
    glowSecondary: "hsla(var(--primary), 0.16)",
    glowOpacity: 0.85,
    glowBlur: 46,
    spinSeconds: 26,
    pulseSeconds: 4.5,
  },
  streaming: {
    glowColor: "hsla(var(--primary), 0.7)",
    glowSecondary: "hsla(var(--primary), 0.22)",
    glowOpacity: 0.95,
    glowBlur: 50,
    spinSeconds: 18,
    pulseSeconds: 3.2,
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
    <div className={`relative aspect-square select-none ${className}`}>
      <div
        className="absolute -inset-[30%] rounded-full pointer-events-none cosmic-glow"
        style={{
          background: `radial-gradient(circle at 50% 50%, ${visuals.glowColor} 0%, ${visuals.glowSecondary} 24%, transparent 65%)`,
          opacity: visuals.glowOpacity,
          filter: `blur(${visuals.glowBlur}px)`,
          animation: `cosmic-glow-pulse ${visuals.pulseSeconds}s ease-in-out infinite`,
        }}
      />

      <div className="absolute -inset-[6%] rounded-full border border-foreground/[0.05]" />
      <div className="absolute -inset-[18%] rounded-full border border-foreground/[0.035]" />
      <div className="absolute -inset-[32%] rounded-full border border-foreground/[0.022]" />

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
            "radial-gradient(circle at 32% 26%, #2c2c2e 0%, #131316 38%, #07070a 72%, #000 100%)",
          boxShadow: "0 0 60px rgba(0,0,0,0.75), inset 0 0 20px rgba(0,0,0,0.55)",
        }}
      >
        <div
          ref={surfaceRef}
          className="absolute inset-0 pointer-events-none"
          style={{ willChange: "transform" }}
        >
          <TopoSurface />
        </div>

        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(circle at center, transparent 38%, rgba(0,0,0,0.55) 78%, rgba(0,0,0,0.95) 100%)",
          }}
        />

        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(circle at 28% 22%, rgba(255,255,255,0.14) 0%, rgba(255,255,255,0.04) 18%, transparent 42%)",
          }}
        />

        <div
          className="absolute inset-0 pointer-events-none rounded-full mix-blend-screen"
          style={{
            background: `radial-gradient(circle at 50% 100%, ${visuals.glowColor} 0%, transparent 35%)`,
            opacity: 0.55,
          }}
        />
      </div>

      <style>{`
        @keyframes cosmic-glow-pulse {
          0%, 100% { transform: scale(1); }
          50%      { transform: scale(1.06); }
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
        stroke="rgba(180,180,185,0.55)"
        strokeWidth="0.35"
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

    const opacity = 0.42 - distFromCenter * 0.3;
    const sw = 0.5 + equatorWeight * 0.35;
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
          stroke={`rgba(225,228,232,${p.opacity.toFixed(3)})`}
          strokeWidth={p.sw}
          fill="none"
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </svg>
  );
}
