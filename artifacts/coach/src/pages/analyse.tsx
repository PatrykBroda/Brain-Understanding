import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { ChevronLeft, Upload, Film, X, Download, ArrowUpRight, ArrowDownRight, Minus, Link2, Lock } from "lucide-react";
import { toPng } from "html-to-image";
import {
  LineChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  YAxis,
} from "recharts";
import { AthleteModel } from "@/components/athlete-model";
import { BottomNav } from "@/components/bottom-nav";
import { FrameOctagon } from "@/components/frame-octagon";
import { FrameReportCard } from "@/components/frame-report-card";
import { useFighter } from "@/hooks/use-fighter";
import { useAnalyses, useAnalysis, useCreateAnalysis, useUpdateKeyframeNotes } from "@/hooks/use-analysis";
import {
  extractPoseFrames,
  captureKeyframe,
  disposeExtract,
  type ExtractResult,
} from "@/lib/pose";
import { computeMetrics } from "@/lib/analysis-metrics";
import { useFramePlus, FramePlusPill } from "@/components/frame-plus-modal";
import { useSubscription } from "@/hooks/use-subscription";
import { ApiError, fetchRemoteVideo } from "@/lib/api";
import type {
  AnalysisKind,
  AnalysisKeyframe,
  AnalysisListItem,
  DetectedEvent,
  NervousSystemLoad,
  VideoAnalysis,
  Fighter,
} from "@/lib/api";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

const MAX_VIDEO_BYTES = 250 * 1024 * 1024;

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
  | { stage: "fetching" }
  | { stage: "reading"; pct: number }
  | { stage: "tracking"; pct: number }
  | { stage: "detecting" }
  | { stage: "loading_ai" }
  | { stage: "error"; title: string; causes: string[]; retryable: boolean };

const PHASE_PHRASES: Record<string, string[]> = {
  fetching: ["Pulling the footage", "Fetching the clip", "Reaching the source"],
  reading: ["Decoding footage", "Sampling frames", "Reading the tape"],
  tracking: ["Locking the skeleton", "Tracking limbs under load", "Following the structure"],
  detecting: ["Reading the body under load", "Finding the breakpoints", "Watching the guard", "Measuring composure"],
  loading_ai: ["Framing what the system is doing", "Naming the pattern", "Writing the read"],
};

const PHASE_TITLE: Record<string, string> = {
  fetching: "Fetching the clip",
  reading: "Reading footage",
  tracking: "Tracking movement",
  detecting: "Detecting patterns",
  loading_ai: "Building the read",
};

function toErrorPhase(err: unknown): Extract<Phase, { stage: "error" }> {
  if (err instanceof ApiError) {
    return { stage: "error", title: err.title, causes: err.causes, retryable: err.retryable };
  }
  const message = err instanceof Error ? err.message : "Analysis failed";
  return { stage: "error", title: "Couldn't read this clip", causes: [message], retryable: true };
}

