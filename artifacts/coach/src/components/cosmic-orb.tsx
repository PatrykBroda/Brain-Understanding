interface CosmicOrbProps {
  size?: number;
  state?: "idle" | "active" | "streaming";
}

export function CosmicOrb({ size = 320, state = "idle" }: CosmicOrbProps) {
  const glowOpacity = state === "streaming" ? 0.7 : state === "active" ? 0.45 : 0.25;
  const spinSeconds = state === "streaming" ? 28 : 60;

  return (
    <div
      className="relative flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      <div
        className="absolute inset-[-40%] cosmic-glow"
        style={{ opacity: glowOpacity }}
      />

      <div
        className="absolute inset-[-10%] rounded-full border border-foreground/[0.04]"
        style={{ animation: "cosmic-ring-pulse 8s ease-in-out infinite" }}
      />
      <div
        className="absolute inset-[-22%] rounded-full border border-foreground/[0.03]"
        style={{ animation: "cosmic-ring-pulse 11s ease-in-out infinite", animationDelay: "1.5s" }}
      />
      <div
        className="absolute inset-[-34%] rounded-full border border-foreground/[0.02]"
        style={{ animation: "cosmic-ring-pulse 14s ease-in-out infinite", animationDelay: "3s" }}
      />

      <Crosshair size={size} />

      <div
        className="relative rounded-full overflow-hidden"
        style={{
          width: size * 0.78,
          height: size * 0.78,
          background:
            "radial-gradient(circle at 32% 28%, hsl(0,0%,18%) 0%, hsl(0,0%,7%) 45%, hsl(0,0%,3%) 75%, hsl(0,0%,0%) 100%)",
          boxShadow:
            "inset -18px -18px 60px rgba(0,0,0,0.9), inset 14px 12px 50px rgba(255,255,255,0.04), 0 0 80px rgba(0,0,0,0.6)",
        }}
      >
        <div
          className="absolute inset-0"
          style={{
            animation: `cosmic-spin ${spinSeconds}s linear infinite`,
            willChange: "transform",
          }}
        >
          <TopoBand />
        </div>

        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(circle at 30% 25%, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.02) 25%, transparent 50%)",
          }}
        />

        <div
          className="absolute inset-0 rounded-full"
          style={{
            boxShadow: "inset 0 0 30px rgba(0,0,0,0.85)",
          }}
        />
      </div>

      <style>{`
        @keyframes cosmic-spin {
          from { transform: translateX(0); }
          to { transform: translateX(-50%); }
        }
        @keyframes cosmic-ring-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.45; transform: scale(1.015); }
        }
        @keyframes cosmic-glow-pulse {
          0%, 100% { filter: blur(60px); transform: scale(1); }
          50% { filter: blur(80px); transform: scale(1.08); }
        }
        .cosmic-glow {
          background:
            radial-gradient(circle at center,
              hsla(var(--primary), 0.35) 0%,
              hsla(var(--primary), 0.15) 25%,
              hsla(220, 70%, 50%, 0.08) 45%,
              transparent 70%);
          filter: blur(60px);
          animation: cosmic-glow-pulse 6s ease-in-out infinite;
          pointer-events: none;
        }
      `}</style>
    </div>
  );
}

function Crosshair({ size }: { size: number }) {
  const tick = size * 0.06;
  const off = size * 0.5;
  const inset = size * 0.5 - size * 0.42;
  return (
    <svg
      width={size}
      height={size}
      className="absolute inset-0 pointer-events-none"
      viewBox={`0 0 ${size} ${size}`}
    >
      <g stroke="hsl(0,0%,55%)" strokeWidth="0.8" opacity="0.7">
        <line x1={off} y1={inset} x2={off} y2={inset + tick} />
        <line x1={off} y1={size - inset - tick} x2={off} y2={size - inset} />
        <line x1={inset} y1={off} x2={inset + tick} y2={off} />
        <line x1={size - inset - tick} y1={off} x2={size - inset} y2={off} />
      </g>
    </svg>
  );
}

function TopoBand() {
  const width = 800;
  const height = 400;
  const lines = 22;
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="200%"
      height="100%"
      preserveAspectRatio="none"
      style={{ display: "block" }}
    >
      <defs>
        <linearGradient id="topo-fade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="white" stopOpacity="0" />
          <stop offset="0.2" stopColor="white" stopOpacity="0.85" />
          <stop offset="0.5" stopColor="white" stopOpacity="1" />
          <stop offset="0.8" stopColor="white" stopOpacity="0.85" />
          <stop offset="1" stopColor="white" stopOpacity="0" />
        </linearGradient>
        <mask id="topo-mask">
          <rect x="0" y="0" width={width} height={height} fill="url(#topo-fade)" />
        </mask>
      </defs>
      <g mask="url(#topo-mask)">
        {Array.from({ length: lines }).map((_, i) => {
          const y = (i / (lines - 1)) * height;
          const amp = 18 + Math.sin(i * 0.9) * 10;
          const offset = i * 23;
          const d =
            `M 0 ${y} ` +
            `Q ${100 + offset / 4} ${y + amp} 200 ${y} ` +
            `T 400 ${y} ` +
            `T 600 ${y} ` +
            `T 800 ${y}`;
          const opacity = 0.18 + Math.sin(i * 0.7) * 0.1;
          return (
            <path
              key={i}
              d={d}
              fill="none"
              stroke={`rgba(220,220,220,${opacity})`}
              strokeWidth={0.8}
            />
          );
        })}
      </g>
    </svg>
  );
}
