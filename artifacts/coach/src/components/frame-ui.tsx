/**
 * FRAME design-system primitives for the web app (v3 "Dark Chrome").
 * Mirrors artifacts/frame-mobile/components/ui. Styling lives in index.css
 * (.glass, .numeral, .eyebrow, .pill, .atmo …); these add the SVG instruments
 * and the small shared parts (Status, Metric, EmptyState, Atmosphere).
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { AlertCircle, Circle, Loader2 } from "lucide-react";

const GOLD = "#B9A477";
const GOLD_PALE = "#D4C7A3";
const RED_TEXT = "#E5645A";
const TRACK = "rgba(255,255,255,0.09)";

function polar(cx: number, cy: number, r: number, deg: number) {
  const a = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}
function arc(cx: number, cy: number, r: number, from: number, to: number) {
  const s = polar(cx, cy, r, from);
  const e = polar(cx, cy, r, to);
  return `M ${s.x} ${s.y} A ${r} ${r} 0 ${to - from > 180 ? 1 : 0} 1 ${e.x} ${e.y}`;
}

export function usePrefersReducedMotion() {
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

/** 240-degree gauge: thin track, solid gold arc (red for caution), tabular numeral. No tick rim, no glow. */
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
    const t0 = performance.now();
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / 320);
      setP(target * (1 - Math.pow(1 - k, 3)));
      if (k < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [target, reduced]);

  const START = -120;
  const END = 120;
  const c = size / 2;
  const sw = Math.max(4, Math.round(size / 48));
  const r = size / 2 - sw - 4;
  const valDeg = START + (END - START) * p;
  const stroke = tone === "red" ? RED_TEXT : GOLD;
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
        <path d={arc(c, c, r, START, END)} stroke={TRACK} strokeWidth={sw} fill="none" strokeLinecap="round" />
        {p > 0.003 && (
          <path d={arc(c, c, r, START, valDeg)} stroke={stroke} strokeWidth={sw} fill="none" strokeLinecap="round" />
        )}
      </svg>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center pb-1.5">
        <span className="numeral" style={{ fontSize: Math.min(64, size * 0.26), lineHeight: 1 }}>
          {text}
        </span>
        {unit && <span className="mt-1 text-sm text-muted-foreground">{unit}</span>}
        {label && <span className="label mt-2">{label}</span>}
      </div>
    </div>
  );
}

/** Horizontal scale: thin track, solid fill, small solid marker. */
export function TickScale({
  value,
  max = 100,
  width = 280,
  height = 24,
  tone = "gold",
  className,
}: {
  value: number;
  max?: number;
  width?: number;
  height?: number;
  /** kept for API compatibility */
  ticks?: number;
  tone?: "gold" | "red";
  className?: string;
}) {
  const pct = Math.max(0, Math.min(1, max > 0 ? value / max : 0));
  const color = tone === "red" ? RED_TEXT : GOLD;
  const pad = 6;
  const x = pad + (width - pad * 2) * pct;
  const y = height / 2;
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
      <line x1={pad} x2={width - pad} y1={y} y2={y} stroke={TRACK} strokeWidth={4} strokeLinecap="round" />
      {pct > 0 && <line x1={pad} x2={x} y1={y} y2={y} stroke={color} strokeWidth={4} strokeLinecap="round" />}
      <circle cx={x} cy={y} r={6} fill={color} stroke="#08090B" strokeWidth={2} />
    </svg>
  );
}

/** Thin line chart: solid stroke, faint area wash, small solid end point. */
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
  const stroke = tone === "red" ? RED_TEXT : GOLD;
  const gid = `spk-${tone}`;
  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} style={{ maxWidth: width }} aria-hidden>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={stroke} stopOpacity={0.14} />
          <stop offset="1" stopColor={stroke} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={`${d} L ${last.x} ${height} L ${pts[0].x} ${height} Z`} fill={`url(#${gid})`} />
      <path d={d} stroke={stroke} strokeWidth={1.75} fill="none" strokeLinecap="round" />
      <circle cx={last.x} cy={last.y} r={3.5} fill={stroke} />
    </svg>
  );
}

/** Segmented filter pills (role=tablist). Pills are correct here: filters. */
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

/* ------------------------------------------------------------------ */
/* Shared small components (mirror mobile Status / Metric / EmptyState / Atmosphere) */
/* ------------------------------------------------------------------ */

