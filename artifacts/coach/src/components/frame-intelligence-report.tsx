import { forwardRef } from "react";
import type { Fighter, WeeklyReport, WeeklyReportLearnedItem } from "@/lib/api";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

// Matte-black + gold editorial language, shared with the session FRAME REPORT.
const GOLD = "#d6a05a";
const GOLD_SOFT = "#c9a24b";
const INK = "#ece7df";
const MUTE = "#8c857a";
const FAINT = "#6f685e";
const HAIR = "rgba(255,255,255,0.07)";

const SOURCE_LABEL: Record<string, string> = {
  chat: "conversation",
  video: "footage",
  calibration: "calibration",
  analysis: "analysis",
};

function sourceLabel(t: string): string {
  return SOURCE_LABEL[t] ?? t.replace(/_/g, " ");
}

function TinyLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 8, letterSpacing: "0.3em", textTransform: "uppercase", color: MUTE }}>
      {children}
    </div>
  );
}

function LearnedRow({ item, tag, tagColor }: { item: WeeklyReportLearnedItem; tag: string; tagColor: string }) {
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "baseline", marginTop: 7 }}>
      <span
        style={{
          flex: "none",
          fontSize: 7,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: tagColor,
          border: `1px solid ${tagColor}44`,
          padding: "2px 5px",
          marginTop: 1,
        }}
      >
        {tag}
      </span>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 11, lineHeight: 1.35, color: INK }}>{item.topic}</div>
        {item.domainLabel && (
          <div style={{ fontSize: 8, letterSpacing: "0.14em", textTransform: "uppercase", color: FAINT, marginTop: 2 }}>
            {item.domainLabel}
            {item.evidenceCount > 1 ? ` · seen ×${item.evidenceCount}` : ""}
          </div>
        )}
      </div>
    </div>
  );
}

// The shareable FRAME Intelligence Report. Pure inline styles so html-to-image
// renders it identically off-DOM. Every value comes straight from the honest
// server aggregation — the model never fabricates a number here.
export const FrameIntelligenceReport = forwardRef<
  HTMLDivElement,
  { report: WeeklyReport; fighter: Fighter | null }
