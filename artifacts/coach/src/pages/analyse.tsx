import { useRef, useState } from "react";
import { Link } from "wouter";
import { ChevronLeft, Upload, Film, X } from "lucide-react";
import { BottomNav } from "@/components/bottom-nav";
import { FrameOctagon } from "@/components/frame-octagon";
import { useFighter } from "@/hooks/use-fighter";
import { useAnalyses, useAnalysis, useCreateAnalysis } from "@/hooks/use-analysis";
import {
  extractPoseFrames,
  captureKeyframe,
  disposeExtract,
  type ExtractResult,
} from "@/lib/pose";
import { computeMetrics } from "@/lib/analysis-metrics";
import type {
  AnalysisKind,
  AnalysisKeyframe,
  NervousSystemLoad,
  VideoAnalysis,
} from "@/lib/api";

const KINDS: { value: AnalysisKind; label: string }[] = [
  { value: "sparring", label: "Sparring" },
  { value: "padwork", label: "Padwork" },
  { value: "shadowboxing", label: "Shadow" },
  { value: "drilling", label: "Drilling" },
  { value: "movement", label: "Movement" },
  { value: "lifting", label: "Lifting" },
];

const LOAD_LABEL: Record<NervousSystemLoad, string> = {
  low: "Low",
  moderate: "Moderate",
  elevated: "Elevated",
  high: "High",
};

const LOAD_COLOR: Record<NervousSystemLoad, string> = {
  low: "text-emerald-300/90 border-emerald-300/40",
  moderate: "text-primary border-primary/40",
  elevated: "text-amber-300/90 border-amber-300/40",
  high: "text-red-400/90 border-red-400/40",
};

type Phase =
  | { stage: "idle" }
  | { stage: "reading"; pct: number }
  | { stage: "tracking"; pct: number }
  | { stage: "detecting" }
  | { stage: "loading_ai" }
  | { stage: "error"; message: string };

const PHASE_COPY: Record<string, { title: string; sub: string }> = {
  reading: { title: "Reading footage", sub: "Decoding frames" },
  tracking: { title: "Tracking movement", sub: "Locking the skeleton" },
  detecting: { title: "Detecting patterns", sub: "Reading the body under load" },
  loading_ai: { title: "Nervous system load", sub: "Framing what the system is doing" },
};

export default function AnalysePage() {
  const { data: fighterData } = useFighter();
  const fighter = fighterData?.fighter ?? null;
  const analyses = useAnalyses();
  const create = useCreateAnalysis();
  const fileRef = useRef<HTMLInputElement>(null);

  const [kind, setKind] = useState<AnalysisKind>("sparring");
  const [phase, setPhase] = useState<Phase>({ stage: "idle" });
  const [result, setResult] = useState<VideoAnalysis | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);

  const busy = phase.stage !== "idle" && phase.stage !== "error";

  async function runAnalysis(file: File) {
    setResult(null);
    setOpenId(null);
    let extract: ExtractResult | null = null;
    try {
      setPhase({ stage: "reading", pct: 0 });
      extract = await extractPoseFrames(file, (p) => {
        const pct = p.total ? Math.round((p.done / p.total) * 100) : 0;
        if (p.stage === "loading") setPhase({ stage: "reading", pct: 0 });
        else setPhase({ stage: "tracking", pct });
      });

      setPhase({ stage: "detecting" });
      const metrics = computeMetrics(extract.frames);

      if (metrics.poseFrames < 3) {
        throw new Error(
          "couldn't lock onto a body in this clip — make sure the athlete is clearly in frame",
        );
      }

      // capture key frames (skeleton baked in) for the report + the AI read
      const keyframes: AnalysisKeyframe[] = [];
      for (const m of metrics.keyMoments) {
        const frame = extract.frames.find((f) => Math.abs(f.timestamp - m.timestamp) < 0.001);
        if (!frame) continue;
        const img = await captureKeyframe(extract, frame);
        if (img) keyframes.push({ timestamp: m.timestamp, imageBase64: img, caption: m.reason });
      }

      setPhase({ stage: "loading_ai" });
      const res = await create.mutateAsync({
        kind,
        load: metrics.load,
        loadBasis: metrics.loadBasis,
        durationSec: extract.durationSec,
        framesAnalysed: metrics.framesAnalysed,
        poseFrames: metrics.poseFrames,
        signals: metrics.signals,
        keyframes,
      });
      setResult(res.analysis);
      setPhase({ stage: "idle" });
    } catch (err) {
      setPhase({
        stage: "error",
        message: err instanceof Error ? err.message : "analysis failed",
      });
    } finally {
      if (extract) disposeExtract(extract);
    }
  }

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) void runAnalysis(file);
  }

  return (
    <div className="flex flex-col h-[100dvh] bg-background text-foreground">
      <header className="flex-none flex items-center justify-between px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-3 border-b border-border/40">
        <Link href="/" className="text-muted-foreground hover:text-foreground transition-colors">
          <ChevronLeft className="w-5 h-5" strokeWidth={1.5} />
        </Link>
        <div className="text-center">
          <div className="font-mono text-[9px] uppercase tracking-[0.35em] text-muted-foreground">
            {fighter?.name ?? "Athlete"}
          </div>
          <div className="font-mono text-sm uppercase tracking-[0.3em] text-foreground/95 mt-0.5">
            Analyse
          </div>
        </div>
        <div className="w-5" />
      </header>

      <main className="flex-1 overflow-y-auto">
        <div className="max-w-md mx-auto px-5 py-6 space-y-6 pb-10">
          {result ? (
            <Report analysis={result} onClose={() => setResult(null)} />
          ) : openId != null ? (
            <SavedReport id={openId} onClose={() => setOpenId(null)} />
          ) : (
            <>
              <section className="space-y-3">
                <p className="text-sm text-foreground/80 leading-relaxed">
                  Upload a clip. The frame reads your movement directly — guard, base,
                  shoulders, output rhythm — and tells you what your nervous system is doing
                  under load. Processed on your device; only the read is kept.
                </p>
              </section>

              <section className="space-y-2">
                <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
                  What is this clip
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {KINDS.map((k) => (
                    <button
                      key={k.value}
                      type="button"
                      onClick={() => setKind(k.value)}
                      disabled={busy}
                      className={`font-mono text-[10px] uppercase tracking-widest border py-2.5 transition-colors disabled:opacity-40 ${
                        kind === k.value
                          ? "border-primary/70 bg-primary/10 text-primary"
                          : "border-border/50 text-foreground/70 hover:border-primary/40"
                      }`}
                    >
                      {k.label}
                    </button>
                  ))}
                </div>
              </section>

              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={busy}
                className="w-full border border-dashed border-border/60 hover:border-primary/50 transition-colors py-10 flex flex-col items-center justify-center gap-3 disabled:opacity-50"
              >
                <Upload className="w-7 h-7 text-muted-foreground" strokeWidth={1.25} />
                <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-foreground/80">
                  Select footage
                </div>
                <div className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground/70">
                  mp4 / mov · first 75s read
                </div>
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="video/*"
                className="hidden"
                onChange={onPick}
              />

              {phase.stage === "error" && (
                <div className="border border-destructive/40 bg-destructive/10 px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-destructive/90">
                  {phase.message}
                </div>
              )}

              <History
                items={analyses.data?.analyses ?? []}
                loading={analyses.isLoading}
                onOpen={(id) => setOpenId(id)}
              />
            </>
          )}
        </div>
      </main>

      <BottomNav />

      {busy && <CinematicOverlay phase={phase} kindLabel={KINDS.find((k) => k.value === kind)?.label ?? ""} />}
    </div>
  );
}

