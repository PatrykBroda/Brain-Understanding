import { useState } from "react";
import { X, Crosshair, Shield, AlertTriangle, Target, ScanLine, RefreshCcw } from "lucide-react";
import { useAnalysis } from "@/hooks/use-analysis";
import { AthleteVsOpponent } from "@/components/pose-comparison";
import type {
  VideoAnalysis,
  Fighter,
  AnalysisFinding,
  AnalysisSignal,
  StyleParallel,
  Matchup,
} from "@/lib/api";

// Opponent Mode is marked by label and a neutral silver accent (never the gold of the
// athlete's own report), so a scouting read can't be mistaken for your own FRAME report.
const SCOUT = "#C9CDD2";

const SEVERITY_LABEL: Record<AnalysisFinding["severity"], string> = {
  low: "Minor",
  medium: "Notable",
  high: "Key",
};

// ─── Saved scouting read (fetched by id) ─────────────────────────────────────

export function SavedOpponentReport({
  id,
  fighter,
  onClose,
}: {
  id: number;
  fighter: Fighter | null;
  onClose: () => void;
}) {
  const { data, isLoading, isError, refetch } = useAnalysis(id);
  if (isLoading) {
    return (
      <div className="py-16 flex flex-col items-center gap-4 text-[0.9375rem] text-muted-foreground" role="status">
        <span className="h-5 w-5 rounded-full border-2 border-white/15 border-t-[#B9A477] animate-spin motion-reduce:animate-none" aria-hidden />
        Loading scouting read
      </div>
    );
  }
  if (isError || !data?.analysis) {
    return (
      <div className="space-y-4">
        <div role="alert" className="glass glass-red px-4 py-4 space-y-3">
          <div className="text-[1rem] font-medium text-[#E5645A]">Could not load this scouting read</div>
          <button type="button" onClick={() => void refetch()} className="btn-quiet btn-quiet-red">
            <RefreshCcw className="w-4 h-4" strokeWidth={1.5} />
            Try again
          </button>
        </div>
        <button type="button" onClick={onClose} className="w-full btn-quiet">
          Back
        </button>
      </div>
    );
  }
  return <OpponentReport analysis={data.analysis} fighter={fighter} onClose={onClose} />;
}

// ─── Fresh scouting read ─────────────────────────────────────────────────────

