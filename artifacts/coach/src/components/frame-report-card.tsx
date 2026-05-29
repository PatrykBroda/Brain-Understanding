import { forwardRef } from "react";
import { beltKey } from "@/components/belt";
import type { BeltKey } from "@workspace/archetypes";
import type { Fighter, VideoAnalysis, NervousSystemLoad } from "@/lib/api";

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
  low: "#6ee7b7",
  moderate: "#d6a05a",
  elevated: "#f0b955",
  high: "#f0594f",
};

function scoreColor(v: number): string {
  if (v >= 70) return "#6ee7b7";
  if (v >= 45) return "#d6a05a";
  return "#f0594f";
}

// The shareable FRAME REPORT. Pure inline styles (no Tailwind tokens) so html-to-image
// renders it identically off-DOM. Numbers come straight from the analysis row — every
// value was derived from real pose metrics on the client, never fabricated.
export const FrameReportCard = forwardRef<
  HTMLDivElement,
  { analysis: VideoAnalysis; fighter: Fighter | null }
>(function FrameReportCard({ analysis, fighter }, ref) {
  const key = fighter ? beltKey(fighter.level) : null;
  const accent = key ? BELT_ACCENT[key] : "#c4382e";
  const spirit = fighter?.spiritAnimal ? `${basePath}/spirit/${fighter.spiritAnimal}.png` : null;

  return (
    <div
      ref={ref}
      style={{
        width: 380,
        background: "radial-gradient(120% 80% at 50% 0%, #161311 0%, #0a0908 60%, #060504 100%)",
        color: "#ece7df",
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
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
          <div style={{ fontSize: 9, letterSpacing: "0.4em", textTransform: "uppercase", color: "#8c857a" }}>
            FRAME Report
          </div>
          <div style={{ fontSize: 15, letterSpacing: "0.18em", textTransform: "uppercase", marginTop: 4, color: "#f3efe7" }}>
            {fighter?.name ?? "Athlete"}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 8, letterSpacing: "0.3em", textTransform: "uppercase", color: "#8c857a" }}>
            {analysis.kind}
          </div>
          <div style={{ fontSize: 8, letterSpacing: "0.2em", color: "#6f685e", marginTop: 3 }}>
            {analysis.durationSec.toFixed(0)}s read
          </div>
        </div>
      </div>

      {/* session score */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginTop: 18 }}>
        <div style={{ fontSize: 52, lineHeight: 1, fontWeight: 600, color: scoreColor(analysis.sessionScore) }}>
          {analysis.sessionScore}
        </div>
        <div style={{ fontSize: 14, color: "#6f685e" }}>/100</div>
        <div style={{ marginLeft: "auto", textAlign: "right" }}>
          <div style={{ fontSize: 8, letterSpacing: "0.3em", textTransform: "uppercase", color: "#8c857a" }}>
            Session score
          </div>
          {analysis.styleProfile && (
            <div style={{ fontSize: 12, letterSpacing: "0.08em", color: accent, marginTop: 3 }}>
              {analysis.styleProfile}
            </div>
          )}
        </div>
      </div>

      {/* attribute bars */}
      <div style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 11 }}>
        {analysis.scores.map((s) => (
          <div key={s.key}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, letterSpacing: "0.18em", textTransform: "uppercase" }}>
              <span style={{ color: "#aaa298" }}>{s.label}</span>
              <span style={{ color: scoreColor(s.value) }}>{s.value}</span>
            </div>
            <div style={{ height: 5, background: "rgba(255,255,255,0.07)", marginTop: 5, borderRadius: 2 }}>
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
        <div style={{ fontSize: 9, letterSpacing: "0.25em", textTransform: "uppercase", color: "#8c857a" }}>
          Fragmentation risk
        </div>
        <div
          style={{
            fontSize: 10,
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            color: RISK_COLOR[analysis.fragmentationRisk],
            border: `1px solid ${RISK_COLOR[analysis.fragmentationRisk]}55`,
            padding: "3px 10px",
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
            fontFamily: "Georgia, serif",
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
          <div style={{ fontSize: 8, letterSpacing: "0.3em", textTransform: "uppercase", color: "#8c857a" }}>
            Resembles
          </div>
          {analysis.styleParallels.map((p, i) => (
            <div key={i} style={{ marginTop: 6 }}>
              <span style={{ fontSize: 11, letterSpacing: "0.05em", color: "#e6e0d6" }}>{p.name}</span>
              {p.note && (
                <div style={{ fontSize: 10, lineHeight: 1.45, color: "#8c857a", marginTop: 2 }}>{p.note}</div>
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
          borderTop: "1px solid rgba(255,255,255,0.07)",
          display: "flex",
          justifyContent: "space-between",
          fontSize: 8,
          letterSpacing: "0.25em",
          textTransform: "uppercase",
          color: "#6f685e",
        }}
      >
        <span>FRAME · Calibration System</span>
        <span>Derived from movement</span>
      </div>
    </div>
  );
});