function CinematicOverlay({ phase, kindLabel }: { phase: Phase; kindLabel: string }) {
  const key =
    phase.stage === "reading"
      ? "reading"
      : phase.stage === "tracking"
        ? "tracking"
        : phase.stage === "detecting"
          ? "detecting"
          : "loading_ai";
  const copy = PHASE_COPY[key]!;

  const steps = ["reading", "tracking", "detecting", "loading_ai"];
  const activeIdx = steps.indexOf(key);

  return (
    <div className="fixed inset-0 z-50 bg-black/95 backdrop-blur-sm flex flex-col items-center justify-center px-8">
      <FrameOctagon size={120} spin spinSeconds={5} glow />
      <div className="mt-10 text-center space-y-2">
        <div className="font-mono text-[9px] uppercase tracking-[0.4em] text-muted-foreground">
          {kindLabel}
        </div>
        <div className="font-mono text-base uppercase tracking-[0.3em] text-foreground/95">
          {copy.title}
        </div>
        <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground/80">
          {copy.sub}
        </div>
      </div>

      <div className="mt-10 flex items-center gap-2">
        {steps.map((s, i) => (
          <div
            key={s}
            className={`h-px transition-all duration-500 ${
              i <= activeIdx ? "w-10 bg-primary/80" : "w-6 bg-border/50"
            }`}
          />
        ))}
      </div>
    </div>
  );
}

