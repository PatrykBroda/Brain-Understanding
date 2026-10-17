/**
 * FRAME design-system primitives for the web app ("Smoked Bronze").
 * Mirrors artifacts/frame-mobile/components/ui. Styling lives in index.css
 * (.glass, .numeral, .eyebrow, .pill …); these add the SVG instruments.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";

const GOLD = "#8A6A2F";
const GOLD_LIGHT = "#C7A15A";
const GOLD_PALE = "#E6D2A3";
const RED = "#BF1D1D";
const RED_LIGHT = "#E0564E";

function polar(cx: number, cy: number, r: number, deg: number) {
  const a = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}
function arc(cx: number, cy: number, r: number, from: number, to: number) {
  const s = polar(cx, cy, r, from);
  const e = polar(cx, cy, r, to);
  return `M ${s.x} ${s.y} A ${r} ${r} 0 ${to - from > 180 ? 1 : 0} 1 ${e.x} ${e.y}`;
}

function usePrefersReducedMotion() {
  const [r, setR] = useState(false);
  useEffect(() => {
    const m = window.matchMedia("(prefers-reduced-motion: reduce)");
    setR(m.matches);
    const h = (e: MediaQueryListEvent) => setR(e.matches);
    m.addEventListener("change", h);
    return () => m.removeEventListener("change", h);
  }, []);
  return r;
}

/** 240° tick-rim dial with a bronze (or crimson) value arc and a thin oversized numeral. */
export function ArcGauge({
  value,
  max = 100,
  size = 220,
  label,
  unit,
  tone = "gold",
  display,
}: {
  value: number;
  max?: number;
  size?: number;
  label?: string;
  unit?: string;
  tone?: "gold" | "red";
  display?: string;
}) {
  const reduced = usePrefersReducedMotion();
  const target = Math.max(0, Math.min(1, max > 0 ? value / max : 0));
  const [p, setP] = useState(0);
  const raf = useRef(0);
  useEffect(() => {
    if (reduced) {
      setP(target);
      return;
    }
    const from = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / 1100);
      setP(from + (target - from) * (1 - Math.pow(1 - k, 3)));
      if (k < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [target, reduced]);

  const START = -120;
  const END = 120;
  const c = size / 2;
  const r = size / 2 - 22;
  const valDeg = START + (END - START) * p;
  const hi = tone === "red" ? RED_LIGHT : GOLD_PALE;
  const lo = tone === "red" ? RED : GOLD;
  const knob = polar(c, c, r, valDeg);
  const id = `arc-${tone}-${size}`;
  const text = display ?? String(Math.round(value));
  return (
    <div
      className="relative"
      style={{ width: size, height: size * 0.86 }}
      role="progressbar"
      aria-label={`${label ?? "Score"} ${text}${unit ? " " + unit : ""}`}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.round(value)}
    >
      <svg width={size} height={size} aria-hidden>
        <defs>
          <linearGradient id={id} x1="0" y1="1" x2="1" y2="0">
            <stop offset="0" stopColor={lo} />
            <stop offset="1" stopColor={hi} />
          </linearGradient>
        </defs>
        {Array.from({ length: 41 }, (_, i) => {
          const deg = START + ((END - START) * i) / 40;
          const major = i % 5 === 0;
          const a = polar(c, c, r + 9, deg);
          const b = polar(c, c, r + (major ? 17 : 13), deg);
          return (
            <line
              key={i}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke={deg <= valDeg ? GOLD_LIGHT : "rgba(255,244,224,0.20)"}
              strokeWidth={major ? 1.4 : 1}
              strokeLinecap="round"
            />
          );
        })}
        <path d={arc(c, c, r, START, END)} stroke="rgba(255,244,224,0.09)" strokeWidth={5} fill="none" strokeLinecap="round" />
        {p > 0.003 && (
          <path d={arc(c, c, r, START, valDeg)} stroke={`url(#${id})`} strokeWidth={5} fill="none" strokeLinecap="round" />
        )}
        <circle cx={knob.x} cy={knob.y} r={11} fill={lo} opacity={0.22} />
        <circle cx={knob.x} cy={knob.y} r={5.5} fill={hi} />
        <circle cx={knob.x} cy={knob.y} r={2} fill="#050505" />
      </svg>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center pb-1.5">
        <span className="numeral" style={{ fontSize: size * 0.3, lineHeight: 1 }}>
          {text}
        </span>
        {unit && <span className="mt-0.5 text-xs text-muted-foreground">{unit}</span>}
        {label && <span className="eyebrow eyebrow-gold mt-2">{label}</span>}
      </div>
    </div>
  );
}

