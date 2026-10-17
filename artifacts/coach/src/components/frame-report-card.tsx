import { forwardRef } from "react";
import { beltKey } from "@/components/belt";
import type { BeltKey } from "@workspace/archetypes";
import type { Fighter, VideoAnalysis, NervousSystemLoad } from "@/lib/api";
import { isBjjSport } from "@/lib/fighter-options";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

const BELT_ACCENT: Record<BeltKey, string> = {
  white: "#e7e2d2",
  blue: "#2f6fd0",
  purple: "#7a3fd6",
  brown: "#7a4a2a",
  black: "#c4382e",
};

const RISK_LABEL: Record<NervousSystemLoad, string> = {
  low: "Low",
  moderate: "Moderate",
  elevated: "Elevated",
  high: "High",
};

const RISK_COLOR: Record<NervousSystemLoad, string> = {
  low: "#D4C7A3",
  moderate: "#B9A477",
  elevated: "#E8A06A",
  high: "#E5645A",
};

function scoreColor(v: number): string {
  if (v >= 70) return "#D4C7A3";
  if (v >= 45) return "#B9A477";
  return "#E5645A";
}

const SANS = "'Outfit Variable','Outfit',system-ui,-apple-system,sans-serif";
const DISPLAY_FONT = "'Unbounded Variable','Unbounded','Outfit Variable',system-ui,sans-serif";

function polar(cx: number, cy: number, r: number, deg: number) {
  const a = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}
function arcPath(cx: number, cy: number, r: number, from: number, to: number) {
  const s = polar(cx, cy, r, from);
  const e = polar(cx, cy, r, to);
  return `M ${s.x} ${s.y} A ${r} ${r} 0 ${to - from > 180 ? 1 : 0} 1 ${e.x} ${e.y}`;
}

// Static 240deg dial (inline SVG so html-to-image renders it exactly).
function ScoreDial({ value, color }: { value: number; color: string }) {
  const size = 150;
  const c = size / 2;
  const start = -120;
  const end = 120;
  const v = Math.max(0, Math.min(100, value));
  const valEnd = start + ((end - start) * v) / 100;
  const ticks = Array.from({ length: 41 }, (_, i) => i);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: "block" }}>
      {ticks.map((i) => {
        const deg = start + ((end - start) * i) / 40;
        const major = i % 5 === 0;
        const p1 = polar(c, c, c - 4, deg);
        const p2 = polar(c, c, c - (major ? 11 : 8), deg);
        return (
          <line key={i} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="rgba(255,255,255,0.22)" strokeWidth={major ? 1.2 : 0.8} />
        );
      })}
      <path d={arcPath(c, c, c - 20, start, end)} stroke="rgba(255,255,255,0.09)" strokeWidth={4} fill="none" strokeLinecap="round" />
      <path d={arcPath(c, c, c - 20, start, Math.max(start + 0.5, valEnd))} stroke={color} strokeWidth={4} fill="none" strokeLinecap="round" />
    </svg>
  );
}

// The shareable FRAME REPORT. Pure inline styles (no Tailwind tokens) so html-to-image
// renders it identically off-DOM. Numbers come straight from the analysis row — every
// value was derived from real pose metrics on the client, never fabricated.
export const FrameReportCard = forwardRef<
  HTMLDivElement,
  { analysis: VideoAnalysis; fighter: Fighter | null }
