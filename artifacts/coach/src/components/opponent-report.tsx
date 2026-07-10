import { useState } from "react";
import { X, Crosshair, Shield, AlertTriangle, Target, ScanLine } from "lucide-react";
import { FrameOctagon } from "@/components/frame-octagon";
import { useAnalysis } from "@/hooks/use-analysis";
import type {
  VideoAnalysis,
  Fighter,
  AnalysisFinding,
  AnalysisSignal,
  StyleParallel,
  Matchup,
} from "@/lib/api";

// Opponent Mode uses a deliberately COOL accent (steel/cyan) so a scouting read
// can never be mistaken for the athlete's own red-accented FRAME REPORT. This is
// the whole point of the mode: the opponent is someone else, clearly marked.
const SCOUT = "199,84%,56%";

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
  const { data, isLoading, isError } = useAnalysis(id);
  if (isLoading) {
    return (
      <div className="py-16 flex flex-col items-center gap-4">
        <FrameOctagon size={56} spin spinSeconds={4} glow={false} />
        <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
          Loading scout
        </div>
      </div>
    );
  }
  if (isError || !data?.analysis) {
    return (
      <div className="space-y-4">
        <div className="border border-destructive/40 bg-destructive/10 px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-destructive/90">
          could not load this scout
        </div>
        <button
          type="button"
          onClick={onClose}
          className="w-full font-mono text-[10px] uppercase tracking-[0.3em] border border-border/60 py-3 text-foreground/80"
        >
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
          <div
            className="inline-flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.4em] px-2 py-1 mb-2"
            style={{
              color: `hsla(${SCOUT},0.95)`,
              border: `1px solid hsla(${SCOUT},0.35)`,
              background: `hsla(${SCOUT},0.06)`,
            }}
          >
            <ScanLine className="w-3 h-3" strokeWidth={1.5} />
            Opponent scout
          </div>
          <div className="font-mono text-[9px] uppercase tracking-[0.35em] text-muted-foreground">
            {analysis.kind} · {analysis.durationSec.toFixed(0)}s read
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close scout"
          className="text-muted-foreground hover:text-foreground transition-colors flex-none"
        >
          <X className="w-5 h-5" strokeWidth={1.5} />
        </button>
      </div>

      {/* opponent identity band */}
      <div
        className="px-5 py-4"
        style={{
          borderLeft: `2px solid hsla(${SCOUT},0.6)`,
          background: `linear-gradient(90deg, hsla(${SCOUT},0.07), transparent 85%)`,
        }}
      >
        <div className="flex items-center gap-2.5">
          <Crosshair className="w-4 h-4 flex-none" style={{ color: `hsla(${SCOUT},0.85)` }} strokeWidth={1.5} />
          <span className="text-base text-foreground/90 font-light truncate">
            {name || "Unnamed opponent"}
          </span>
        </div>
        {analysis.styleProfile && (
          <div className="font-mono text-[10px] uppercase tracking-[0.3em] mt-1.5" style={{ color: `hsla(${SCOUT},0.75)` }}>
            {analysis.styleProfile}
          </div>
        )}
      </div>

      {/* grounded summary */}
      {analysis.summary && (
        <p className="text-[0.95rem] text-foreground/90 leading-relaxed pl-4" style={{ borderLeft: `2px solid hsla(${SCOUT},0.5)` }}>
          {analysis.summary}
        </p>
      )}

      {/* MATCHUP — the athlete's recorded model vs this opponent's tendencies */}
      <MatchupPanel matchup={analysis.matchup} />

      {/* opponent tendencies (= the athlete's openings) */}
      {analysis.findings.length > 0 && (
        <section className="space-y-3">
          <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground border-b border-border/40 pb-1.5">
            Tendencies to exploit
          </div>
          <div className="space-y-2.5">
            {analysis.findings.map((f, i) => (
              <TendencyCard key={i} finding={f} />
            ))}
          </div>
        </section>
      )}

      {/* keyframes — categorical, no scores, no notes editor (this is someone else) */}
      {analysis.keyframes.length > 0 && (
        <section className="space-y-3">
          <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground border-b border-border/40 pb-1.5">
            Detected moments
          </div>
          {kf && (
            <figure className="space-y-2">
              <img src={kf.imageBase64} alt={kf.caption} className="w-full rounded border border-border/50" />
              <figcaption className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground/85">
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
                className="flex-none w-20 border transition-colors"
                style={{ borderColor: i === activeKf ? `hsla(${SCOUT},0.7)` : "hsla(0,0%,100%,0.12)" }}
              >
                <img src={k.imageBase64} alt={k.caption} className="w-full" />
                <div className="font-mono text-[7px] uppercase tracking-widest text-muted-foreground/80 px-1 py-1 truncate">
                  {k.caption}
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* grounded, hedged parallels */}
      {analysis.styleParallels.length > 0 && (
        <StyleParallels parallels={analysis.styleParallels} />
      )}

      {/* categorical movement signals — the raw basis, never a score */}
      {analysis.metrics.signals.length > 0 && (
        <SignalTable signals={analysis.metrics.signals} />
      )}

      <button
        type="button"
        onClick={onClose}
        className="w-full font-mono text-[10px] uppercase tracking-[0.3em] border border-border/60 hover:border-primary/50 py-3 text-foreground/80 transition-colors"
      >
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
      <section
        className="px-5 py-4 space-y-2"
        style={{ border: `1px solid hsla(${SCOUT},0.2)`, background: `hsla(${SCOUT},0.03)` }}
      >
        <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.3em]" style={{ color: `hsla(${SCOUT},0.8)` }}>
          <Target className="w-3.5 h-3.5" strokeWidth={1.5} />
          Matchup
        </div>
        <p className="text-[0.85rem] text-foreground/60 leading-relaxed">
          Not enough grounded evidence to call this matchup honestly yet — either your
          own recorded model is still thin, or this clip didn't show enough tracked
          movement. The scout above still stands on its own. Log more of your own reads
          and it'll sharpen.
        </p>
      </section>
    );
  }
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.3em]" style={{ color: `hsla(${SCOUT},0.85)` }}>
        <Target className="w-3.5 h-3.5" strokeWidth={1.5} />
        Matchup
      </div>
      <div className="grid gap-2.5 sm:grid-cols-2">
        <MatchupEdgeCard
          kind="advantage"
          title={matchup.advantage.title}
          note={matchup.advantage.note}
        />
        <MatchupEdgeCard kind="risk" title={matchup.risk.title} note={matchup.risk.note} />
      </div>
      {matchup.notes.length > 0 && (
        <ul className="space-y-1.5 pt-1">
          {matchup.notes.map((n, i) => (
            <li
              key={i}
              className="text-[0.8rem] text-foreground/70 leading-relaxed before:content-['—'] before:mr-2 before:text-muted-foreground/50"
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
  const accent = isAdvantage ? "142,64%,45%" : "0,68%,52%";
  return (
    <div
      className="px-4 py-3.5 space-y-1.5"
      style={{ borderLeft: `2px solid hsla(${accent},0.7)`, background: `hsla(${accent},0.05)` }}
    >
      <div className="flex items-center gap-1.5 font-mono text-[8px] uppercase tracking-[0.35em]" style={{ color: `hsla(${accent},0.9)` }}>
        {isAdvantage ? <Shield className="w-3 h-3" strokeWidth={1.5} /> : <AlertTriangle className="w-3 h-3" strokeWidth={1.5} />}
        {isAdvantage ? "Your biggest advantage" : "Biggest risk"}
      </div>
      <div className="text-[0.9rem] text-foreground/90 leading-snug">{title}</div>
      <p className="text-[0.8rem] text-foreground/65 leading-relaxed">{note}</p>
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function TendencyCard({ finding }: { finding: AnalysisFinding }) {
  return (
    <div className="px-4 py-3 space-y-1.5" style={{ borderLeft: `2px solid hsla(${SCOUT},0.4)`, background: "hsla(0,0%,100%,0.015)" }}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[0.9rem] text-foreground/90 leading-snug">{finding.title}</span>
        <span className="font-mono text-[8px] uppercase tracking-widest flex-none" style={{ color: `hsla(${SCOUT},0.75)` }}>
          {SEVERITY_LABEL[finding.severity]}
        </span>
      </div>
      <p className="text-[0.8rem] text-foreground/65 leading-relaxed">{finding.observation}</p>
      {finding.nervousSystemFraming && (
        <p className="text-[0.78rem] text-foreground/50 leading-relaxed italic">{finding.nervousSystemFraming}</p>
      )}
    </div>
  );
}

function StyleParallels({ parallels }: { parallels: StyleParallel[] }) {
  return (
    <section className="space-y-3">
      <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground border-b border-border/40 pb-1.5">
        Reads like
      </div>
      <div className="space-y-2">
        {parallels.map((p, i) => (
          <div key={i} className="space-y-0.5">
            <div className="font-mono text-[10px] uppercase tracking-widest" style={{ color: `hsla(${SCOUT},0.8)` }}>
              {p.name}
            </div>
            <p className="text-[0.8rem] text-foreground/65 leading-relaxed">{p.note}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function SignalTable({ signals }: { signals: AnalysisSignal[] }) {
  return (
    <section className="space-y-3">
      <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground border-b border-border/40 pb-1.5">
        Movement signals
      </div>
      <div className="space-y-1.5">
        {signals.map((s, i) => (
          <div key={i} className="flex items-baseline justify-between gap-4 py-1 border-b border-border/15">
            <div className="min-w-0">
              <div className="font-mono text-[9px] uppercase tracking-widest text-foreground/75">{s.label}</div>
              <div className="text-[0.76rem] text-foreground/50 leading-snug">{s.detail}</div>
            </div>
            <div className="font-mono text-[10px] flex-none" style={{ color: `hsla(${SCOUT},0.85)` }}>
              {s.value}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