type StatusTone = "neutral" | "gold" | "red" | "ok";
const STATUS_CLASS: Record<StatusTone, string> = {
  neutral: "chip",
  gold: "chip chip-gold",
  red: "chip chip-red",
  ok: "chip chip-ok",
};

/** Compact status chip. ALWAYS carries a text label; the leading dot repeats the tone. */
export function Status({ label, tone = "neutral", className = "" }: { label: string; tone?: StatusTone; className?: string }) {
  return (
    <span className={`${STATUS_CLASS[tone]} ${className}`}>
      <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full bg-current" />
      {label}
    </span>
  );
}

/** A real product number: sentence-case label + tabular value (+ unit/hint). Null renders an em dash. */
export function Metric({
  label,
  value,
  unit,
  hint,
  size = "m",
  align = "left",
  className = "",
}: {
  label: string;
  value: string | number | null | undefined;
  unit?: string;
  hint?: string;
  size?: "l" | "m" | "s";
  align?: "left" | "center";
  className?: string;
}) {
  const empty = value == null || value === "";
  const sz = size === "l" ? "numeral-l" : size === "s" ? "text-xl" : "numeral-m";
  return (
    <div
      className={`flex flex-col ${align === "center" ? "items-center text-center" : "items-start"} ${className}`}
      role="group"
      aria-label={`${label} ${empty ? "no data" : value}${unit ? " " + unit : ""}${hint ? ", " + hint : ""}`}
    >
      <span className="label mb-0.5">{label}</span>
      <span className="flex items-baseline gap-1">
        <span className={`numeral ${sz}`} style={empty ? { color: "var(--f-text-3)" } : undefined}>
          {empty ? "—" : String(value)}
        </span>
        {unit && !empty && <span className="text-sm text-muted-foreground">{unit}</span>}
      </span>
      {hint && <span className="mt-0.5 text-xs" style={{ color: "var(--f-text-3)" }}>{hint}</span>}
    </div>
  );
}

/** One component for the non-happy states: empty (next action), loading (quiet spinner), error (retry). */
export function EmptyState({
  kind = "empty",
  title,
  body,
  actionLabel,
  onAction,
  icon,
  className = "",
}: {
  kind?: "empty" | "loading" | "error";
  title: string;
  body?: string;
  actionLabel?: string;
  onAction?: () => void;
  icon?: ReactNode;
  className?: string;
}) {
  const isErr = kind === "error";
  return (
    <div
      className={`glass ${isErr ? "glass-red" : ""} flex flex-col items-center gap-2 px-6 py-6 text-center ${className}`}
      role={isErr ? "alert" : kind === "loading" ? "status" : undefined}
      aria-busy={kind === "loading" || undefined}
    >
      {kind === "loading" ? (
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground motion-reduce:animate-none" strokeWidth={1.75} aria-hidden />
      ) : (
        <span
          className="mb-1 grid h-11 w-11 place-items-center rounded-[14px] border"
          style={{
            background: "var(--f-raised)",
            borderColor: isErr ? "rgba(229,100,90,0.3)" : "var(--f-border)",
            color: isErr ? "var(--f-red-text)" : "var(--f-text-2)",
          }}
        >
          {icon ?? (isErr ? <AlertCircle className="h-5 w-5" strokeWidth={1.75} /> : <Circle className="h-5 w-5" strokeWidth={1.75} />)}
        </span>
      )}
      <p className="text-[17px] font-semibold leading-snug text-foreground">{title}</p>
      {body && <p className="max-w-[34ch] text-sm leading-5 text-muted-foreground">{body}</p>}
      {actionLabel && onAction && (
        <button type="button" onClick={onAction} className={`${isErr ? "btn-glass" : "btn-bronze"} mt-2 w-full sm:w-auto`}>
          {actionLabel}
        </button>
      )}
    </div>
  );
}

/**
 * Wrapper that gives a screen ONE decorative focal light (silver or champagne).
 * The light is an absolutely positioned, pointer-events-none first child; content sits above it.
 */
export function Atmosphere({
  light = "silver",
  className = "",
  children,
}: {
  light?: "silver" | "silver-left" | "silver-bottom" | "champagne" | "champagne-tr";
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div className={`relative ${className}`}>
      <div className={`atmo atmo-${light}`} aria-hidden />
      <div className="relative z-10">{children}</div>
    </div>
  );
}

export { GOLD, GOLD_PALE };
