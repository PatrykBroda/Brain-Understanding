interface CosmicOrbProps {
  state?: "idle" | "active" | "streaming";
  className?: string;
}

export function CosmicOrb({ state = "idle", className = "" }: CosmicOrbProps) {
  const spinSeconds = state === "streaming" ? 22 : state === "active" ? 30 : 38;
  const glowOpacity = state === "streaming" ? 0.55 : state === "active" ? 0.4 : 0.28;

  return (
    <div className={`relative aspect-square ${className}`}>
      <div
        className="absolute -inset-[30%] rounded-full pointer-events-none cosmic-glow"
        style={{ opacity: glowOpacity }}
      />

      <div className="absolute -inset-[6%] rounded-full border border-foreground/[0.05]" />
      <div className="absolute -inset-[18%] rounded-full border border-foreground/[0.035]" />
      <div className="absolute -inset-[32%] rounded-full border border-foreground/[0.022]" />

      <CrosshairTicks />

      <div
        className="absolute inset-[6%] rounded-full overflow-hidden"
        style={{
          background:
            "radial-gradient(circle at 32% 26%, #2c2c2e 0%, #131316 38%, #07070a 72%, #000 100%)",
          boxShadow:
            "0 0 60px rgba(0,0,0,0.75), inset 0 0 20px rgba(0,0,0,0.55)",
        }}
      >
        <div
          className="absolute inset-0"
          style={{
            animation: `cosmic-spin ${spinSeconds}s linear infinite`,
            willChange: "transform",
          }}
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
      </div>

      <style>{`
        @keyframes cosmic-spin {
          from { transform: translate3d(0, 0, 0); }
          to   { transform: translate3d(-50%, 0, 0); }
        }
        @keyframes cosmic-glow-pulse {
          0%, 100% { transform: scale(1); filter: blur(38px); }
          50%      { transform: scale(1.06); filter: blur(48px); }
        }
        .cosmic-glow {
          background:
            radial-gradient(circle at 50% 50%,
              hsla(var(--primary), 0.45) 0%,
              hsla(var(--primary), 0.18) 22%,
              hsla(220, 70%, 55%, 0.08) 45%,
              transparent 65%);
          filter: blur(38px);
          animation: cosmic-glow-pulse 6s ease-in-out infinite;
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