function Report({ analysis, onClose }: { analysis: VideoAnalysis; onClose: () => void }) {
  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="font-mono text-[9px] uppercase tracking-[0.35em] text-muted-foreground">
            {analysis.kind} · {analysis.durationSec.toFixed(0)}s read
          </div>
          <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-foreground/70 mt-1">
            Nervous system load
          </div>
          <div
            className={`inline-block mt-2 font-mono text-sm uppercase tracking-[0.3em] border px-3 py-1.5 ${LOAD_COLOR[analysis.nervousSystemLoad]}`}
            title={analysis.metrics.loadBasis}
          >
            {LOAD_LABEL[analysis.nervousSystemLoad]}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="New analysis"
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="w-5 h-5" strokeWidth={1.5} />
        </button>
      </div>

      <p className="text-[0.95rem] text-foreground/90 leading-relaxed border-l-2 border-primary/60 pl-4">
        {analysis.summary}
      </p>

      {analysis.keyframes.length > 0 && (
        <section className="space-y-2">
          <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
            Key frames
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
            {analysis.keyframes.map((kf, i) => (
              <figure key={i} className="flex-none w-40">
                <img
                  src={kf.imageBase64}
                  alt={kf.caption}
                  className="w-40 rounded border border-border/50"
                />
                <figcaption className="font-mono text-[8px] uppercase tracking-widest text-muted-foreground/80 mt-1">
                  {kf.timestamp.toFixed(1)}s · {kf.caption}
                </figcaption>
              </figure>
            ))}
          </div>
        </section>
      )}

      <section className="space-y-4">
        <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground border-b border-border/40 pb-1.5">
          What the body is doing
        </div>
        {analysis.findings.map((f, i) => (
          <div key={i} className="border border-border/50 px-4 py-3 space-y-2">
            <div className="flex items-baseline justify-between gap-3">
              <div className="text-[0.95rem] text-foreground/95 leading-snug">{f.title}</div>
              <div
                className={`flex-none font-mono text-[8px] uppercase tracking-widest px-1.5 py-0.5 border ${
                  f.severity === "high"
                    ? "text-red-400/90 border-red-400/40"
                    : f.severity === "medium"
                      ? "text-amber-300/90 border-amber-300/40"
                      : "text-muted-foreground border-border/50"
                }`}
              >
                {f.area}
              </div>
            </div>
            <p className="text-sm text-foreground/80 leading-relaxed">{f.observation}</p>
            {f.nervousSystemFraming && (
              <p className="text-sm text-primary/85 leading-relaxed italic">
                {f.nervousSystemFraming}
              </p>
            )}
          </div>
        ))}
      </section>

      <section className="space-y-2 pt-1">
        <div className="font-mono text-[9px] uppercase tracking-[0.3em] text-muted-foreground/80">
          Tracked signals
        </div>
        <div className="space-y-1.5">
          {analysis.metrics.signals.map((s) => (
            <div
              key={s.key}
              className="flex items-baseline justify-between gap-3 font-mono text-[10px] uppercase tracking-widest"
              title={s.detail}
            >
              <span className="text-muted-foreground/80">{s.label}</span>
              <span className="text-foreground/85">{s.value}</span>
            </div>
          ))}
        </div>
        <div className="font-mono text-[8px] uppercase tracking-widest text-muted-foreground/60 pt-2 leading-relaxed">
          {analysis.metrics.poseFrames} of {analysis.metrics.framesAnalysed} frames locked a pose ·
          load {analysis.metrics.loadBasis}
        </div>
      </section>

      <button
        type="button"
        onClick={onClose}
        className="w-full font-mono text-[10px] uppercase tracking-[0.3em] border border-border/60 hover:border-primary/50 py-3 text-foreground/80 transition-colors"
      >
        Analyse another
      </button>
    </div>
  );
}

function SavedReport({ id, onClose }: { id: number; onClose: () => void }) {
  const { data, isLoading, isError } = useAnalysis(id);
  if (isLoading) {
    return (
      <div className="py-16 flex flex-col items-center gap-4">
        <FrameOctagon size={56} spin spinSeconds={4} glow={false} />
        <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
          Loading read
        </div>
      </div>
    );
  }
  if (isError || !data?.analysis) {
    return (
      <div className="space-y-4">
        <div className="border border-destructive/40 bg-destructive/10 px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-destructive/90">
          could not load this read
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
  return <Report analysis={data.analysis} onClose={onClose} />;
}

function History({
  items,
  loading,
  onOpen,
}: {
  items: { id: number; kind: string; nervousSystemLoad: NervousSystemLoad; summary: string; createdAt: string }[];
  loading: boolean;
  onOpen: (id: number) => void;
}) {
  if (loading) return null;
  if (items.length === 0) return null;
  return (
    <section className="space-y-3 pt-2">
      <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground border-b border-border/40 pb-1.5">
        Past reads
      </div>
      <div className="space-y-2">
        {items.map((a) => (
          <button
            key={a.id}
            type="button"
            onClick={() => onOpen(a.id)}
            className="w-full text-left border border-border/50 hover:border-primary/40 transition-colors px-4 py-3 flex items-start gap-3"
          >
            <Film className="w-4 h-4 mt-0.5 flex-none text-muted-foreground" strokeWidth={1.5} />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-mono text-[10px] uppercase tracking-widest text-foreground/85">
                  {a.kind}
                </span>
                <span className={`font-mono text-[9px] uppercase tracking-widest ${LOAD_COLOR[a.nervousSystemLoad].split(" ")[0]}`}>
                  {LOAD_LABEL[a.nervousSystemLoad]}
                </span>
              </div>
              <p className="text-sm text-foreground/70 leading-snug mt-1 line-clamp-2">
                {a.summary}
              </p>
              <div className="font-mono text-[8px] uppercase tracking-widest text-muted-foreground/60 mt-1.5">
                {new Date(a.createdAt).toLocaleString(undefined, {
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </div>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}