>(function FrameIntelligenceReport({ report, fighter }, ref) {
  const spirit = fighter?.spiritAnimal ? `${basePath}/spirit/${fighter.spiritAnimal}.png` : null;
  const delta = report.confidenceDelta;
  // Only call it "last week" when the baseline truly is the prior ISO week —
  // snapshots write on view, so after a gap we name the real baseline instead.
  const baselineLabel = report.priorIsLastWeek
    ? "vs last week"
    : report.priorWeekLabel
      ? `vs ${report.priorWeekLabel}`
      : "vs prior snapshot";

  return (
    <div
      ref={ref}
      style={{
        width: 380,
        background: "radial-gradient(120% 80% at 50% 0%, #161311 0%, #0a0908 60%, #060504 100%)",
        color: INK,
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        padding: "26px 24px 20px",
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
          background: `linear-gradient(90deg, transparent, ${GOLD}, transparent)`,
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
            right: -30,
            top: 40,
            width: 176,
            height: 176,
            opacity: 0.07,
            objectFit: "contain",
            pointerEvents: "none",
          }}
        />
      )}

      {/* header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <TinyLabel>FRAME Intelligence</TinyLabel>
          <div style={{ fontSize: 15, letterSpacing: "0.18em", textTransform: "uppercase", marginTop: 4, color: "#f3efe7" }}>
            {fighter?.name ?? "Athlete"}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 8, letterSpacing: "0.3em", textTransform: "uppercase", color: MUTE }}>
            Week
          </div>
          <div style={{ fontSize: 10, letterSpacing: "0.12em", color: "#b8b0a4", marginTop: 3 }}>
            {report.weekLabel}
          </div>
        </div>
      </div>

      {/* headline — model confidence + honest delta */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginTop: 18 }}>
        <div style={{ fontSize: 52, lineHeight: 1, fontWeight: 600, color: GOLD }}>
          {report.confidence}
          <span style={{ fontSize: 22, color: GOLD_SOFT }}>%</span>
        </div>
        <div style={{ marginLeft: "auto", textAlign: "right" }}>
          <div style={{ fontSize: 8, letterSpacing: "0.3em", textTransform: "uppercase", color: MUTE }}>
            Model confidence
          </div>
          <div style={{ fontSize: 11, letterSpacing: "0.08em", color: GOLD, marginTop: 3 }}>
            {report.stage.label}
          </div>
          <div style={{ fontSize: 10, color: FAINT, marginTop: 4 }}>
            {delta == null
              ? "Baseline week"
              : delta > 0
                ? `▲ +${delta} pts ${baselineLabel}`
                : delta < 0
                  ? `▼ ${delta} pts ${baselineLabel}`
                  : `No change ${baselineLabel}`}
          </div>
        </div>
      </div>

      {report.hasActivity ? (
        <>
          {/* This week FRAME learned */}
          <div style={{ marginTop: 20 }}>
            <div style={{ fontSize: 9, letterSpacing: "0.25em", textTransform: "uppercase", color: GOLD_SOFT }}>
              This week FRAME learned
            </div>
            {report.learned.confirmed.length === 0 &&
            report.learned.observed.length === 0 &&
            report.learned.hypotheses.length === 0 ? (
              <div style={{ fontSize: 10, color: FAINT, marginTop: 8, lineHeight: 1.5 }}>
                Evidence recorded, no new distinct reads this week.
              </div>
            ) : (
              <div style={{ marginTop: 4 }}>
                {report.learned.confirmed.map((it) => (
                  <LearnedRow key={`c-${it.id}`} item={it} tag="Confirmed" tagColor="#6ee7b7" />
                ))}
                {report.learned.observed.map((it) => (
                  <LearnedRow key={`o-${it.id}`} item={it} tag="Observed" tagColor={GOLD} />
                ))}
                {report.learned.hypotheses.map((it) => (
                  <LearnedRow key={`h-${it.id}`} item={it} tag="Hypothesis" tagColor="#9aa0a6" />
                ))}
              </div>
            )}
          </div>

          {/* stat quad — only real counts */}
          <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
            {[
              { n: report.evidenceThisWeek, l: "Evidence" },
              { n: report.observationsThisWeek, l: "New reads" },
              { n: report.confirmationsThisWeek, l: "Confirmed" },
              { n: report.analysesThisWeek, l: "Sessions" },
            ].map((s, i) => (
              <div
                key={i}
                style={{
                  flex: 1,
                  border: `1px solid ${HAIR}`,
                  padding: "10px 8px",
                  textAlign: "center",
                }}
              >
                <div style={{ fontSize: 22, fontWeight: 600, color: INK, lineHeight: 1 }}>{s.n}</div>
                <div style={{ fontSize: 7, letterSpacing: "0.2em", textTransform: "uppercase", color: MUTE, marginTop: 6 }}>
                  {s.l}
                </div>
              </div>
            ))}
          </div>

          {/* most reinforced */}
          {report.mostReinforced && (
            <div style={{ marginTop: 18 }}>
              <TinyLabel>Most reinforced</TinyLabel>
              <div style={{ fontSize: 12, letterSpacing: "0.04em", color: INK, marginTop: 5 }}>
                {report.mostReinforced.topic}
              </div>
              <div style={{ fontSize: 9, color: FAINT, marginTop: 3, letterSpacing: "0.04em" }}>
                +{report.mostReinforced.sightingsThisWeek} this week
                {report.mostReinforced.sourceBreakdown.length > 0
                  ? ` · from ${report.mostReinforced.sourceBreakdown.map((b) => sourceLabel(b.type)).join(", ")}`
                  : ""}
              </div>
            </div>
          )}

          {/* understanding bands */}
          {report.domains.length > 0 && (
            <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 9 }}>
              <TinyLabel>Understanding by area</TinyLabel>
              {report.domains.map((d) => (
                <div key={d.key}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase" }}>
                    <span style={{ color: "#aaa298" }}>{d.label}</span>
                    <span style={{ color: GOLD }}>{d.coverage}</span>
                  </div>
                  <div style={{ height: 4, background: "rgba(255,255,255,0.07)", marginTop: 4, borderRadius: 2 }}>
                    <div
                      style={{
                        width: `${d.coverage}%`,
                        height: "100%",
                        background: `linear-gradient(90deg, ${GOLD_SOFT}, ${GOLD})`,
                        borderRadius: 2,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* focus next — biggest opportunity */}
          {report.biggestOpportunity && (
            <div
              style={{
                marginTop: 18,
                borderLeft: `2px solid ${GOLD}`,
                paddingLeft: 12,
              }}
            >
              <TinyLabel>Focus next</TinyLabel>
              <div style={{ fontFamily: "Georgia, serif", fontSize: 13, lineHeight: 1.45, color: "#d8d2c8", marginTop: 5 }}>
                {report.biggestOpportunity.topic}
              </div>
              {report.biggestOpportunity.domainLabel && (
                <div style={{ fontSize: 8, letterSpacing: "0.14em", textTransform: "uppercase", color: FAINT, marginTop: 3 }}>
                  {report.biggestOpportunity.domainLabel}
                </div>
              )}
            </div>
          )}
        </>
      ) : (
        /* honest empty state — never invent a busy week */
        <div style={{ marginTop: 22, marginBottom: 6 }}>
          <div style={{ fontSize: 9, letterSpacing: "0.25em", textTransform: "uppercase", color: GOLD_SOFT }}>
            Quiet week
          </div>
          <div style={{ fontFamily: "Georgia, serif", fontSize: 13, lineHeight: 1.55, color: "#d8d2c8", marginTop: 8 }}>
            No new evidence recorded this week, so there is nothing to invent. The
            model still holds {report.totalFacts} recorded{" "}
            {report.totalFacts === 1 ? "observation" : "observations"}. Train, talk,
            or drop in footage and the read sharpens.
          </div>
        </div>
      )}

      {/* archetype footer */}
      {report.archetype && (
        <div style={{ marginTop: 18, paddingTop: 12, borderTop: `1px solid ${HAIR}` }}>
          <TinyLabel>Fighting identity</TinyLabel>
          <div style={{ fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase", color: GOLD, marginTop: 5 }}>
            {report.archetype.name}
          </div>
          <div style={{ display: "flex", gap: 12, marginTop: 6 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 7, letterSpacing: "0.2em", textTransform: "uppercase", color: GOLD_SOFT }}>
                Gift
              </div>
              <div style={{ fontSize: 10, lineHeight: 1.45, color: "#b8b0a4", marginTop: 3 }}>
                {report.archetype.gift}
              </div>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 7, letterSpacing: "0.2em", textTransform: "uppercase", color: MUTE }}>
                Shadow
              </div>
              <div style={{ fontSize: 10, lineHeight: 1.45, color: "#9aa0a6", marginTop: 3 }}>
                {report.archetype.shadow}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* footer */}
      <div
        style={{
          marginTop: 18,
          paddingTop: 12,
          borderTop: `1px solid ${HAIR}`,
          display: "flex",
          justifyContent: "space-between",
          fontSize: 8,
          letterSpacing: "0.25em",
          textTransform: "uppercase",
          color: FAINT,
        }}
      >
        <span>FRAME · Intelligence Report</span>
        <span>Earned, not invented</span>
      </div>
    </div>
  );
});