export function OpponentReport({
  analysis,
  fighter,
  onClose,
}: {
  analysis: VideoAnalysis;
  fighter: Fighter | null;
  onClose: () => void;
}) {
  const [activeKf, setActiveKf] = useState(0);
  const kf = analysis.keyframes[activeKf];
  const name = analysis.opponentName.trim();

  return (
    <div className="space-y-7">
      {/* header */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <span className="chip mb-2" style={{ color: SCOUT }}>
            <ScanLine className="w-3.5 h-3.5" strokeWidth={1.5} />
            Opponent scout
          </span>
          <div className="label tnum capitalize">
            {analysis.kind} · {analysis.durationSec.toFixed(0)}s read
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close scout"
          className="w-11 h-11 -mr-2 -mt-1 flex items-center justify-center rounded-[12px] text-muted-foreground hover:text-foreground hover:bg-white/[0.05] transition-colors flex-none"
        >
          <X className="w-5 h-5" strokeWidth={1.5} />
        </button>
      </div>

      {/* opponent identity */}
      <div className="glass px-5 py-4">
        <div className="flex items-center gap-2.5">
          <Crosshair className="w-5 h-5 flex-none" style={{ color: SCOUT }} strokeWidth={1.5} />
          <h2 className="display-heading truncate">{name || "Unnamed opponent"}</h2>
        </div>
        {analysis.styleProfile && (
          <div className="text-[0.9375rem] mt-1.5 text-muted-foreground">{analysis.styleProfile}</div>
        )}
      </div>

      {/* grounded summary */}
      {analysis.summary && (
        <p className="text-[1.0625rem] text-foreground leading-[1.65] pl-4 border-l-2 border-white/20">
          {analysis.summary}
        </p>
      )}

      {/* MATCHUP: the athlete's recorded model vs this opponent's tendencies */}
      <MatchupPanel matchup={analysis.matchup} />

      {/* opponent tendencies (= the athlete's openings) */}
      {analysis.findings.length > 0 && (
        <section className="space-y-3">
          <h2 className="section-title">Tendencies to exploit</h2>
          <div className="space-y-3">
            {analysis.findings.map((f, i) => (
              <TendencyCard key={i} finding={f} />
            ))}
          </div>
        </section>
      )}

      {/* keyframes: categorical, no scores, no notes editor (this is someone else) */}
      {analysis.keyframes.length > 0 && (
        <section className="space-y-3">
          <h2 className="section-title">Detected moments</h2>
          {kf && (
            <figure className="space-y-2">
              <img src={kf.imageBase64} alt={kf.caption} className="w-full rounded-[14px] border border-white/10" />
              <figcaption className="label tnum">
                {kf.timestamp.toFixed(1)}s · {kf.caption}
              </figcaption>
            </figure>
          )}
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
            {analysis.keyframes.map((k, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setActiveKf(i)}
                aria-pressed={i === activeKf}
                className="flex-none w-20 overflow-hidden rounded-[12px] border transition-colors bg-[#111316]"
                style={{ borderColor: i === activeKf ? "rgba(201,205,210,0.7)" : "rgba(255,255,255,0.12)" }}
              >
                <img src={k.imageBase64} alt={k.caption} className="w-full" />
                <div className="label px-1.5 py-1 truncate">{k.caption}</div>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* athlete vs opponent ghost players, only when BOTH tracks exist */}
      <AthleteVsOpponent analysis={analysis} />

      {/* grounded, hedged parallels */}
      {analysis.styleParallels.length > 0 && <StyleParallels parallels={analysis.styleParallels} />}

      {/* categorical movement signals: the raw basis, never a score */}
      {analysis.metrics.signals.length > 0 && <SignalTable signals={analysis.metrics.signals} />}

      <button type="button" onClick={onClose} className="w-full btn-quiet">
        Close scout
      </button>
    </div>
  );
}

// ─── Matchup panel ───────────────────────────────────────────────────────────

function MatchupPanel({ matchup }: { matchup: Matchup }) {
  if (!matchup) {
    // Honest-null: the gate refused to fabricate a matchup from thin evidence.
    return (
      <section className="glass px-5 py-4 space-y-2">
        <h2 className="section-title !text-[1.0625rem] flex items-center gap-2">
          <Target className="w-4 h-4" strokeWidth={1.5} style={{ color: SCOUT }} />
          Matchup
        </h2>
        <p className="text-[0.9375rem] text-muted-foreground leading-[1.6]">
          Not enough grounded evidence to call this matchup honestly yet. Either your own recorded
          model is still thin, or this clip did not show enough tracked movement. The scout above
          still stands on its own. Log more of your own reads and it will sharpen.
        </p>
      </section>
    );
  }
  return (
    <section className="space-y-3">
      <h2 className="section-title flex items-center gap-2">
        <Target className="w-4 h-4" strokeWidth={1.5} style={{ color: SCOUT }} />
        Matchup
      </h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <MatchupEdgeCard kind="advantage" title={matchup.advantage.title} note={matchup.advantage.note} />
        <MatchupEdgeCard kind="risk" title={matchup.risk.title} note={matchup.risk.note} />
      </div>
      {matchup.notes.length > 0 && (
        <ul className="space-y-2 pt-1">
          {matchup.notes.map((n, i) => (
            <li
              key={i}
              className="text-[0.9375rem] text-muted-foreground leading-[1.55] before:content-['—'] before:mr-2"
            >
              {n}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function MatchupEdgeCard({
  kind,
  title,
  note,
}: {
  kind: "advantage" | "risk";
  title: string;
  note: string;
}) {
  const isAdvantage = kind === "advantage";
  return (
    <div className={`glass px-4 py-4 space-y-2 ${isAdvantage ? "" : "glass-red"}`}>
      <span className={`chip ${isAdvantage ? "chip-ok" : "chip-red"}`}>
        {isAdvantage ? <Shield className="w-3.5 h-3.5" strokeWidth={1.5} /> : <AlertTriangle className="w-3.5 h-3.5" strokeWidth={1.5} />}
        {isAdvantage ? "Your biggest advantage" : "Biggest risk"}
      </span>
      <div className="text-[1.0625rem] font-medium text-foreground leading-snug">{title}</div>
      <p className="text-[0.9375rem] text-muted-foreground leading-[1.55]">{note}</p>
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function TendencyCard({ finding }: { finding: AnalysisFinding }) {
  return (
    <div className="glass px-4 py-4 space-y-2">
      <div className="flex items-start justify-between gap-3">
        <span className="text-[1.0625rem] font-medium text-foreground leading-snug">{finding.title}</span>
        <span className={`chip flex-none ${finding.severity === "high" ? "chip-gold" : ""}`}>
          {SEVERITY_LABEL[finding.severity]}
        </span>
      </div>
      <p className="text-[0.9375rem] text-foreground/80 leading-[1.6]">{finding.observation}</p>
      {finding.nervousSystemFraming && (
        <p className="text-[0.9375rem] text-[#D4C7A3] leading-[1.6]">{finding.nervousSystemFraming}</p>
      )}
    </div>
  );
}

function StyleParallels({ parallels }: { parallels: StyleParallel[] }) {
  return (
    <section className="space-y-3">
      <h2 className="section-title">Reads like</h2>
      <div className="glass px-4">
        {parallels.map((p, i) => (
          <div key={i} className="py-3 border-t border-white/[0.06] first:border-t-0 space-y-0.5">
            <div className="text-[1rem] font-medium text-foreground">{p.name}</div>
            <p className="text-[0.9375rem] text-muted-foreground leading-[1.55]">{p.note}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function SignalTable({ signals }: { signals: AnalysisSignal[] }) {
  return (
    <section className="space-y-3">
      <h2 className="section-title">Movement signals</h2>
      <div className="glass px-4">
        {signals.map((s, i) => (
          <div
            key={i}
            className="flex items-baseline justify-between gap-4 py-3 border-t border-white/[0.06] first:border-t-0"
          >
            <div className="min-w-0">
              <div className="text-[1rem] text-foreground">{s.label}</div>
              <div className="text-[0.875rem] text-muted-foreground leading-snug mt-0.5">{s.detail}</div>
            </div>
            <div className="text-[0.9375rem] font-medium flex-none capitalize" style={{ color: SCOUT }}>
              {s.value}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