export default function AnalysePage() {
  const { data: fighterData } = useFighter();
  const fighter = fighterData?.fighter ?? null;
  const analyses = useAnalyses();
  const create = useCreateAnalysis();
  const { status: billingStatus } = useSubscription();
  const { openUpgrade } = useFramePlus();
  // Client convenience gate only fires on a KNOWN free plan — if billing
  // status is unavailable, let the request through; the server 402 is the
  // authority and the catch blocks map it to the upgrade modal.
  const knownFree = billingStatus?.plan === "free";
  // First analysis ever is free (one-time taster). Only pre-gate when we KNOW
  // the free allowance is already spent; otherwise the server decides.
  const freeAnalysisUsed =
    knownFree && (analyses.data?.analyses?.length ?? 0) >= 1;
  const fileRef = useRef<HTMLInputElement>(null);
  const mobileScrollRef = useRef<HTMLElement>(null);
  const desktopRightScrollRef = useRef<HTMLDivElement>(null);

  const [kind, setKind] = useState<AnalysisKind>("sparring");
  const [focus, setFocus] = useState("");

  const [reportVisible, setReportVisible] = useState(true);

  function onSelectSession(id: number) {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      clearResult();
      setOpenId(id);
      mobileScrollRef.current?.scrollTo({ top: 0, behavior: "instant" });
      desktopRightScrollRef.current?.scrollTo({ top: 0, behavior: "instant" });
      return;
    }
    setReportVisible(false);
    setTimeout(() => {
      clearResult();
      setOpenId(id);
      mobileScrollRef.current?.scrollTo({ top: 0, behavior: "instant" });
      desktopRightScrollRef.current?.scrollTo({ top: 0, behavior: "instant" });
      requestAnimationFrame(() => setReportVisible(true));
    }, 150);
  }
  const [phase, setPhase] = useState<Phase>({ stage: "idle" });
  const [result, setResult] = useState<VideoAnalysis | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);
  const [compareId, setCompareId] = useState<number | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [sourceMode, setSourceMode] = useState<"upload" | "link">("upload");
  const [linkUrl, setLinkUrl] = useState("");
  const pendingFile = useRef<File | null>(null);
  const lastLink = useRef<string | null>(null);
  const videoUrlRef = useRef<string | null>(null);

  // Revoke any outstanding blob URL when the component unmounts
  useEffect(() => {
    return () => {
      if (videoUrlRef.current) URL.revokeObjectURL(videoUrlRef.current);
    };
  }, []);

  const busy = phase.stage !== "idle" && phase.stage !== "error";
  const danger = result?.fragmentationRisk === "high" || result?.nervousSystemLoad === "high";
  // Retry is offered when there's something to retry: a picked file, or a link
  // that failed to fetch (which leaves no File behind).
  const canRetry =
    phase.stage === "error" &&
    phase.retryable &&
    (!!pendingFile.current || (sourceMode === "link" && !!lastLink.current));

  async function runAnalysis(file: File) {
    // The first analysis is free; after that it's FRAME+. Prompt the upgrade
    // BEFORE burning minutes of on-device pose work. Server enforces the same
    // gate on POST /analysis.
    if (freeAnalysisUsed) {
      openUpgrade("video_analysis");
      return;
    }
    setResult(null);
    setOpenId(null);
    if (file.size > MAX_VIDEO_BYTES) {
      setPhase({
        stage: "error",
        title: "That clip is too large to process",
        causes: [
          `This file is ${(file.size / 1024 / 1024).toFixed(0)}MB — the limit is ${MAX_VIDEO_BYTES / 1024 / 1024}MB`,
          "Trim it to a shorter segment and try again",
        ],
        retryable: false,
      });
      return;
    }
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

      const keyframes: AnalysisKeyframe[] = [];
      for (const m of metrics.keyMoments) {
        const frame = extract.frames.find((f) => Math.abs(f.timestamp - m.timestamp) < 0.001);
        if (!frame) continue;
        const img = await captureKeyframe(extract, frame);
        if (img)
          keyframes.push({
            timestamp: m.timestamp,
            imageBase64: img,
            caption: m.reason,
            eventType: m.type,
          });
      }

      const detectedEvents: DetectedEvent[] = metrics.events;

      setPhase({ stage: "loading_ai" });
      const res = await create.mutateAsync({
        kind,
        focus: focus.trim(),
        load: metrics.load,
        fragmentationRisk: metrics.fragmentationRisk,
        loadBasis: metrics.loadBasis,
        sessionScore: metrics.sessionScore,
        durationSec: extract.durationSec,
        framesAnalysed: metrics.framesAnalysed,
        poseFrames: metrics.poseFrames,
        signals: metrics.signals,
        scores: metrics.scores,
        detectedEvents,
        keyframes,
      });
      setResult(res.analysis);
      setPhase({ stage: "idle" });
      // Create a blob URL for the desktop video player — revoke the previous one first
      if (pendingFile.current) {
        if (videoUrlRef.current) URL.revokeObjectURL(videoUrlRef.current);
        const url = URL.createObjectURL(pendingFile.current);
        videoUrlRef.current = url;
        setVideoUrl(url);
      }
    } catch (err) {
      if (err instanceof ApiError && err.kind === "upgrade_required") {
        setPhase({ stage: "idle" });
        openUpgrade(err.feature || "video_analysis");
      } else {
        setPhase(toErrorPhase(err));
      }
    } finally {
      if (extract) disposeExtract(extract);
    }
  }

  async function runFromLink(url: string) {
    const trimmed = url.trim();
    if (!trimmed) return;
    if (freeAnalysisUsed) {
      openUpgrade("video_analysis");
      return;
    }
    lastLink.current = trimmed;
    pendingFile.current = null;
    setResult(null);
    setOpenId(null);
    setPhase({ stage: "fetching" });
    let file: File;
    try {
      file = await fetchRemoteVideo(trimmed);
    } catch (err) {
      if (err instanceof ApiError && err.kind === "upgrade_required") {
        setPhase({ stage: "idle" });
        openUpgrade(err.feature || "video_analysis");
        return;
      }
      setPhase(toErrorPhase(err));
      return;
    }
    pendingFile.current = file;
    await runAnalysis(file);
  }

  function clearResult() {
    setResult(null);
    if (videoUrlRef.current) {
      URL.revokeObjectURL(videoUrlRef.current);
      videoUrlRef.current = null;
    }
    setVideoUrl(null);
  }

  function retry() {
    // A link that never produced a File is re-fetched; anything else re-runs the pose pass.
    if (sourceMode === "link" && lastLink.current && !pendingFile.current) {
      void runFromLink(lastLink.current);
      return;
    }
    const file = pendingFile.current;
    if (file) void runAnalysis(file);
  }

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) {
      pendingFile.current = file;
      void runAnalysis(file);
    }
  }

  const showingReport = result != null || openId != null;

  return (
    <div className="flex flex-col h-[100dvh] bg-background text-foreground">
      <header className="flex-none flex items-center justify-between px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-3 border-b border-border/40">
        <div className="flex-1 flex justify-start">
          <Link href="/" className="text-muted-foreground hover:text-foreground transition-colors">
            <ChevronLeft className="w-5 h-5" strokeWidth={1.5} />
          </Link>
        </div>
        <div className="text-center flex flex-col items-center gap-1.5">
          <img
            src={`${basePath}/frame-logo.png`}
            alt=""
            aria-hidden
            width={22}
            height={22}
            className="object-contain opacity-75"
          />
          <div className="font-mono text-[11px] uppercase tracking-[0.4em] text-foreground/90">
            Analyse
          </div>
        </div>
        <div className="flex-1 flex justify-end">
          <FramePlusPill />
        </div>
      </header>

      {/* ------------------------------------------------------------------ */}
      {/* MOBILE layout — stacked, single scroll column                       */}
      {/* ------------------------------------------------------------------ */}
      <main ref={mobileScrollRef} className="flex-1 min-h-0 overflow-y-auto md:hidden">
        <div className="max-w-md mx-auto px-5 py-6 space-y-6 pb-10">
          {result ? (
            <div style={{ opacity: reportVisible ? 1 : 0, transition: "opacity 150ms ease" }}>
              <Report analysis={result} fighter={fighter} onClose={clearResult} onSelectSession={onSelectSession} />
            </div>
          ) : openId != null ? (
            <div style={{ opacity: reportVisible ? 1 : 0, transition: "opacity 150ms ease" }}>
              <SavedReport id={openId} compareId={compareId} fighter={fighter} onClose={() => setOpenId(null)} onSelectSession={onSelectSession} />
            </div>
          ) : (
            <UploadControls
              kind={kind}
              setKind={setKind}
              focus={focus}
              setFocus={setFocus}
              busy={busy}
              phase={phase}
              canRetry={canRetry}
              fileRef={fileRef}
              onPick={onPick}
              retry={retry}
              sourceMode={sourceMode}
              setSourceMode={setSourceMode}
              linkUrl={linkUrl}
              setLinkUrl={setLinkUrl}
              onSubmitLink={() => void runFromLink(linkUrl)}
              analyses={analyses.data?.analyses ?? []}
              analysesLoading={analyses.isLoading}
              onOpen={(id) => setOpenId(id)}
              compareId={compareId}
              onSetCompare={(id) => setCompareId((prev) => (prev === id ? null : id))}
            />
          )}
          {!result && openId == null && <AthleteModel variant="mobile" />}
        </div>
      </main>

      {/* ------------------------------------------------------------------ */}
      {/* DESKTOP workstation layout — two panels, side by side               */}
      {/* ------------------------------------------------------------------ */}
      <main className="flex-1 min-h-0 hidden md:flex divide-x divide-border/30">
        {showingReport ? (
          <>
            {/* LEFT — video player + filmstrip */}
            <div className="flex flex-col w-[46%] min-w-0 overflow-y-auto bg-black/20" style={{ opacity: reportVisible ? 1 : 0, transition: "opacity 150ms ease" }}>
              {result ? (
                <WorkstationLeft
                  analysis={result}
                  videoUrl={videoUrl}
                  onClose={clearResult}
                />
              ) : openId != null ? (
                <SavedWorkstationLeft id={openId} onClose={() => setOpenId(null)} />
              ) : null}
            </div>

            {/* RIGHT — FRAME REPORT card + findings + scores */}
            <div ref={desktopRightScrollRef} className="flex-1 overflow-y-auto px-7 py-6" style={{ opacity: reportVisible ? 1 : 0, transition: "opacity 150ms ease" }}>
              {result ? (
                <WorkstationRight analysis={result} fighter={fighter} onClose={clearResult} onSelectSession={onSelectSession} />
              ) : openId != null ? (
                <SavedWorkstationRight id={openId} compareId={compareId} fighter={fighter} onClose={() => setOpenId(null)} onSelectSession={onSelectSession} />
              ) : null}
            </div>
          </>
        ) : (
          <>
            {/* LEFT — description + upload zone */}
            <div className="flex flex-col justify-center items-center w-[46%] min-w-0 px-10 py-10 gap-8">
              <div className="w-full max-w-sm space-y-3">
                <div
                  className="border-l-2 border-destructive/50 pl-4 py-1"
                  style={{ background: "linear-gradient(90deg, hsla(0,68%,46%,0.05), transparent 80%)" }}
                >
                  <div className="font-mono text-[9px] uppercase tracking-[0.45em] text-destructive/70 mb-1.5">
                    Analyst Workstation
                  </div>
                  <p className="text-sm text-foreground/75 leading-relaxed">
                    Upload a clip. The system reads your movement directly — guard, base,
                    shoulders, output rhythm — scores it against itself, and tells you what
                    your nervous system is doing under load.
                  </p>
                  <p className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground/45 mt-2">
                    Processed on device · only the read is kept
                  </p>
                </div>
              </div>

              <div className="w-full max-w-sm space-y-4">
                <SourceToggle mode={sourceMode} setMode={setSourceMode} disabled={busy} />
                {sourceMode === "upload" ? (
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    disabled={busy}
                    className="relative w-full overflow-hidden transition-all duration-300 disabled:opacity-50 py-16 flex flex-col items-center justify-center gap-4"
                    style={{ border: "1px solid hsla(0,68%,46%,0.25)", background: "linear-gradient(160deg, hsla(0,68%,46%,0.04) 0%, transparent 60%)" }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "hsla(0,68%,46%,0.55)"; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "hsla(0,68%,46%,0.25)"; }}
                  >
                    <span className="absolute left-0 top-0 h-3 w-3 border-l border-t border-destructive/40" />
                    <span className="absolute right-0 top-0 h-3 w-3 border-r border-t border-destructive/40" />
                    <span className="absolute left-0 bottom-0 h-3 w-3 border-l border-b border-destructive/40" />
                    <span className="absolute right-0 bottom-0 h-3 w-3 border-r border-b border-destructive/40" />
                    <Upload className="w-10 h-10" strokeWidth={1} style={{ color: "hsla(0,68%,46%,0.6)" }} />
                    <div className="font-mono text-[11px] uppercase tracking-[0.45em] text-foreground/80">
                      Drop footage
                    </div>
                    <div className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground/45">
                      mp4 · mov · first 75s processed
                    </div>
                  </button>
                ) : (
                  <LinkInput
                    value={linkUrl}
                    onChange={setLinkUrl}
                    onSubmit={() => void runFromLink(linkUrl)}
                    disabled={busy}
                  />
                )}
              </div>
            </div>

            {/* RIGHT — controls + history */}
            <div className="flex-1 overflow-y-auto px-7 py-6 space-y-6">
              <section className="space-y-2">
                <div className="font-mono text-[9px] uppercase tracking-[0.4em] text-muted-foreground/70">
                  Clip type
                </div>
                <div className="grid grid-cols-3 gap-[3px]">
                  {KINDS.map((k) => (
                    <button
                      key={k.value}
                      type="button"
                      onClick={() => setKind(k.value)}
                      disabled={busy}
                      className="font-mono text-[10px] uppercase tracking-widest py-2.5 transition-all duration-200 disabled:opacity-40"
                      style={{
                        borderLeft: `2px solid ${kind === k.value ? "hsla(0,68%,46%,0.9)" : "hsla(0,0%,100%,0.1)"}`,
                        borderTop: `1px solid ${kind === k.value ? "hsla(0,68%,46%,0.2)" : "hsla(0,0%,100%,0.06)"}`,
                        borderRight: "1px solid hsla(0,0%,100%,0.04)",
                        borderBottom: "1px solid hsla(0,0%,100%,0.04)",
                        background: kind === k.value ? "hsla(0,68%,46%,0.08)" : "transparent",
                        color: kind === k.value ? "hsl(0,55%,65%)" : "hsla(0,0%,100%,0.55)",
                      }}
                    >
                      {k.label}
                    </button>
                  ))}
                </div>
              </section>

              <section className="space-y-2">
                <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
                  Anything to focus on{" "}
                  <span className="text-muted-foreground/50 normal-case tracking-normal">(optional)</span>
                </div>
                <input
                  type="text"
                  value={focus}
                  onChange={(e) => setFocus(e.target.value.slice(0, 200))}
                  disabled={busy}
                  placeholder="e.g. my guard when I get tired, left-side pressure…"
                  className="w-full bg-transparent border border-border/50 focus:border-primary/50 outline-none px-3 py-2.5 text-sm text-foreground/90 placeholder:text-muted-foreground/50 transition-colors disabled:opacity-40"
                />
                <FocusPresets focus={focus} setFocus={setFocus} disabled={busy} />
              </section>

              {phase.stage === "error" && (
                <div className="border border-destructive/40 bg-destructive/10 px-4 py-3 space-y-2">
                  <div className="font-mono text-[10px] uppercase tracking-widest text-destructive/90">
                    {phase.title}
                  </div>
                  {phase.causes.length > 0 && (
                    <ul className="space-y-1">
                      {phase.causes.map((c, i) => (
                        <li
                          key={i}
                          className="text-[11px] leading-relaxed text-destructive/70 before:content-['—'] before:mr-1.5"
                        >
                          {c}
                        </li>
                      ))}
                    </ul>
                  )}
                  {canRetry && (
                    <button
                      type="button"
                      onClick={retry}
                      className="mt-1 font-mono text-[10px] uppercase tracking-widest border border-destructive/50 text-destructive/90 hover:bg-destructive/15 transition-colors px-3 py-1.5"
                    >
                      Retry
                    </button>
                  )}
                </div>
              )}

              <History
                items={analyses.data?.analyses ?? []}
                loading={analyses.isLoading}
                onOpen={(id) => setOpenId(id)}
                compareId={compareId}
                onSetCompare={(id) => setCompareId((prev) => (prev === id ? null : id))}
              />

              <AthleteModel />
            </div>
          </>
        )}
      </main>

      <input
        ref={fileRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={onPick}
      />

      <BottomNav />

      {busy && (
        <CinematicOverlay phase={phase} kindLabel={KINDS.find((k) => k.value === kind)?.label ?? ""} />
      )}
      {danger && <div className="pointer-events-none fixed inset-0 z-0 frame-danger-glow" />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Upload controls (mobile only — desktop renders inline)
// ---------------------------------------------------------------------------

// Focus presets — set a concise focus string the AI reads. "Overall" clears it.
const FOCUS_PRESETS: { label: string; value: string }[] = [
  { label: "Overall", value: "" },
  { label: "Striking", value: "my striking — output, distance, shot selection" },
  { label: "Grappling", value: "my grappling — control, transitions, scrambles" },
  { label: "Footwork", value: "my footwork and positioning" },
  { label: "Defence", value: "my defence under pressure" },
  { label: "Fight IQ", value: "my decision-making and fight IQ" },
  { label: "Pace", value: "my pace and output under fatigue" },
];

function FocusPresets({
  focus,
  setFocus,
  disabled,
}: {
  focus: string;
  setFocus: (v: string) => void;
  disabled: boolean;
}) {
  const current = focus.trim();
  return (
    <div className="flex flex-wrap gap-[3px]">
      {FOCUS_PRESETS.map((p) => {
        const active = current === p.value;
        return (
          <button
            key={p.label}
            type="button"
            onClick={() => setFocus(p.value)}
            disabled={disabled}
            className="font-mono text-[9px] uppercase tracking-widest px-2.5 py-1.5 transition-all duration-200 disabled:opacity-40"
            style={{
              border: `1px solid ${active ? "hsla(0,68%,46%,0.55)" : "hsla(0,0%,100%,0.09)"}`,
              background: active ? "hsla(0,68%,46%,0.1)" : "transparent",
              color: active ? "hsl(0,55%,68%)" : "hsla(0,0%,100%,0.5)",
            }}
          >
            {p.label}
          </button>
        );
      })}
    </div>
  );
}

function SourceToggle({
  mode,
  setMode,
  disabled,
}: {
  mode: "upload" | "link";
  setMode: (m: "upload" | "link") => void;
  disabled: boolean;
}) {
  const opts: { value: "upload" | "link"; label: string }[] = [
    { value: "upload", label: "Upload file" },
    { value: "link", label: "Paste link" },
  ];
  return (
    <div className="grid grid-cols-2 gap-[3px]">
      {opts.map((o) => {
        const active = mode === o.value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => setMode(o.value)}
            disabled={disabled}
            className="font-mono text-[10px] uppercase tracking-widest py-2.5 transition-all duration-200 disabled:opacity-40"
            style={{
              borderLeft: `2px solid ${active ? "hsla(0,68%,46%,0.9)" : "hsla(0,0%,100%,0.1)"}`,
              borderTop: `1px solid ${active ? "hsla(0,68%,46%,0.2)" : "hsla(0,0%,100%,0.06)"}`,
              borderRight: "1px solid hsla(0,0%,100%,0.04)",
              borderBottom: "1px solid hsla(0,0%,100%,0.04)",
              background: active ? "hsla(0,68%,46%,0.08)" : "transparent",
              color: active ? "hsl(0,55%,65%)" : "hsla(0,0%,100%,0.55)",
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function LinkInput({
  value,
  onChange,
  onSubmit,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  disabled: boolean;
}) {
  return (
    <div className="w-full space-y-3">
      <div
        className="relative flex flex-col gap-4 p-5"
        style={{
          border: "1px solid hsla(0,68%,46%,0.25)",
          background: "linear-gradient(160deg, hsla(0,68%,46%,0.04) 0%, transparent 60%)",
        }}
      >
        <span className="absolute left-0 top-0 h-3 w-3 border-l border-t border-destructive/40" />
        <span className="absolute right-0 top-0 h-3 w-3 border-r border-t border-destructive/40" />
        <span className="absolute left-0 bottom-0 h-3 w-3 border-l border-b border-destructive/40" />
        <span className="absolute right-0 bottom-0 h-3 w-3 border-r border-b border-destructive/40" />

        <div className="flex items-center gap-2.5">
          <Link2 className="w-4 h-4 flex-none" strokeWidth={1.5} style={{ color: "hsla(0,68%,46%,0.6)" }} />
          <input
            type="url"
            inputMode="url"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                onSubmit();
              }
            }}
            disabled={disabled}
            placeholder="https://…"
            className="flex-1 min-w-0 bg-transparent border-b border-border/40 focus:border-destructive/40 outline-none py-1.5 text-sm text-foreground/85 placeholder:text-muted-foreground/35 transition-colors disabled:opacity-40"
          />
        </div>
        <button
          type="button"
          onClick={onSubmit}
          disabled={disabled || !value.trim()}
          className="w-full font-mono text-[11px] uppercase tracking-[0.35em] py-3 transition-colors disabled:opacity-40 hover:bg-destructive/10"
          style={{
            border: "1px solid hsla(0,68%,46%,0.45)",
            color: "hsl(0,55%,68%)",
            background: "hsla(0,68%,46%,0.06)",
          }}
        >
          Fetch and analyse
        </button>
      </div>
      <p className="font-mono text-[9px] leading-relaxed tracking-wide text-muted-foreground/45">
        Direct video links (.mp4 / .mov), Google Drive and Dropbox share links work best. YouTube is
        best-effort — use your own footage; some links won&apos;t pull. The clip is fetched and read on
        this device, nothing else is stored.
      </p>
    </div>
  );
}

function UploadControls({
  kind,
  setKind,
  focus,
  setFocus,
  busy,
  phase,
  canRetry,
  fileRef,
  onPick,
  retry,
  sourceMode,
  setSourceMode,
  linkUrl,
  setLinkUrl,
  onSubmitLink,
  analyses,
  analysesLoading,
  onOpen,
  compareId,
  onSetCompare,
}: {
  kind: AnalysisKind;
  setKind: (k: AnalysisKind) => void;
  focus: string;
  setFocus: (v: string) => void;
  busy: boolean;
  phase: Phase;
  canRetry: boolean;
  fileRef: React.RefObject<HTMLInputElement | null>;
  onPick: (e: React.ChangeEvent<HTMLInputElement>) => void;
  retry: () => void;
  sourceMode: "upload" | "link";
  setSourceMode: (m: "upload" | "link") => void;
  linkUrl: string;
  setLinkUrl: (v: string) => void;
  onSubmitLink: () => void;
  analyses: AnalysisListItem[];
  analysesLoading: boolean;
  onOpen: (id: number) => void;
  compareId: number | null;
  onSetCompare: (id: number) => void;
}) {
  return (
    <>
      {/* Atmospheric intro block */}
      <section
        className="relative border-l-2 border-destructive/50 pl-4 py-1"
        style={{ background: "linear-gradient(90deg, hsla(0,68%,46%,0.05), transparent 80%)" }}
      >
        <div className="font-mono text-[9px] uppercase tracking-[0.45em] text-destructive/70 mb-2">
          Movement read
        </div>
        <p className="text-sm text-foreground/75 leading-relaxed">
          Upload a clip. The system reads your movement directly — guard, base, shoulders,
          output rhythm — scores it against itself, and tells you what your nervous system
          is doing under load.
        </p>
        <p className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground/45 mt-2">
          Processed on device · only the read is kept
        </p>
      </section>

      {/* Clip type selector */}
      <section className="space-y-2">
        <div className="font-mono text-[9px] uppercase tracking-[0.4em] text-muted-foreground/70">
          Clip type
        </div>
        <div className="grid grid-cols-3 gap-[3px]">
          {KINDS.map((k) => (
            <button
              key={k.value}
              type="button"
              onClick={() => setKind(k.value)}
              disabled={busy}
              className="font-mono text-[10px] uppercase tracking-widest py-2.5 transition-all duration-200 disabled:opacity-40"
              style={{
                borderLeft: `2px solid ${kind === k.value ? "hsla(0,68%,46%,0.9)" : "hsla(0,0%,100%,0.1)"}`,
                borderTop: `1px solid ${kind === k.value ? "hsla(0,68%,46%,0.2)" : "hsla(0,0%,100%,0.06)"}`,
                borderRight: `1px solid hsla(0,0%,100%,0.04)`,
                borderBottom: `1px solid hsla(0,0%,100%,0.04)`,
                background: kind === k.value ? "hsla(0,68%,46%,0.08)" : "transparent",
                color: kind === k.value ? "hsl(0,55%,65%)" : "hsla(0,0%,100%,0.55)",
              }}
            >
              {k.label}
            </button>
          ))}
        </div>
      </section>

      {/* Focus input */}
      <section className="space-y-2">
        <div className="font-mono text-[9px] uppercase tracking-[0.4em] text-muted-foreground/70">
          Focus area{" "}
          <span className="font-sans normal-case tracking-normal text-muted-foreground/40 text-[11px]">optional</span>
        </div>
        <input
          type="text"
          value={focus}
          onChange={(e) => setFocus(e.target.value.slice(0, 200))}
          disabled={busy}
          placeholder="guard under fatigue, left shoulder, pressure after a miss…"
          className="w-full bg-transparent border-b border-border/40 focus:border-destructive/40 outline-none py-2.5 text-sm text-foreground/85 placeholder:text-muted-foreground/35 transition-colors disabled:opacity-40"
        />
        <FocusPresets focus={focus} setFocus={setFocus} disabled={busy} />
      </section>

      {/* Source: upload a file or paste a link */}
      <section className="space-y-3">
        <SourceToggle mode={sourceMode} setMode={setSourceMode} disabled={busy} />
        {sourceMode === "upload" ? (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className="group w-full relative overflow-hidden transition-all duration-300 disabled:opacity-50 py-12 flex flex-col items-center justify-center gap-4"
            style={{
              border: "1px solid hsla(0,68%,46%,0.25)",
              background: "linear-gradient(160deg, hsla(0,68%,46%,0.04) 0%, transparent 60%)",
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "hsla(0,68%,46%,0.55)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "hsla(0,68%,46%,0.25)"; }}
          >
            {/* Subtle corner brackets */}
            <span className="absolute left-0 top-0 h-3 w-3 border-l border-t border-destructive/40" />
            <span className="absolute right-0 top-0 h-3 w-3 border-r border-t border-destructive/40" />
            <span className="absolute left-0 bottom-0 h-3 w-3 border-l border-b border-destructive/40" />
            <span className="absolute right-0 bottom-0 h-3 w-3 border-r border-b border-destructive/40" />

            <Upload className="w-8 h-8" strokeWidth={1} style={{ color: "hsla(0,68%,46%,0.6)" }} />
            <div className="font-mono text-[11px] uppercase tracking-[0.45em] text-foreground/80">
              Drop footage
            </div>
            <div className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground/45">
              mp4 · mov · first 75s processed
            </div>
          </button>
        ) : (
          <LinkInput value={linkUrl} onChange={setLinkUrl} onSubmit={onSubmitLink} disabled={busy} />
        )}
      </section>

      {phase.stage === "error" && (
        <div className="border border-destructive/40 bg-destructive/10 px-4 py-3 space-y-2">
          <div className="font-mono text-[10px] uppercase tracking-widest text-destructive/90">
            {phase.title}
          </div>
          {phase.causes.length > 0 && (
            <ul className="space-y-1">
              {phase.causes.map((c, i) => (
                <li
                  key={i}
                  className="text-[11px] leading-relaxed text-destructive/70 before:content-['—'] before:mr-1.5"
                >
                  {c}
                </li>
              ))}
            </ul>
          )}
          {canRetry && (
            <button
              type="button"
              onClick={retry}
              className="mt-1 font-mono text-[10px] uppercase tracking-widest border border-destructive/50 text-destructive/90 hover:bg-destructive/15 transition-colors px-3 py-1.5"
            >
              Retry
            </button>
          )}
        </div>
      )}

      <History
        items={analyses}
        loading={analysesLoading}
        onOpen={onOpen}
        compareId={compareId}
        onSetCompare={onSetCompare}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Desktop workstation panels
// ---------------------------------------------------------------------------

function WorkstationLeft({
  analysis,
  videoUrl,
  onClose,
}: {
  analysis: VideoAnalysis;
  videoUrl: string | null;
  onClose: () => void;
}) {
  const [activeKf, setActiveKf] = useState(0);
  const [localNotes, setLocalNotes] = useState<Record<number, string>>(analysis.keyframeNotes ?? {});
  const videoRef = useRef<HTMLVideoElement>(null);
  const updateNotes = useUpdateKeyframeNotes(analysis.id);
  const kf = analysis.keyframes[activeKf];

  function seekTo(ts: number, idx: number) {
    setActiveKf(idx);
    if (videoRef.current) {
      videoRef.current.currentTime = ts;
    }
  }

  function commitNote(notes: Record<number, string>) {
    void updateNotes.mutate(notes);
  }

  return (
    <div className="flex flex-col h-full">
      {/* meta bar */}
      <div className="flex-none flex items-center justify-between px-5 py-3 border-b border-border/30 bg-black/30">
        <div className="font-mono text-[9px] uppercase tracking-[0.35em] text-muted-foreground">
          {analysis.kind} · {analysis.durationSec.toFixed(0)}s read
          {analysis.focus && (
            <span className="ml-2 normal-case tracking-normal text-muted-foreground/70">
              · {analysis.focus}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="New analysis"
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="w-4 h-4" strokeWidth={1.5} />
        </button>
      </div>

      {/* main area — video player when available, keyframe fallback for saved reports */}
      <div className="flex-1 min-h-0 flex flex-col bg-black">
        {videoUrl ? (
          <div className="flex-1 min-h-0 flex items-center justify-center p-3">
            <video
              ref={videoRef}
              src={videoUrl}
              controls
              playsInline
              className="w-full max-h-full border border-border/30 object-contain"
              style={{ maxHeight: "calc(100% - 1rem)" }}
            />
          </div>
        ) : (
          <div className="flex-1 min-h-0 flex items-center justify-center p-4 bg-black/40">
            {kf ? (
              <figure className="w-full space-y-2">
                <img
                  src={kf.imageBase64}
                  alt={kf.caption}
                  className="w-full border border-border/40 object-contain max-h-[50vh]"
                />
                <figcaption className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground/85 px-1">
                  {kf.timestamp.toFixed(1)}s · {kf.caption}
                </figcaption>
                {localNotes[activeKf] && (
                  <div className="font-mono text-[9px] text-primary/85 px-1 leading-snug">
                    {localNotes[activeKf]}
                  </div>
                )}
              </figure>
            ) : (
              <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground/50">
                No keyframes
              </div>
            )}
          </div>
        )}
      </div>

      {/* filmstrip — click to seek + annotate */}
      {analysis.keyframes.length > 0 && (
        <div className="flex-none border-t border-border/30 bg-black/60 px-4 py-3 space-y-2">
          <div className="font-mono text-[8px] uppercase tracking-[0.35em] text-muted-foreground/70">
            Detected events
            {videoUrl && (
              <span className="ml-2 normal-case tracking-normal text-muted-foreground/50">
                · click to seek · click again to annotate
              </span>
            )}
            {!videoUrl && (
              <span className="ml-2 normal-case tracking-normal text-muted-foreground/50">
                · click to annotate
              </span>
            )}
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {analysis.keyframes.map((k, i) => (
              <button
                key={i}
                type="button"
                onClick={() => seekTo(k.timestamp, i)}
                className={`flex-none flex flex-col border transition-colors ${
                  i === activeKf ? "border-primary/70" : "border-border/40 hover:border-primary/40"
                }`}
                style={{ width: 88 }}
                title={`${k.timestamp.toFixed(1)}s — ${k.caption}`}
              >
                <img src={k.imageBase64} alt={k.caption} className="w-full" />
                <div className="font-mono text-[7px] uppercase tracking-widest text-muted-foreground/80 px-1 py-1 truncate bg-black/60">
                  {k.timestamp.toFixed(1)}s
                </div>
                <div className="font-mono text-[7px] uppercase tracking-widest text-muted-foreground/70 px-1 pb-1 truncate">
                  {k.caption}
                </div>
                {localNotes[i] && (
                  <div className="font-mono text-[7px] text-primary/80 px-1 pb-1 truncate leading-tight border-t border-border/20 pt-0.5">
                    {localNotes[i]}
                  </div>
                )}
              </button>
            ))}
          </div>
          {/* inline note editor for the active keyframe */}
          <div className="flex items-center gap-2 pt-1">
            <div className="font-mono text-[7px] uppercase tracking-widest text-muted-foreground/60 flex-none">
              Note
            </div>
            <input
              key={activeKf}
              type="text"
              maxLength={150}
              value={localNotes[activeKf] ?? ""}
              onChange={(e) => setLocalNotes((prev) => ({ ...prev, [activeKf]: e.target.value }))}
              onBlur={(e) => {
                const updated = { ...localNotes, [activeKf]: e.target.value.trim() };
                if (!updated[activeKf]) delete updated[activeKf];
                setLocalNotes(updated);
                commitNote(updated);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              }}
              placeholder={`Add a note for frame ${activeKf + 1}…`}
              className="flex-1 bg-transparent border-b border-border/40 focus:border-primary/50 outline-none font-mono text-[10px] text-foreground/90 placeholder:text-muted-foreground/35 py-0.5 pb-1 transition-colors"
            />
          </div>
        </div>
      )}
    </div>
  );
}

function WorkstationRight({
  analysis,
  fighter,
  onClose,
  onSelectSession,
}: {
  analysis: VideoAnalysis;
  fighter: Fighter | null;
  onClose: () => void;
  onSelectSession?: (id: number) => void;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [saving, setSaving] = useState(false);
  const { data: analysesData } = useAnalyses();

  async function saveCard() {
    if (!cardRef.current) return;
    setSaving(true);
    try {
      const dataUrl = await toPng(cardRef.current, {
        pixelRatio: 2,
        backgroundColor: "#060504",
        cacheBust: true,
      });
      const link = document.createElement("a");
      link.download = `frame-report-${analysis.id}.png`;
      link.href = dataUrl;
      link.click();
    } catch {
      // swallow — export is best-effort
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-7">
      {/* FRAME REPORT card */}
      <div className="flex flex-col items-center gap-3">
        <FrameReportCard ref={cardRef} analysis={analysis} fighter={fighter} />
        <button
          type="button"
          onClick={saveCard}
          disabled={saving}
          className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.3em] border border-border/60 hover:border-primary/50 px-4 py-2.5 text-foreground/80 transition-colors disabled:opacity-50"
        >
          <Download className="w-3.5 h-3.5" strokeWidth={1.5} />
          {saving ? "Rendering…" : "Save card"}
        </button>
      </div>

      {/* summary */}
      <p className="text-[0.95rem] text-foreground/90 leading-relaxed border-l-2 border-primary/60 pl-4">
        {analysis.summary}
      </p>

      {/* findings table */}
      {analysis.findings.length > 0 && (
        <FindingsTable findings={analysis.findings} />
      )}

      {/* raw signals */}
      {analysis.metrics.signals.length > 0 && (
        <RawSignalsTable signals={analysis.metrics.signals} prevSignals={analysis.prevSignals} signalHistory={analysis.signalHistory} hasCustomCompare={!!analysis.liveComparison} onSelectSession={onSelectSession} />
      )}

      {/* comparison vs selected or last session */}
      {(() => {
        const cmp = analysis.liveComparison ?? analysis.comparison;
        return cmp && cmp.deltas.length > 0 ? (
          <ComparisonSection comparison={cmp} isCustomBaseline={!!analysis.liveComparison} />
        ) : null;
      })()}

      {/* session-over-session trend chart — desktop only, needs 3+ sessions */}
      {(analysesData?.analyses?.length ?? 0) >= 3 && (
        <TrendSection analyses={analysesData!.analyses} currentId={analysis.id} />
      )}

      {/* score provenance */}
      <ScoreProvenance analysis={analysis} />

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

function SavedWorkstationLeft({
  id,
  onClose,
}: {
  id: number;
  onClose: () => void;
}) {
  const { data, isLoading, isError } = useAnalysis(id);
  if (isLoading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 py-16">
        <FrameOctagon size={56} spin spinSeconds={4} glow={false} />
        <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
          Loading read
        </div>
      </div>
    );
  }
  if (isError || !data?.analysis) {
    return (
      <div className="p-6 space-y-4">
        <div className="border border-destructive/40 bg-destructive/10 px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-destructive/90">
          could not load this read
        </div>
        <button type="button" onClick={onClose} className="w-full font-mono text-[10px] uppercase tracking-[0.3em] border border-border/60 py-3 text-foreground/80">
          Back
        </button>
      </div>
    );
  }
  return <WorkstationLeft analysis={data.analysis} videoUrl={null} onClose={onClose} />;
}

function SavedWorkstationRight({
  id,
  compareId,
  fighter,
  onClose,
  onSelectSession,
}: {
  id: number;
  compareId: number | null;
  fighter: Fighter | null;
  onClose: () => void;
  onSelectSession?: (id: number) => void;
}) {
  const { data, isLoading, isError } = useAnalysis(id, compareId);
  if (isLoading || isError || !data?.analysis) return null;
  return <WorkstationRight analysis={data.analysis} fighter={fighter} onClose={onClose} onSelectSession={onSelectSession} />;
}

// ---------------------------------------------------------------------------
// Shared sub-components (used in both mobile Report and desktop Workstation)
// ---------------------------------------------------------------------------

function FindingsTable({
  findings,
}: {
  findings: VideoAnalysis["findings"];
}) {
  return (
    <section className="space-y-3">
      <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground border-b border-border/40 pb-1.5">
        What the body is doing
      </div>
      <div className="w-full border border-border/40 overflow-hidden">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-border/40">
              <th className="font-mono text-[8px] uppercase tracking-widest text-muted-foreground text-left px-3 py-2 w-[90px]">
                Area
              </th>
              <th className="font-mono text-[8px] uppercase tracking-widest text-muted-foreground text-left px-3 py-2">
                Finding
              </th>
              <th className="font-mono text-[8px] uppercase tracking-widest text-muted-foreground text-left px-3 py-2 w-[72px]">
                Signal
              </th>
            </tr>
          </thead>
          <tbody>
            {findings.map((f, i) => (
              <tr
                key={i}
                className="border-b border-border/30 last:border-0"
              >
                <td className="px-3 py-2.5 align-top">
                  <span
                    className={`font-mono text-[8px] uppercase tracking-widest px-1.5 py-0.5 border inline-block ${
                      f.severity === "high"
                        ? "text-red-400/90 border-red-400/40"
                        : f.severity === "medium"
                          ? "text-amber-300/90 border-amber-300/40"
                          : "text-muted-foreground border-border/50"
                    }`}
                  >
                    {f.area}
                  </span>
                </td>
                <td className="px-3 py-2.5 align-top space-y-1">
                  <div className="text-[0.9rem] text-foreground/95 leading-snug">
                    {f.title}
                  </div>
                  <div className="text-xs text-foreground/75 leading-relaxed">
                    {f.observation}
                  </div>
                  {f.nervousSystemFraming && (
                    <div className="text-xs text-primary/80 leading-relaxed italic">
                      {f.nervousSystemFraming}
                    </div>
                  )}
                </td>
                <td className="px-3 py-2.5 align-top">
                  <span
                    className={`font-mono text-[8px] uppercase tracking-widest ${
                      f.severity === "high"
                        ? "text-red-400/80"
                        : f.severity === "medium"
                          ? "text-amber-300/80"
                          : "text-muted-foreground/70"
                    }`}
                  >
                    {f.severity}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// Per-signal orderings: index 0 = best, ascending = worse.
// A lower index (current vs prev) means improvement.
const SIGNAL_RANK: Record<string, string[]> = {
  guard_height: ["high", "mostly held", "drifting low", "dropped"],
  shoulder_brace: ["settled", "braced/high"],
  balance_sway: ["anchored", "drifting"],
  stance_width: ["balanced", "narrow", "wide"],
  rotation: ["connected", "stacked (little separation)", "heavily wound"],
  output_rhythm: ["even", "bursty / uneven"],
};

function signalDelta(
  key: string,
  current: string,
  prev: string,
): "up" | "down" | "same" | "changed" {
  if (current === prev) return "same";
  const rank = SIGNAL_RANK[key];
  if (!rank) return "changed";
  const ci = rank.indexOf(current);
  const pi = rank.indexOf(prev);
  if (ci === -1 || pi === -1) return "changed";
  return ci < pi ? "up" : "down";
}

function SignalDeltaBadge({
  dir,
  prevValue,
}: {
  dir: "up" | "down" | "same" | "changed";
  prevValue: string;
}) {
  if (dir === "same") {
    return (
      <span title="No change vs last session">
        <Minus className="w-3 h-3 text-muted-foreground/50 inline-block" strokeWidth={2} />
      </span>
    );
  }
  if (dir === "up") {
    return (
      <span title={`Improved — was: ${prevValue}`}>
        <ArrowUpRight className="w-3.5 h-3.5 text-emerald-300/90 inline-block" strokeWidth={2} />
      </span>
    );
  }
  if (dir === "down") {
    return (
      <span title={`Declined — was: ${prevValue}`}>
        <ArrowDownRight className="w-3.5 h-3.5 text-red-400/90 inline-block" strokeWidth={2} />
      </span>
    );
  }
  // changed but no known ordering
  return (
    <span
      className="font-mono text-[8px] uppercase tracking-widest text-muted-foreground/60"
      title={`Changed — was: ${prevValue}`}
    >
      ~
    </span>
  );
}

type SignalHistoryEntry = { id: number; createdAt: string; signals: VideoAnalysis["metrics"]["signals"] };

type TrailStep = { value: string; id: number | null };

function buildSignalTrail(
  signalKey: string,
  currentValue: string,
  history: SignalHistoryEntry[],
): TrailStep[] {
  const allEntries: TrailStep[] = [];
  for (const h of history) {
    const sig = h.signals.find((s) => s.key === signalKey);
    if (sig?.value) allEntries.push({ value: sig.value, id: h.id });
  }
  allEntries.push({ value: currentValue, id: null });
  const deduped: TrailStep[] = [];
  for (const entry of allEntries) {
    if (deduped.length === 0 || deduped[deduped.length - 1].value !== entry.value) {
      deduped.push({ ...entry });
    } else {
      deduped[deduped.length - 1] = { ...entry };
    }
  }
  return deduped.slice(-5);
}

function SignalHistoryTrail({
  signalKey,
  currentValue,
  history,
  onSelectSession,
}: {
  signalKey: string;
  currentValue: string;
  history: SignalHistoryEntry[];
  onSelectSession?: (id: number) => void;
}) {
  const trail = buildSignalTrail(signalKey, currentValue, history);
  if (trail.length < 3) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-0.5 gap-y-0.5 mt-1">
      {trail.map((step, i) => {
        const isCurrent = i === trail.length - 1;
        const prev = trail[i - 1];
        const dir = i > 0 && prev != null ? signalDelta(signalKey, step.value, prev.value) : null;
        const arrowColor =
          dir === "up"
            ? "text-emerald-300/60"
            : dir === "down"
              ? "text-red-400/60"
              : "text-muted-foreground/30";
        const tappable = !isCurrent && step.id != null && onSelectSession != null;
        return (
          <span key={i} className="flex items-center gap-x-0.5">
            {i > 0 && (
              <span className={`font-mono text-[8px] leading-none select-none ${arrowColor}`}>›</span>
            )}
            {tappable ? (
              <button
                type="button"
                onClick={() => onSelectSession!(step.id!)}
                title="View this session's full read"
                className={`font-mono text-[8px] uppercase tracking-wider leading-none text-muted-foreground/45 underline decoration-dotted underline-offset-2 hover:text-foreground/70 active:text-foreground/90 transition-colors cursor-pointer`}
              >
                {step.value}
              </button>
            ) : (
              <span
                className={`font-mono text-[8px] uppercase tracking-wider leading-none ${
                  isCurrent ? "text-foreground/80" : "text-muted-foreground/45"
                }`}
              >
                {step.value}
              </span>
            )}
          </span>
        );
      })}
    </div>
  );
}

function RawSignalsTable({
  signals,
  prevSignals,
  signalHistory,
  hasCustomCompare,
  onSelectSession,
}: {
  signals: VideoAnalysis["metrics"]["signals"];
  prevSignals?: VideoAnalysis["prevSignals"];
  signalHistory?: VideoAnalysis["signalHistory"];
  hasCustomCompare?: boolean;
  onSelectSession?: (id: number) => void;
}) {
  const prevByKey = prevSignals
    ? new Map(prevSignals.map((s) => [s.key, s]))
    : null;

  const hasPrev = prevByKey != null && prevByKey.size > 0;
  const history: SignalHistoryEntry[] = signalHistory ?? [];

  return (
    <section className="space-y-3">
      <div className="flex items-baseline gap-2 border-b border-border/40 pb-1.5">
        <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
          Raw signals
        </span>
        {hasPrev && hasCustomCompare && (
          <span className="font-mono text-[8px] uppercase tracking-widest text-primary/60">
            vs selected baseline
          </span>
        )}
      </div>
      <div className="w-full border border-border/40 overflow-hidden">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-border/40 bg-secondary/20">
              <th className="font-mono text-[8px] uppercase tracking-widest text-muted-foreground text-left px-3 py-2 w-[130px]">
                Signal
              </th>
              <th className="font-mono text-[8px] uppercase tracking-widest text-muted-foreground text-left px-3 py-2 w-[80px]">
                Value
              </th>
              {hasPrev && (
                <th className="font-mono text-[8px] uppercase tracking-widest text-muted-foreground text-left px-3 py-2 w-[28px]" title={hasCustomCompare ? "Change vs selected baseline" : "Change vs previous session"}>
                  vs
                </th>
              )}
              <th className="font-mono text-[8px] uppercase tracking-widest text-muted-foreground text-left px-3 py-2">
                Detail
              </th>
            </tr>
          </thead>
          <tbody>
            {signals.map((s, i) => {
              const prev = prevByKey?.get(s.key);
              const dir = prev ? signalDelta(s.key, s.value, prev.value) : null;
              const trail = buildSignalTrail(s.key, s.value, history);
              const showTrail = !hasCustomCompare && trail.length >= 3;
              return (
                <tr
                  key={s.key}
                  className={`border-b border-border/30 last:border-0 ${
                    i % 2 === 0 ? "" : "bg-secondary/10"
                  }`}
                >
                  <td className="px-3 py-2 align-top">
                    <span className="font-mono text-[9px] uppercase tracking-widest text-foreground/80">
                      {s.label}
                    </span>
                  </td>
                  <td className="px-3 py-2 align-top">
                    <span className="font-mono text-[11px] text-foreground/90">
                      {s.value}
                    </span>
                    {showTrail ? (
                      <SignalHistoryTrail
                        signalKey={s.key}
                        currentValue={s.value}
                        history={history}
                        onSelectSession={onSelectSession}
                      />
                    ) : (
                      prev && dir !== "same" && (
                        <div className="font-mono text-[9px] text-muted-foreground/50 mt-0.5 leading-snug">
                          was: {prev.value}
                        </div>
                      )
                    )}
                  </td>
                  {hasPrev && (
                    <td className="px-3 py-2 align-middle">
                      {dir != null ? (
                        <SignalDeltaBadge dir={dir} prevValue={prev?.value ?? ""} />
                      ) : (
                        <span className="font-mono text-[8px] text-muted-foreground/30">—</span>
                      )}
                    </td>
                  )}
                  <td className="px-3 py-2 align-top">
                    <span className="text-xs text-muted-foreground/80 leading-relaxed">
                      {s.detail}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ComparisonSection({
  comparison,
  isCustomBaseline,
}: {
  comparison: NonNullable<VideoAnalysis["comparison"]>;
  isCustomBaseline?: boolean;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-baseline gap-2 border-b border-border/40 pb-1.5">
        <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
          What changed
        </span>
        {isCustomBaseline && (
          <span className="font-mono text-[8px] uppercase tracking-widest text-primary/60">
            vs selected baseline
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {comparison.deltas.map((d) => (
          <div
            key={d.key}
            className="flex items-center justify-between gap-2 border border-border/50 px-3 py-2"
          >
            <span className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground/80">
              {d.label}
            </span>
            <span className="flex items-center gap-1 font-mono text-[11px] text-foreground/90">
              {deltaIcon(d.delta)}
              {d.delta > 0 ? `+${d.delta}` : d.delta}
            </span>
          </div>
        ))}
      </div>
      {comparison.note && (
        <p className="text-sm text-primary/85 leading-relaxed italic">
          {comparison.note}
        </p>
      )}
    </section>
  );
}

function ScoreProvenance({ analysis }: { analysis: VideoAnalysis }) {
  return (
    <section className="space-y-2 pt-1">
      <div className="font-mono text-[9px] uppercase tracking-[0.3em] text-muted-foreground/80">
        How these scores were derived
      </div>
      <div className="space-y-1.5">
        {analysis.scores.map((s) => (
          <div key={s.key} className="font-mono text-[9px] tracking-wide" title={s.basis}>
            <span className="uppercase tracking-widest text-foreground/85">
              {s.label} {s.value}
            </span>
            <span className="text-muted-foreground/70"> — {s.basis}</span>
          </div>
        ))}
      </div>
      <div className="font-mono text-[8px] uppercase tracking-widest text-muted-foreground/60 pt-2 leading-relaxed">
        {analysis.metrics.poseFrames} of {analysis.metrics.framesAnalysed} frames locked a pose ·
        every number derived from measured movement, never invented
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Mobile-only Report component (identical to original, uses shared sub-components)
// ---------------------------------------------------------------------------

function Report({
  analysis,
  fighter,
  onClose,
  onSelectSession,
}: {
  analysis: VideoAnalysis;
  fighter: Fighter | null;
  onClose: () => void;
  onSelectSession?: (id: number) => void;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [activeKf, setActiveKf] = useState(0);
  const [saving, setSaving] = useState(false);

  async function saveCard() {
    if (!cardRef.current) return;
    setSaving(true);
    try {
      const dataUrl = await toPng(cardRef.current, {
        pixelRatio: 2,
        backgroundColor: "#060504",
        cacheBust: true,
      });
      const link = document.createElement("a");
      link.download = `frame-report-${analysis.id}.png`;
      link.href = dataUrl;
      link.click();
    } catch {
      // swallow — export is best-effort
    } finally {
      setSaving(false);
    }
  }

  const [localNotes, setLocalNotes] = useState<Record<number, string>>(analysis.keyframeNotes ?? {});
  const updateNotes = useUpdateKeyframeNotes(analysis.id);
  const kf = analysis.keyframes[activeKf];

  function commitNote(notes: Record<number, string>) {
    void updateNotes.mutate(notes);
  }

  return (
    <div className="space-y-7">
      <div className="flex items-start justify-between gap-4">
        <div className="font-mono text-[9px] uppercase tracking-[0.35em] text-muted-foreground">
          {analysis.kind} · {analysis.durationSec.toFixed(0)}s read
          {analysis.focus && (
            <span className="block normal-case tracking-normal text-muted-foreground/70 mt-1">
              focus: {analysis.focus}
            </span>
          )}
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

      {/* shareable FRAME REPORT card */}
      <div className="flex flex-col items-center gap-3">
        <FrameReportCard ref={cardRef} analysis={analysis} fighter={fighter} />
        <button
          type="button"
          onClick={saveCard}
          disabled={saving}
          className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.3em] border border-border/60 hover:border-primary/50 px-4 py-2.5 text-foreground/80 transition-colors disabled:opacity-50"
        >
          <Download className="w-3.5 h-3.5" strokeWidth={1.5} />
          {saving ? "Rendering…" : "Save card"}
        </button>
      </div>

      <p className="text-[0.95rem] text-foreground/90 leading-relaxed border-l-2 border-primary/60 pl-4">
        {analysis.summary}
      </p>

      {/* comparison vs selected or last session */}
      {(() => {
        const cmp = analysis.liveComparison ?? analysis.comparison;
        return cmp && cmp.deltas.length > 0 ? (
          <ComparisonSection comparison={cmp} isCustomBaseline={!!analysis.liveComparison} />
        ) : null;
      })()}

      {/* detected events — clickable keyframes + note annotation */}
      {analysis.keyframes.length > 0 && (
        <section className="space-y-3">
          <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground border-b border-border/40 pb-1.5">
            Detected events
          </div>
          {kf && (
            <figure className="space-y-2">
              <img
                src={kf.imageBase64}
                alt={kf.caption}
                className="w-full rounded border border-border/50"
              />
              <figcaption className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground/85">
                {kf.timestamp.toFixed(1)}s · {kf.caption}
              </figcaption>
              {localNotes[activeKf] && (
                <div className="font-mono text-[9px] text-primary/85 leading-snug">
                  {localNotes[activeKf]}
                </div>
              )}
            </figure>
          )}
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
            {analysis.keyframes.map((k, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setActiveKf(i)}
                className={`flex-none w-20 border transition-colors ${
                  i === activeKf ? "border-primary/70" : "border-border/40 hover:border-primary/40"
                }`}
              >
                <img src={k.imageBase64} alt={k.caption} className="w-full" />
                <div className="font-mono text-[7px] uppercase tracking-widest text-muted-foreground/80 px-1 py-1 truncate">
                  {k.caption}
                </div>
                {localNotes[i] && (
                  <div className="font-mono text-[7px] text-primary/75 px-1 pb-1 truncate leading-tight border-t border-border/20 pt-0.5">
                    {localNotes[i]}
                  </div>
                )}
              </button>
            ))}
          </div>
          {/* inline note editor for active keyframe */}
          <div className="flex items-center gap-2">
            <div className="font-mono text-[8px] uppercase tracking-widest text-muted-foreground/60 flex-none">
              Note
            </div>
            <input
              key={activeKf}
              type="text"
              maxLength={150}
              value={localNotes[activeKf] ?? ""}
              onChange={(e) => setLocalNotes((prev) => ({ ...prev, [activeKf]: e.target.value }))}
              onBlur={(e) => {
                const updated = { ...localNotes, [activeKf]: e.target.value.trim() };
                if (!updated[activeKf]) delete updated[activeKf];
                setLocalNotes(updated);
                commitNote(updated);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              }}
              placeholder={`Add a note for frame ${activeKf + 1}…`}
              className="flex-1 bg-transparent border-b border-border/40 focus:border-primary/50 outline-none font-mono text-[10px] text-foreground/90 placeholder:text-muted-foreground/35 py-0.5 pb-1 transition-colors"
            />
          </div>
        </section>
      )}

      {/* findings table */}
      {analysis.findings.length > 0 && (
        <FindingsTable findings={analysis.findings} />
      )}

      {/* raw signals */}
      {analysis.metrics.signals.length > 0 && (
        <RawSignalsTable signals={analysis.metrics.signals} prevSignals={analysis.prevSignals} signalHistory={analysis.signalHistory} hasCustomCompare={!!analysis.liveComparison} onSelectSession={onSelectSession} />
      )}

      {/* score provenance */}
      <ScoreProvenance analysis={analysis} />

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

function SavedReport({
  id,
  compareId,
  fighter,
  onClose,
  onSelectSession,
}: {
  id: number;
  compareId: number | null;
  fighter: Fighter | null;
  onClose: () => void;
  onSelectSession?: (id: number) => void;
}) {
  const { data, isLoading, isError } = useAnalysis(id, compareId);
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
  return <Report analysis={data.analysis} fighter={fighter} onClose={onClose} onSelectSession={onSelectSession} />;
}

// ---------------------------------------------------------------------------
// Trend section — session-over-session sparklines (desktop right panel only)
// ---------------------------------------------------------------------------

const SCORE_KEYS = [
  { key: "aggression", label: "Aggression", color: "#ef4444" },
  { key: "composure", label: "Composure", color: "#d97706" },
  { key: "reaction_speed", label: "Reaction", color: "#3b82f6" },
  { key: "defensive_recovery", label: "Defense", color: "#10b981" },
] as const;

function TrendSection({
  analyses,
  currentId,
}: {
  analyses: AnalysisListItem[];
  currentId: number;
}) {
  const ordered = [...analyses].reverse();

  const chartData = ordered.map((a, i) => {
    const point: Record<string, number | string> = {
      session: `S${i + 1}`,
      id: a.id,
    };
    if (Array.isArray(a.scores)) {
      for (const s of a.scores) {
        point[s.key] = s.value;
      }
    }
    return point;
  });

  if (chartData.length < 3) return null;

  const currentIdx = ordered.findIndex((a) => a.id === currentId);

  return (
    <section className="space-y-3">
      <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground border-b border-border/40 pb-1.5">
        Trend
        <span className="ml-2 normal-case tracking-normal text-muted-foreground/50">
          · {chartData.length} sessions
        </span>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-5">
        {SCORE_KEYS.map(({ key, label, color }) => {
          const values = chartData.map((d) => d[key] as number | undefined).filter((v) => v != null);
          const hasData = values.length >= 3;
          return (
            <div key={key} className="space-y-1.5">
              <div className="flex items-baseline justify-between">
                <span className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground/80">
                  {label}
                </span>
                {hasData && (
                  <span className="font-mono text-[9px] text-foreground/60">
                    {values[values.length - 1]}
                  </span>
                )}
              </div>
              {hasData ? (
                <ResponsiveContainer width="100%" height={44}>
                  <LineChart data={chartData} margin={{ top: 2, right: 2, bottom: 2, left: 0 }}>
                    <YAxis domain={[0, 100]} hide />
                    <Tooltip
                      content={({ active, payload, label: lbl }) => {
                        if (!active || !payload?.length) return null;
                        const val = payload[0]?.value as number | undefined;
                        return (
                          <div className="bg-background/95 border border-border/60 px-2 py-1 font-mono text-[9px] text-foreground/90">
                            {lbl} · {val ?? "—"}
                          </div>
                        );
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey={key}
                      stroke={color}
                      strokeWidth={1.5}
                      dot={(props) => {
                        const { cx, cy, index } = props;
                        const isCurrent = index === currentIdx;
                        return (
                          <circle
                            key={`dot-${index}`}
                            cx={cx}
                            cy={cy}
                            r={isCurrent ? 3.5 : 2}
                            fill={isCurrent ? color : "transparent"}
                            stroke={color}
                            strokeWidth={isCurrent ? 0 : 1.5}
                            strokeOpacity={isCurrent ? 1 : 0.6}
                          />
                        );
                      }}
                      activeDot={{ r: 4, fill: color, stroke: "transparent" }}
                      connectNulls
                      opacity={0.9}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div
                  className="flex items-center justify-center font-mono text-[8px] uppercase tracking-widest text-muted-foreground/40 border border-border/20"
                  style={{ height: 44 }}
                >
                  No data
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Shared utility components
// ---------------------------------------------------------------------------

function CinematicOverlay({ phase, kindLabel }: { phase: Phase; kindLabel: string }) {
  const key =
    phase.stage === "fetching"
      ? "fetching"
      : phase.stage === "reading"
        ? "reading"
        : phase.stage === "tracking"
          ? "tracking"
          : phase.stage === "detecting"
            ? "detecting"
            : "loading_ai";

  const phrases = PHASE_PHRASES[key]!;
  const [phraseIdx, setPhraseIdx] = useState(0);
  useEffect(() => {
    setPhraseIdx(0);
    const t = setInterval(() => setPhraseIdx((i) => (i + 1) % phrases.length), 1600);
    return () => clearInterval(t);
  }, [key, phrases.length]);

  const steps = ["reading", "tracking", "detecting", "loading_ai"];
  const activeIdx = steps.indexOf(key);
  const pct =
    (phase.stage === "reading" || phase.stage === "tracking") && typeof phase.pct === "number"
      ? phase.pct
      : null;

  return (
    <div className="fixed inset-0 z-50 bg-black/95 backdrop-blur-sm flex flex-col items-center justify-center px-8 overflow-hidden">
      <div className="pointer-events-none absolute inset-0 frame-scanlines" />
      <div className="pointer-events-none absolute inset-x-0 h-24 frame-scan-sweep" />

      <div className="relative flex items-center justify-center w-32 h-32">
        <img
          src={`${import.meta.env.BASE_URL.replace(/\/$/, "")}frame-logo.png`}
          alt="FRAME"
          className="w-20 h-20 object-contain"
          style={{ animation: "frame-logo-pulse 2.4s ease-in-out infinite", opacity: 0.92 }}
          draggable={false}
        />
        <style>{`
          @keyframes frame-logo-pulse {
            0%, 100% { opacity: 0.6; transform: scale(0.97); }
            50% { opacity: 0.95; transform: scale(1.03); }
          }
        `}</style>
      </div>

      <div className="mt-10 text-center space-y-2 relative">
        <div className="font-mono text-[9px] uppercase tracking-[0.4em] text-muted-foreground">
          {kindLabel}
        </div>
        <div className="font-mono text-base uppercase tracking-[0.3em] text-foreground/95">
          {PHASE_TITLE[key]}
        </div>
        <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-primary/80 h-4 transition-opacity">
          {phrases[phraseIdx]}
          {pct != null ? ` · ${pct}%` : ""}
        </div>
      </div>

      <div className="mt-10 flex items-center gap-2 relative">
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

function deltaIcon(d: number) {
  if (d > 1) return <ArrowUpRight className="w-3.5 h-3.5 text-emerald-300/90" strokeWidth={2} />;
  if (d < -1) return <ArrowDownRight className="w-3.5 h-3.5 text-red-400/90" strokeWidth={2} />;
  return <Minus className="w-3.5 h-3.5 text-muted-foreground/70" strokeWidth={2} />;
}

function History({
  items,
  loading,
  onOpen,
  compareId,
  onSetCompare,
}: {
  items: AnalysisListItem[];
  loading: boolean;
  onOpen: (id: number) => void;
  compareId: number | null;
  onSetCompare: (id: number) => void;
}) {
  const { openUpgrade } = useFramePlus();
  if (loading) return null;
  if (items.length === 0) return null;

  const baselineItem = compareId != null ? items.find((a) => a.id === compareId) : null;

  return (
    <section className="space-y-3 pt-2">
      <div className="flex items-center justify-between gap-3 pb-1.5" style={{ borderBottom: "1px solid hsla(0,0%,100%,0.07)" }}>
        <div className="flex items-center gap-3">
          <span className="h-[5px] w-[5px] rounded-full bg-destructive/60 flex-none" />
          <div className="font-mono text-[9px] uppercase tracking-[0.45em] text-muted-foreground/70">
            Session log
          </div>
        </div>
        {baselineItem && (
          <div className="flex items-center gap-2">
            <span className="font-mono text-[8px] uppercase tracking-widest text-primary/70">
              Baseline: {baselineItem.kind} ·{" "}
              {new Date(baselineItem.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
            </span>
            <button
              type="button"
              onClick={() => onSetCompare(compareId!)}
              className="font-mono text-[8px] uppercase tracking-widest text-muted-foreground/50 hover:text-foreground/70 transition-colors"
              title="Clear baseline"
            >
              <X className="w-3 h-3" strokeWidth={1.5} />
            </button>
          </div>
        )}
      </div>
      <div className="space-y-[3px]">
        {items.map((a, idx) => {
          const isBaseline = a.id === compareId;
          if (a.locked) {
            // Free tier: everything except the latest session is server-locked.
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => openUpgrade("analysis_history")}
                className="w-full text-left px-4 py-3.5 transition-colors duration-200 hover:bg-white/[0.02]"
                style={{
                  borderLeft: "2px solid hsla(0,0%,100%,0.08)",
                  borderTop: "1px solid hsla(0,0%,100%,0.05)",
                  background: idx % 2 === 0 ? "hsla(0,0%,100%,0.015)" : "transparent",
                }}
              >
                <div className="flex items-center gap-3">
                  <Lock className="w-[14px] h-[14px] flex-none text-muted-foreground/40" strokeWidth={1.5} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="font-mono text-[10px] uppercase tracking-widest text-foreground/45">
                        {a.kind}
                      </span>
                      <span className="font-mono text-[8px] uppercase tracking-widest text-primary/60 border border-primary/25 px-1.5 py-0.5">
                        FRAME+
                      </span>
                    </div>
                    <div className="font-mono text-[8px] uppercase tracking-widest text-muted-foreground/35 mt-1.5">
                      {new Date(a.createdAt).toLocaleString(undefined, {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </div>
                  </div>
                </div>
              </button>
            );
          }
          return (
            <div
              key={a.id}
              className="relative group"
            >
              <button
                type="button"
                onClick={() => onOpen(a.id)}
                className="w-full text-left transition-all duration-200 px-4 py-3.5 pr-16"
                style={{
                  borderLeft: isBaseline ? "2px solid hsla(var(--primary)/0.7)" : "2px solid hsla(0,0%,100%,0.08)",
                  borderTop: "1px solid hsla(0,0%,100%,0.05)",
                  borderRight: "1px solid transparent",
                  borderBottom: "1px solid transparent",
                  background: isBaseline
                    ? "hsla(var(--primary)/0.06)"
                    : idx % 2 === 0 ? "hsla(0,0%,100%,0.015)" : "transparent",
                }}
                onMouseEnter={(e) => {
                  if (!isBaseline) {
                    (e.currentTarget as HTMLElement).style.borderLeftColor = "hsla(0,68%,46%,0.5)";
                    (e.currentTarget as HTMLElement).style.background = "hsla(0,68%,46%,0.04)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isBaseline) {
                    (e.currentTarget as HTMLElement).style.borderLeftColor = "hsla(0,0%,100%,0.08)";
                    (e.currentTarget as HTMLElement).style.background = idx % 2 === 0 ? "hsla(0,0%,100%,0.015)" : "transparent";
                  }
                }}
              >
                <div className="flex items-start gap-3">
                  <Film className="w-[14px] h-[14px] mt-0.5 flex-none" style={{ color: isBaseline ? "hsl(var(--primary))" : "hsla(0,68%,46%,0.55)" }} strokeWidth={1.5} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-3 mb-1">
                      <span className="font-mono text-[10px] uppercase tracking-widest text-foreground/80">
                        {a.kind}
                        {a.styleProfile ? <span className="text-muted-foreground/50"> · {a.styleProfile}</span> : null}
                        {isBaseline && (
                          <span className="ml-2 font-mono text-[8px] uppercase tracking-widest text-primary/70 border border-primary/30 px-1 py-0.5">
                            baseline
                          </span>
                        )}
                      </span>
                      <span className="flex items-baseline gap-2">
                        {(a.sessionScore ?? 0) > 0 && (
                          <span className="font-mono text-[12px] font-light text-foreground/90">{a.sessionScore}</span>
                        )}
                        {a.nervousSystemLoad != null && (
                          <span className={`font-mono text-[9px] uppercase tracking-widest ${LOAD_COLOR[a.nervousSystemLoad].split(" ")[0]}`}>
                            {LOAD_LABEL[a.nervousSystemLoad]}
                          </span>
                        )}
                      </span>
                    </div>
                    <p className="text-[0.78rem] text-foreground/55 leading-snug line-clamp-2">
                      {a.summary}
                    </p>
                    <div className="font-mono text-[8px] uppercase tracking-widest text-muted-foreground/35 mt-1.5">
                      {new Date(a.createdAt).toLocaleString(undefined, {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </div>
                  </div>
                </div>
              </button>

              {/* "Set as baseline" button — appears on hover */}
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onSetCompare(a.id); }}
                title={isBaseline ? "Clear baseline" : "Set as comparison baseline"}
                className={`absolute right-3 top-1/2 -translate-y-1/2 font-mono text-[8px] uppercase tracking-widest px-1.5 py-1 border transition-all duration-150 ${
                  isBaseline
                    ? "opacity-100 border-primary/40 text-primary/70 bg-primary/5 hover:bg-primary/10"
                    : "opacity-0 group-hover:opacity-100 border-border/40 text-muted-foreground/60 hover:border-primary/40 hover:text-primary/70"
                }`}
              >
                vs
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