/** Horizontal tick-mark scale with a glowing marker. */
export function TickScale({
  value,
  max = 100,
  width = 280,
  height = 34,
  ticks = 41,
  tone = "gold",
  className,
}: {
  value: number;
  max?: number;
  width?: number;
  height?: number;
  ticks?: number;
  tone?: "gold" | "red";
  className?: string;
}) {
  const pct = Math.max(0, Math.min(1, max > 0 ? value / max : 0));
  const lit = tone === "red" ? RED_LIGHT : GOLD_LIGHT;
  const x = 6 + (width - 12) * pct;
  return (
    <svg
      className={className}
      width="100%"
      viewBox={`0 0 ${width} ${height}`}
      style={{ maxWidth: width }}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.round(value)}
    >
      {Array.from({ length: ticks }, (_, i) => {
        const tx = 6 + ((width - 12) * i) / (ticks - 1);
        const major = i % 5 === 0;
        return (
          <line
            key={i}
            x1={tx}
            x2={tx}
            y1={height - (major ? 16 : 10)}
            y2={height - 2}
            stroke={tx <= x ? lit : "rgba(255,244,224,0.20)"}
            strokeWidth={major ? 1.4 : 1}
            strokeLinecap="round"
          />
        );
      })}
      <circle cx={x} cy={height - 20} r={6} fill={lit} opacity={0.25} />
      <circle cx={x} cy={height - 20} r={3} fill={lit} />
    </svg>
  );
}

/** Thin refined line chart with a soft area wash and a glowing last point. */
export function Sparkline({
  data,
  width = 280,
  height = 64,
  tone = "gold",
}: {
  data: number[];
  width?: number;
  height?: number;
  tone?: "gold" | "red";
}) {
  if (data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const pad = 6;
  const pts = data.map((v, i) => ({
    x: pad + ((width - pad * 2) * i) / (data.length - 1),
    y: pad + (height - pad * 2) * (1 - (v - min) / span),
  }));
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const mx = (a.x + b.x) / 2;
    d += ` C ${mx} ${a.y} ${mx} ${b.y} ${b.x} ${b.y}`;
  }
  const last = pts[pts.length - 1];
  const stroke = tone === "red" ? RED_LIGHT : GOLD_LIGHT;
  const gid = `spk-${tone}`;
  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} style={{ maxWidth: width }} aria-hidden>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={stroke} stopOpacity={0.22} />
          <stop offset="1" stopColor={stroke} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={`${d} L ${last.x} ${height} L ${pts[0].x} ${height} Z`} fill={`url(#${gid})`} />
      <path d={d} stroke={stroke} strokeWidth={1.5} fill="none" strokeLinecap="round" />
      <circle cx={last.x} cy={last.y} r={7} fill={stroke} opacity={0.22} />
      <circle cx={last.x} cy={last.y} r={3} fill={stroke} />
    </svg>
  );
}

/** Pill segmented control (role=tablist). */
export function PillTabs<T extends string>({
  tabs,
  value,
  onChange,
  className = "",
}: {
  tabs: { key: T; label: ReactNode }[];
  value: T;
  onChange: (k: T) => void;
  className?: string;
}) {
  return (
    <div role="tablist" className={`flex gap-2 overflow-x-auto ${className}`}>
      {tabs.map((t) => (
        <button
          key={t.key}
          role="tab"
          type="button"
          aria-selected={t.key === value}
          onClick={() => onChange(t.key)}
          className="pill shrink-0"
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
