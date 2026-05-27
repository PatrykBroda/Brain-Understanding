interface FrameOctagonProps {
  size?: number;
  spin?: boolean;
  spinSeconds?: number;
  color?: string;
  glow?: boolean;
  className?: string;
}

function octagonPoints(radius: number, rotationDeg = 22.5): string {
  const pts: string[] = [];
  for (let i = 0; i < 8; i++) {
    const angle = ((rotationDeg + i * 45) * Math.PI) / 180;
    const x = radius * Math.cos(angle);
    const y = radius * Math.sin(angle);
    pts.push(`${x.toFixed(2)},${y.toFixed(2)}`);
  }
  return pts.join(" ");
}

// The FRAME mark: an outer octagon + 8 inner octagons of equal size, each
// rotated by 5.625° relative to the previous, all centered. The interference
// pattern reads as a woven mandala. Stroke-only, no fill — themes cleanly.
export function FrameOctagon({
  size = 64,
  spin = false,
  spinSeconds = 6,
  color = "currentColor",
  glow = true,
  className = "",
}: FrameOctagonProps) {
  const half = size / 2;
  const outerR = half * 0.96;
  const innerR = half * 0.72;
  const strokeOuter = Math.max(0.8, size / 64);
  const strokeInner = Math.max(0.5, size / 110);

  return (
    <div
      className={`relative inline-block ${className}`}
      style={{ width: size, height: size }}
    >
      {glow && (
        <div
          className="absolute inset-0 rounded-full pointer-events-none frame-oct-glow"
          style={{
            background: `radial-gradient(circle at 50% 50%, hsla(var(--primary), 0.28) 0%, hsla(var(--primary), 0.08) 38%, transparent 70%)`,
            filter: `blur(${Math.max(8, size / 6)}px)`,
          }}
        />
      )}
      <svg
        viewBox={`-${half} -${half} ${size} ${size}`}
        width={size}
        height={size}
        className="relative block"
        style={{
          animation: spin
            ? `frame-oct-spin ${spinSeconds}s linear infinite`
            : undefined,
          willChange: spin ? "transform" : undefined,
          color,
        }}
      >
        <g stroke={color} fill="none" vectorEffect="non-scaling-stroke">
          <polygon
            points={octagonPoints(outerR)}
            strokeWidth={strokeOuter}
            opacity={0.95}
          />
          {Array.from({ length: 8 }).map((_, i) => {
            const rot = i * (45 / 8);
            return (
              <polygon
                key={i}
                points={octagonPoints(innerR, 22.5 + rot)}
                strokeWidth={strokeInner}
                opacity={0.55 + (i % 2) * 0.18}
              />
            );
          })}
          <circle cx={0} cy={0} r={innerR * 0.06} fill={color} stroke="none" opacity={0.8} />
        </g>
      </svg>
      <style>{`
        @keyframes frame-oct-spin {
          0%   { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @keyframes frame-oct-glow {
          0%, 100% { opacity: 0.7; transform: scale(0.96); }
          50%      { opacity: 1;   transform: scale(1.06); }
        }
        .frame-oct-glow { animation: frame-oct-glow 3.2s ease-in-out infinite; }
      `}</style>
    </div>
  );
}