>(function FrameReportCard({ analysis, fighter }, ref) {
  const key = fighter && isBjjSport(fighter.primarySport) ? beltKey(fighter.level) : null;
  const accent = key ? BELT_ACCENT[key] : "#B9A477";
  const spirit = fighter?.spiritAnimal ? `${basePath}/spirit/${fighter.spiritAnimal}.png` : null;

  return (
    <div
      ref={ref}
      style={{
        width: 380,
        background: "radial-gradient(120% 80% at 50% 0%, #161311 0%, #08090B 60%, #060504 100%)",
        color: "#ece7df",
        fontFamily: SANS,
        padding: "26px 24px 22px",
        border: "1px solid rgba(255,255,255,0.08)",
        position: "relative",
        overflow: "hidden",
        boxSizing: "border-box",
      }}
    >
      {/* top hairline accent */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 2,
          background: `linear-gradient(90deg, transparent, ${accent}, transparent)`,
        }}
      />

      {/* spirit watermark */}
      {spirit && (
        <img
          src={spirit}
          alt=""
          crossOrigin="anonymous"
          style={{
            position: "absolute",
            right: -28,
            top: 44,
            width: 168,
            height: 168,
            opacity: 0.08,
            objectFit: "contain",
            pointerEvents: "none",
          }}
        />
      )}

      {/* header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontSize: 9, letterSpacing: "0.4em", textTransform: "", color: "#8c857a" }}>
            FRAME Report
          </div>
          <div style={{ fontFamily: DISPLAY_FONT, fontWeight: 250, letterSpacing: "-0.03em", fontSize: 22, lineHeight: 1.15, marginTop: 4, color: "#F4F4F1" }}>
            {fighter?.name ?? "Athlete"}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 10, letterSpacing: "0.16em", textTransform: "", color: "#A4A8AE" }}>
            {analysis.kind}
          </div>
          <div style={{ fontSize: 11, letterSpacing: "0.06em", color: "#A4A8AE", marginTop: 3 }}>
            {analysis.durationSec.toFixed(0)}s read
          </div>
        </div>
      </div>

      {/* session score */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 16 }}>
        <div style={{ position: "relative", width: 150, height: 150, flex: "none" }}>
          <ScoreDial value={analysis.sessionScore} color={scoreColor(analysis.sessionScore)} />
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
            <div style={{ fontSize: 54, lineHeight: 1, fontWeight: 200, letterSpacing: "-0.04em", color: "#F4F4F1" }}>
              {analysis.sessionScore}
            </div>
            <div style={{ fontSize: 10, letterSpacing: "0.16em", color: "#A4A8AE", marginTop: 2 }}>/100</div>
          </div>
        </div>
        <div style={{ marginLeft: "auto", textAlign: "right", minWidth: 0 }}>
          <div style={{ fontSize: 10, letterSpacing: "0.16em", textTransform: "", color: "#A4A8AE" }}>
            Session score
          </div>
          {analysis.styleProfile && (
            <div style={{ fontFamily: DISPLAY_FONT, fontWeight: 250, letterSpacing: "-0.02em", fontSize: 15, lineHeight: 1.2, color: accent, marginTop: 6 }}>
              {analysis.styleProfile}
            </div>
          )}
        </div>
      </div>

      {/* attribute bars */}
      <div style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 11 }}>
        {analysis.scores.map((s) => (
          <div key={s.key}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, letterSpacing: "0.18em", textTransform: "" }}>
              <span style={{ color: "#aaa298" }}>{s.label}</span>
              <span style={{ color: scoreColor(s.value) }}>{s.value}</span>
            </div>
            <div style={{ height: 3, background: "rgba(255,255,255,0.09)", marginTop: 6, borderRadius: 3 }}>
              <div
                style={{
                  width: `${s.value}%`,
                  height: "100%",
                  background: scoreColor(s.value),
                  borderRadius: 2,
                }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* fragmentation risk */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 18 }}>
        <div style={{ fontSize: 9, letterSpacing: "0.25em", textTransform: "", color: "#8c857a" }}>
          Fragmentation risk
        </div>
        <div
          style={{
            fontSize: 10,
            letterSpacing: "0.2em",
            textTransform: "",
            color: RISK_COLOR[analysis.fragmentationRisk],
            border: `1px solid ${RISK_COLOR[analysis.fragmentationRisk]}55`,
            padding: "5px 14px",
            borderRadius: 999,
          }}
        >
          {RISK_LABEL[analysis.fragmentationRisk]}
        </div>
      </div>

      {/* ai comment */}
      {analysis.aiComment && (
        <div
          style={{
            marginTop: 18,
            fontFamily: DISPLAY_FONT,
            fontSize: 13,
            lineHeight: 1.5,
            color: "#d8d2c8",
            borderLeft: `2px solid ${accent}`,
            paddingLeft: 12,
          }}
        >
          {analysis.aiComment}
        </div>
      )}

      {/* style parallels */}
      {analysis.styleParallels.length > 0 && (
        <div style={{ marginTop: 18 }}>
          <div style={{ fontSize: 10, letterSpacing: "0.16em", textTransform: "", color: "#A4A8AE" }}>
            Resembles
          </div>
          {analysis.styleParallels.map((p, i) => (
            <div key={i} style={{ marginTop: 6 }}>
              <span style={{ fontSize: 13, color: "#F4F4F1" }}>{p.name}</span>
              {p.note && (
                <div style={{ fontSize: 12, lineHeight: 1.45, color: "#A4A8AE", marginTop: 2 }}>{p.note}</div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* footer */}
      <div
        style={{
          marginTop: 20,
          paddingTop: 12,
          borderTop: "1px solid rgba(255,255,255,0.09)",
          display: "flex",
          justifyContent: "space-between",
          fontSize: 8,
          letterSpacing: "0.25em",
          textTransform: "",
          color: "#6f685e",
        }}
      >
        <span>FRAME · Calibration System</span>
        <span>Derived from movement</span>
      </div>
    </div>
  );
});
