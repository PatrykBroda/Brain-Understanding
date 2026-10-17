import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, Upload, Film, Crosshair, X, Download, ArrowUpRight, ArrowDownRight, Minus, Link2, Lock, ScrollText } from "lucide-react";
import { toPng } from "html-to-image";
import {
  LineChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  YAxis,
} from "recharts";
import { WeeklyReportOverlay } from "@/components/weekly-report-overlay";
import { BottomNav } from "@/components/bottom-nav";
import { ModelUpdateCard } from "@/components/model-update-card";
import { FrameOctagon } from "@/components/frame-octagon";
import { FrameReportCard } from "@/components/frame-report-card";
import { OpponentReport, SavedOpponentReport } from "@/components/opponent-report";
import { useFighter } from "@/hooks/use-fighter";
import { useActiveCompetition } from "@/hooks/use-competition";
import {
  useAnalyses,
  useAnalysis,
  useOpponentAnalyses,
  useCreateAnalysis,
  useUpdateKeyframeNotes,
  useAnswerReview,
} from "@/hooks/use-analysis";
import {
  extractPoseFrames,
  captureKeyframe,
  disposeExtract,
  type ExtractResult,
  type PoseFrame,
} from "@/lib/pose";
import { computeMetrics } from "@/lib/analysis-metrics";
import { OPPONENT_COLOR, YOU_COLOR, encodePoseTrack } from "@/lib/pose-track";
import { detectTwoPeople, splitAthlete } from "@/lib/pose-people";
import { useIsDesktop } from "@/hooks/use-mobile";
import { scrubInsaneSkeletons, trackReliability } from "@/lib/pose-sanity";
import { PersonPicker, type PersonPickerData } from "@/components/person-picker";
import { Playback } from "@/lib/playback";
import { FootageBlock, useDecodedOpponent, useDecodedTrack } from "@/components/footage-player";
import { MovementGraphs } from "@/components/movement-graphs";
import { AnnotatedFindingFrame } from "@/components/annotated-finding";
import { PoseComparisons } from "@/components/pose-comparison";
import type { DecodedTrack } from "@/lib/pose-track";
import { useFramePlus, FramePlusPill } from "@/components/frame-plus-modal";
import { useSubscription } from "@/hooks/use-subscription";
import { api, ApiError, fetchRemoteVideo } from "@/lib/api";
import type {
  AnalysisKind,
  AnalysisKeyframe,
  AnalysisListItem,
  AnalysisModelUpdate,
  AnalysisSubject,
  DetectedEvent,
  NervousSystemLoad,
  OpponentListItem,
  ReplayMoment,
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
  low: "text-[#E6D2A3] border-emerald-300/40",
  moderate: "text-[#C7A15A] border-primary/40",
  elevated: "text-[#C7A15A] border-[#C7A15A]/40",
  high: "text-[#E0564E] border-[#E0564E]/40",
};

type Phase =
  | { stage: "idle" }
  | { stage: "fetching" }
  | { stage: "reading"; pct: number }
  | { stage: "tracking"; pct: number }
  | { stage: "detecting" }
  | { stage: "pick" } // two people in the clip: waiting for "which one is you?"
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
  const opponentAnalyses = useOpponentAnalyses();
  const activeCompetition = useActiveCompetition();
  const create = useCreateAnalysis();
  const { status: billingStatus } = useSubscription();
  const { openUpgrade } = useFramePlus();
  // Client convenience gate only fires on a KNOWN free plan — if billing
  // status is unavailable, let the request through; the server 402 is the
  // authority and the catch blocks map it to the upgrade modal.
  const knownFree = billingStatus?.plan === "free";
  const fileRef = useRef<HTMLInputElement>(null);
  const mobileScrollRef = useRef<HTMLElement>(null);
  const desktopRightScrollRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  // One shared clock for the desktop workstation (video/ghost on the left, graphs
  // on the right). The phone Report keeps its own, so the two layouts never fight.
  const desktopPlayback = useMemo(() => new Playback(), []);
  // Mount only the layout that is showing (see useIsDesktop): both used to be mounted and CSS-hidden.
  const isDesktop = useIsDesktop();

  const [kind, setKind] = useState<AnalysisKind>("sparring");
  const [focus, setFocus] = useState("");
  // Opponent Mode: "self" reads score the athlete; "opponent" builds a categorical
  // scout + a matchup against the athlete's recorded model. Kept clearly distinct.
  const [subject, setSubject] = useState<AnalysisSubject>("self");
  const [opponentName, setOpponentName] = useState("");
  const [openOpponentId, setOpenOpponentId] = useState<number | null>(null);

  // Prefill the scout's opponent name from the active camp's opponent, if any —
  // but never clobber something the athlete has already typed.
  const campOpponent = activeCompetition.data?.competition?.opponent?.trim() ?? "";
  useEffect(() => {
    if (campOpponent) setOpponentName((prev) => prev || campOpponent);
  }, [campOpponent]);

  const [reportVisible, setReportVisible] = useState(true);
  const [weeklyReportOpen, setWeeklyReportOpen] = useState(false);

  function onSelectSession(id: number) {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      clearResult();
      setOpenId(id);
      setOpenOpponentId(null);
      mobileScrollRef.current?.scrollTo({ top: 0, behavior: "instant" });
      desktopRightScrollRef.current?.scrollTo({ top: 0, behavior: "instant" });
      return;
    }
    setReportVisible(false);
    setTimeout(() => {
      clearResult();
      setOpenId(id);
      setOpenOpponentId(null);
      mobileScrollRef.current?.scrollTo({ top: 0, behavior: "instant" });
      desktopRightScrollRef.current?.scrollTo({ top: 0, behavior: "instant" });
      requestAnimationFrame(() => setReportVisible(true));
    }, 150);
  }
  const [phase, setPhase] = useState<Phase>({ stage: "idle" });
  const [result, setResult] = useState<VideoAnalysis | null>(null);
  // "Athlete Model Updated" — only present right after a NEW analysis; the
  // server computes it from real DB writes, so it never renders for saved reports.
  const [modelUpdate, setModelUpdate] = useState<AnalysisModelUpdate | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);
  const [compareId, setCompareId] = useState<number | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  // Set when the tracker was not reliable enough to draw a skeleton for the fresh upload.
  const [trackNote, setTrackNote] = useState<string | null>(null);
  const [sourceMode, setSourceMode] = useState<"upload" | "link">("upload");
  const [linkUrl, setLinkUrl] = useState("");
  const pendingFile = useRef<File | null>(null);
  const lastLink = useRef<string | null>(null);
  const videoUrlRef = useRef<string | null>(null);
  // "Which one is you?" - the picker data plus the resolver the analysis run awaits.
  const [pickData, setPickData] = useState<PersonPickerData | null>(null);
  const pickResolve = useRef<((choice: 0 | 1 | null) => void) | null>(null);

  function answerPick(choice: 0 | 1 | null) {
    const resolve = pickResolve.current;
    pickResolve.current = null;
    setPickData(null);
    resolve?.(choice);
  }

  // Revoke any outstanding blob URL when the component unmounts
  useEffect(() => {
    return () => {
      if (videoUrlRef.current) URL.revokeObjectURL(videoUrlRef.current);
      // Leaving mid-question: release the run (it disposes the video on the way out).
      pickResolve.current?.(null);
      pickResolve.current = null;
    };
  }, []);

  // The upload form is taller than a phone screen and the error renders under it: after the
  // progress overlay closes the user would be looking at an unchanged form with no sign anything
  // went wrong. Bring the error into view.
  useEffect(() => {
    if (phase.stage !== "error") return;
    const id = requestAnimationFrame(() => {
      document.querySelector('[data-testid="analyse-error"]')?.scrollIntoView({ block: "center", behavior: "smooth" });
    });
    return () => cancelAnimationFrame(id);
  }, [phase.stage]);

  const busy = phase.stage !== "idle" && phase.stage !== "error";
  const danger = result?.fragmentationRisk === "high" || result?.nervousSystemLoad === "high";
  // Retry is offered when there's something to retry: a picked file, or a link
  // that failed to fetch (which leaves no File behind).
  const canRetry =
    phase.stage === "error" &&
    phase.retryable &&
    (!!pendingFile.current || (sourceMode === "link" && !!lastLink.current));

  async function runAnalysis(file: File) {
    // Prompt before expensive on-device pose work; server enforces the same
    // gate for every new analysis.
    const opponentMode = subject === "opponent";
    if (knownFree) {
      openUpgrade(opponentMode ? "opponent_analysis" : "video_analysis");
      return;
    }
    setResult(null);
    setModelUpdate(null);
    setTrackNote(null);
    setOpenId(null);
    setOpenOpponentId(null);
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
      const consent = await api.getAiConsent();
      if (!consent.accepted) {
        queryClient.setQueryData(["ai-consent"], consent);
        return;
      }
      setPhase({ stage: "reading", pct: 0 });
      extract = await extractPoseFrames(file, (p) => {
        const pct = p.total ? Math.round((p.done / p.total) * 100) : 0;
        if (p.stage === "loading") setPhase({ stage: "reading", pct: 0 });
        else setPhase({ stage: "tracking", pct });
      });

      setPhase({ stage: "detecting" });

      // Two people in the clip? Ask who is the athlete BEFORE anything is scored.
      // Single-person clips (and opponent scouts) skip this and behave as before.
      let athleteFrames = extract.frames;
      let opponentFrames: PoseFrame[] | null = null;
      // A scout upload asks too ("who are you scouting?") - otherwise a two-person clip would
      // silently scout whoever the tracker happened to rank first.
      const two = detectTwoPeople(extract.people, extract.width, extract.height);
      if (two) {
        const shot = await captureKeyframe(extract, {
          timestamp: extract.people[0]![two.pickerFrame]!.timestamp,
          landmarks: null,
        });
        const a = extract.people[0]![two.pickerFrame]!.landmarks;
        const b = extract.people[1]![two.pickerFrame]!.landmarks;
        let choice: 0 | 1 = 0; // no usable still -> fall back to the suggestion rather than blocking
        if (shot && a && b) {
          const picked = await new Promise<0 | 1 | null>((resolve) => {
            pickResolve.current = resolve;
            setPickData({
              image: shot,
              aspect: extract!.width / extract!.height,
              people: [{ landmarks: a }, { landmarks: b }],
            });
            setPhase({ stage: "pick" });
          });
          if (picked === null) {
            setPhase({ stage: "idle" });
            return;
          }
          choice = picked;
          setPhase({ stage: "detecting" });
        }
        const split = splitAthlete(extract.people, choice);
        athleteFrames = split.athlete;
        // A scout is categorical about ONE person: the other fighter is not stored as "opponent".
        opponentFrames = opponentMode ? null : split.opponent;
      }

      // Never draw or score a skeleton that cannot be a body (folded/twisted, limbs far too long):
      // those frames become "no lock". Then judge the clip as a whole: if the tracker was not
      // reliable, the read is kept but no skeleton visuals are built or shown.
      const scrub = scrubInsaneSkeletons(athleteFrames, extract.width, extract.height);
      athleteFrames = scrub.frames;
      if (opponentFrames) opponentFrames = scrubInsaneSkeletons(opponentFrames, extract.width, extract.height).frames;
      const reliability = trackReliability(athleteFrames, extract.width, extract.height, scrub);

      const metrics = computeMetrics(athleteFrames);

      if (metrics.poseFrames < 3) {
        throw new Error(
          "couldn't get a reliable body lock in this clip. Ground work, close-ups and heavy overlap confuse the tracker - try a wider, steadier shot with the athlete clearly in frame",
        );
      }

      const keyframes: AnalysisKeyframe[] = [];
      for (const m of metrics.keyMoments) {
        const fi = athleteFrames.findIndex((f) => Math.abs(f.timestamp - m.timestamp) < 0.001);
        const frame = athleteFrames[fi];
        if (!frame) continue;
        // With an opponent in the clip the still shows you in blue and them in red.
        const img = await captureKeyframe(
          extract,
          frame,
          520,
          opponentFrames
            ? { youColor: YOU_COLOR, opponent: opponentFrames[fi]?.landmarks ?? null, opponentColor: OPPONENT_COLOR }
            : undefined,
        );
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
        // A scout is categorical — never a scorecard. Send no composite / no
        // scores for opponent reads; the server also zeroes these server-side.
        sessionScore: opponentMode ? 0 : metrics.sessionScore,
        durationSec: extract.durationSec,
        framesAnalysed: metrics.framesAnalysed,
        poseFrames: metrics.poseFrames,
        signals: metrics.signals,
        scores: opponentMode ? [] : metrics.scores,
        detectedEvents,
        keyframes,
        // Per-frame landmarks (quantised) for overlay/graphs/annotations/comparisons.
        // null when too few frames locked or it would exceed the size cap.
        poseTrack:
          reliability.level === "good" ? encodePoseTrack(athleteFrames, extract.width, extract.height, opponentFrames) : null,
        ...(opponentMode
          ? { subject: "opponent" as const, opponentName: opponentName.trim() }
          : {}),
      });
      setResult(res.analysis);
      setModelUpdate(res.modelUpdate ?? null);
      setTrackNote(
        reliability.level === "good"
          ? null
          : `Skeleton, graphs and comparisons are off for this clip: ${reliability.reasons.join("; ")}. The read below only uses the ${metrics.poseFrames} frames where a body was found.`,
      );
      setPhase({ stage: "idle" });
      // Create a blob URL for the desktop video player — revoke the previous one first
      if (pendingFile.current) {
        if (videoUrlRef.current) URL.revokeObjectURL(videoUrlRef.current);
        const url = URL.createObjectURL(pendingFile.current);
        videoUrlRef.current = url;
        setVideoUrl(url);
      }
    } catch (err) {
      if (err instanceof ApiError && err.kind === "consent") {
        queryClient.invalidateQueries({ queryKey: ["ai-consent"] });
        setPhase({ stage: "idle" });
      } else if (err instanceof ApiError && err.kind === "upgrade_required") {
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
    const opponentMode = subject === "opponent";
    if (knownFree) {
      openUpgrade(opponentMode ? "opponent_analysis" : "video_analysis");
      return;
    }
    lastLink.current = trimmed;
    pendingFile.current = null;
    setResult(null);
    setModelUpdate(null);
    setOpenId(null);
    setOpenOpponentId(null);
    setPhase({ stage: "fetching" });
    let file: File;
    try {
      file = await fetchRemoteVideo(trimmed);
    } catch (err) {
      if (err instanceof ApiError && err.kind === "consent") {
        queryClient.invalidateQueries({ queryKey: ["ai-consent"] });
        setPhase({ stage: "idle" });
        return;
      }
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
    setTrackNote(null);
    setModelUpdate(null);
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

  // Opponent reads live in the same `result`/list surface but render a distinct,
  // score-free scout. Split them out so self and opponent never blur together.
  const opponentResult =
    result != null && result.subject === "opponent" ? result : null;
  const selfResult =
    result != null && result.subject !== "opponent" ? result : null;
  const showingOpponent = opponentResult != null || openOpponentId != null;
  const showingReport = selfResult != null || openId != null;

  return (
    <div className="flex flex-col h-[100dvh] text-foreground">
      <header className="flex-none flex items-center justify-between px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-3">
        <div className="flex-1 flex justify-start">
          <Link href="/home" className="icon-round text-muted-foreground hover:text-foreground transition-colors">
            <ChevronLeft className="w-5 h-5" strokeWidth={1.5} />
          </Link>
        </div>
        <h1 className="display-heading text-center">Analyse</h1>
        <div className="flex-1 flex justify-end">
          <FramePlusPill />
        </div>
      </header>

      {/* ------------------------------------------------------------------ */}
      {/* MOBILE layout — stacked, single scroll column                       */}
      {/* ------------------------------------------------------------------ */}
      {!isDesktop && (
      <main ref={mobileScrollRef} className="flex-1 min-h-0 overflow-y-auto md:hidden">
        <div className="max-w-md mx-auto px-5 py-6 space-y-6 pb-10">
          {opponentResult ? (
            <div className="space-y-6" style={{ opacity: reportVisible ? 1 : 0, transition: "opacity 150ms ease" }}>
              <OpponentReport analysis={opponentResult} fighter={fighter} onClose={clearResult} />
            </div>
          ) : openOpponentId != null ? (
            <div style={{ opacity: reportVisible ? 1 : 0, transition: "opacity 150ms ease" }}>
              <SavedOpponentReport id={openOpponentId} fighter={fighter} onClose={() => setOpenOpponentId(null)} />
            </div>
          ) : selfResult ? (
            <div className="space-y-6" style={{ opacity: reportVisible ? 1 : 0, transition: "opacity 150ms ease" }}>
              <Report analysis={selfResult} fighter={fighter} videoUrl={videoUrl} trackNote={trackNote} onClose={clearResult} onSelectSession={onSelectSession} />
              {modelUpdate && <ModelUpdateCard update={modelUpdate} />}
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
              subject={subject}
              setSubject={setSubject}
              opponentName={opponentName}
              setOpponentName={setOpponentName}
              opponentItems={opponentAnalyses.data?.opponents ?? []}
              opponentLoading={opponentAnalyses.isLoading}
              onOpenOpponent={(id) => setOpenOpponentId(id)}
            />
          )}
          {!result && openId == null && openOpponentId == null && (
            <>
              <button
                type="button"
                onClick={() => setWeeklyReportOpen(true)}
                className="w-full inline-flex items-center justify-center gap-2 btn-quiet btn-quiet-gold"
              >
                <ScrollText className="w-3.5 h-3.5" strokeWidth={1.5} />
                Weekly intelligence report
              </button>
            </>
          )}
        </div>
      </main>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* DESKTOP workstation layout — two panels, side by side               */}
      {/* ------------------------------------------------------------------ */}
      {isDesktop && (
      <main className="flex-1 min-h-0 hidden md:flex divide-x divide-border/30">
        {showingOpponent ? (
          <div
            className="flex-1 overflow-y-auto px-7 py-8"
            style={{ opacity: reportVisible ? 1 : 0, transition: "opacity 150ms ease" }}
          >
            <div className="max-w-2xl mx-auto">
              {opponentResult ? (
                <OpponentReport analysis={opponentResult} fighter={fighter} onClose={clearResult} />
              ) : openOpponentId != null ? (
                <SavedOpponentReport
                  id={openOpponentId}
                  fighter={fighter}
                  onClose={() => setOpenOpponentId(null)}
                />
              ) : null}
            </div>
          </div>
        ) : showingReport ? (
          <>
            {/* LEFT — video player + filmstrip */}
            <div className="flex flex-col w-[46%] min-w-0 overflow-y-auto bg-white/[0.025]" style={{ opacity: reportVisible ? 1 : 0, transition: "opacity 150ms ease" }}>
              {result ? (
                <WorkstationLeft
                  analysis={result}
                  videoUrl={videoUrl}
                  trackNote={trackNote}
                  playback={desktopPlayback}
                  onClose={clearResult}
                />
              ) : openId != null ? (
                <SavedWorkstationLeft id={openId} playback={desktopPlayback} onClose={() => setOpenId(null)} />
              ) : null}
            </div>

            {/* RIGHT — FRAME REPORT card + findings + scores */}
            <div ref={desktopRightScrollRef} className="flex-1 overflow-y-auto px-7 py-6" style={{ opacity: reportVisible ? 1 : 0, transition: "opacity 150ms ease" }}>
              {result ? (
                <div className="space-y-6">
                  <WorkstationRight analysis={result} fighter={fighter} playback={desktopPlayback} onClose={clearResult} onSelectSession={onSelectSession} />
                  {modelUpdate && <ModelUpdateCard update={modelUpdate} />}
                </div>
              ) : openId != null ? (
                <SavedWorkstationRight id={openId} compareId={compareId} fighter={fighter} playback={desktopPlayback} onClose={() => setOpenId(null)} onSelectSession={onSelectSession} />
              ) : null}
            </div>
          </>
        ) : (
          <>
            {/* LEFT — description + upload zone */}
            <div className="flex flex-col justify-center items-center w-[46%] min-w-0 px-10 py-10 gap-8">
              <div className="w-full max-w-sm space-y-3">
                <div className="glass p-5">
                  <div
                    className="eyebrow eyebrow-gold mb-2"
                  >
                    {subject === "opponent" ? "Opponent scout" : "Analyst Workstation"}
                  </div>
                  <p className="text-sm text-foreground/75 leading-relaxed">
                    {subject === "opponent"
                      ? "Upload footage of your opponent. The system reads their movement — guard, base, output rhythm — builds a categorical scouting model, and contrasts it against your own recorded model for the matchup."
                      : "Upload a clip. The system reads your movement directly — guard, base, shoulders, output rhythm — scores it against itself, and tells you what your nervous system is doing under load."}
                  </p>
                  <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground/90 mt-2">
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
                    className="dropzone w-full transition-all duration-300 disabled:opacity-50 py-16 flex flex-col items-center justify-center gap-4"
>
<span className="dz-icon"><Upload className="w-6 h-6" strokeWidth={1.25} /></span>
                    <div className="font-mono text-[11px] uppercase tracking-[0.16em] text-foreground/80">
                      Drop footage
                    </div>
                    <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground/90">
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
              <SubjectToggle subject={subject} setSubject={setSubject} disabled={busy} />
              {subject === "opponent" && (
                <section className="space-y-2">
                  <div className="eyebrow">
                    Opponent name{" "}
                    <span className="font-sans normal-case tracking-normal text-muted-foreground/90 text-[11px]">optional</span>
                  </div>
                  <input
                    type="text"
                    value={opponentName}
                    onChange={(e) => setOpponentName(e.target.value.slice(0, 80))}
                    disabled={busy}
                    placeholder="who are you scouting?"
                    className="field-glass !min-h-[48px] !py-0 !text-sm placeholder:text-muted-foreground disabled:opacity-40"
                  />
                </section>
              )}
              <section className="space-y-2">
                <div className="eyebrow">
                  Clip type
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {KINDS.map((k) => (
                    <button
                      key={k.value}
                      type="button"
                      onClick={() => setKind(k.value)}
                      disabled={busy}
                      className="pill !px-2 disabled:opacity-40" data-active={kind === k.value}
>
                      {k.label}
                    </button>
                  ))}
                </div>
              </section>

              <section className="space-y-2">
                <div className="eyebrow">
                  Anything to focus on{" "}
                  <span className="text-muted-foreground/90 normal-case tracking-normal">(optional)</span>
                </div>
                <input
                  type="text"
                  value={focus}
                  onChange={(e) => setFocus(e.target.value.slice(0, 200))}
                  disabled={busy}
                  placeholder="e.g. my guard when I get tired, left-side pressure…"
                  className="field-glass !min-h-[48px] !py-0 !text-sm placeholder:text-muted-foreground disabled:opacity-40"
                />
                <FocusPresets focus={focus} setFocus={setFocus} disabled={busy} />
              </section>

              {phase.stage === "error" && (
                <div data-testid="analyse-error" role="alert" className="glass glass-red !rounded-2xl px-4 py-3 space-y-2">
                  <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-destructive/90">
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
                      className="mt-1 font-mono text-[10px] uppercase tracking-[0.14em] border border-destructive/50 text-destructive/90 hover:bg-destructive/15 transition-colors px-3 py-1.5 rounded-2xl"
                    >
                      Retry
                    </button>
                  )}
                </div>
              )}

              {subject === "opponent" ? (
                <OpponentHistory
                  items={opponentAnalyses.data?.opponents ?? []}
                  loading={opponentAnalyses.isLoading}
                  onOpen={(id) => setOpenOpponentId(id)}
                />
              ) : (
                <History
                  items={analyses.data?.analyses ?? []}
                  loading={analyses.isLoading}
                  onOpen={(id) => setOpenId(id)}
                  compareId={compareId}
                  onSetCompare={(id) => setCompareId((prev) => (prev === id ? null : id))}
                />
              )}

              <button
                type="button"
                onClick={() => setWeeklyReportOpen(true)}
                className="w-full inline-flex items-center justify-center gap-2 btn-quiet btn-quiet-gold"
              >
                <ScrollText className="w-3.5 h-3.5" strokeWidth={1.5} />
                Weekly intelligence report
              </button>
            </div>
          </>
        )}
      </main>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={onPick}
      />

      {!new URLSearchParams(window.location.search).has("frameMobile") && <BottomNav />}

      <WeeklyReportOverlay open={weeklyReportOpen} onClose={() => setWeeklyReportOpen(false)} />

      {busy && phase.stage !== "pick" && (
        <CinematicOverlay phase={phase} kindLabel={KINDS.find((k) => k.value === kind)?.label ?? ""} />
      )}
      {phase.stage === "pick" && pickData && (
        <PersonPicker
          data={pickData}
          mode={subject === "opponent" ? "scout" : "athlete"}
          onPick={answerPick}
          onCancel={() => answerPick(null)}
        />
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
    <div className="flex flex-wrap gap-2">
      {FOCUS_PRESETS.map((p) => {
        const active = current === p.value;
        return (
          <button
            key={p.label}
            type="button"
            onClick={() => setFocus(p.value)}
            disabled={disabled}
            className="pill !min-h-9 !px-3.5 disabled:opacity-40" data-active={active}
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
    <div className="grid grid-cols-2 gap-2">
      {opts.map((o) => {
        const active = mode === o.value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => setMode(o.value)}
            disabled={disabled}
            className="pill !px-2 disabled:opacity-40" data-active={active}
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
      <div className="dropzone flex flex-col gap-4 p-5" style={{ borderStyle: "solid" }}>
<div className="flex items-center gap-2.5">
          <Link2 className="w-4 h-4 flex-none text-primary-light" strokeWidth={1.5} />
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
            className="field-glass flex-1 min-w-0 !min-h-[44px] !py-0 !text-sm placeholder:text-muted-foreground disabled:opacity-40"
          />
        </div>
        <button
          type="button"
          onClick={onSubmit}
          disabled={disabled || !value.trim()}
          className="btn-quiet btn-quiet-gold w-full disabled:opacity-40"
>
          Fetch and analyse
        </button>
      </div>
      <p className="font-mono text-[10px] leading-relaxed tracking-wide text-muted-foreground/90">
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
  subject,
  setSubject,
  opponentName,
  setOpponentName,
  opponentItems,
  opponentLoading,
  onOpenOpponent,
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
  subject: AnalysisSubject;
  setSubject: (s: AnalysisSubject) => void;
  opponentName: string;
  setOpponentName: (v: string) => void;
  opponentItems: OpponentListItem[];
  opponentLoading: boolean;
  onOpenOpponent: (id: number) => void;
}) {
  return (
    <>
      <SubjectToggle subject={subject} setSubject={setSubject} disabled={busy} />

      {/* Atmospheric intro block */}
      <section
        className="glass relative p-5"
        >
        <div
          className="eyebrow eyebrow-gold mb-2"
        >
          {subject === "opponent" ? "Opponent scout" : "Movement read"}
        </div>
        <p className="text-sm text-foreground/75 leading-relaxed">
          {subject === "opponent"
            ? "Upload footage of your opponent. The system builds a categorical scouting model and contrasts it against your own recorded model for the matchup."
            : "Upload a clip. The system reads your movement directly — guard, base, shoulders, output rhythm — scores it against itself, and tells you what your nervous system is doing under load."}
        </p>
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground/90 mt-2">
          Processed on device · only the read is kept
        </p>
      </section>

      {subject === "opponent" && (
        <section className="space-y-2">
          <div className="eyebrow">
            Opponent name{" "}
            <span className="font-sans normal-case tracking-normal text-muted-foreground/90 text-[11px]">optional</span>
          </div>
          <input
            type="text"
            value={opponentName}
            onChange={(e) => setOpponentName(e.target.value.slice(0, 80))}
            disabled={busy}
            placeholder="who are you scouting?"
            className="field-glass !min-h-[48px] !py-0 !text-sm placeholder:text-muted-foreground disabled:opacity-40"
          />
        </section>
      )}

      {/* Clip type selector */}
      <section className="space-y-2">
        <div className="eyebrow">
          Clip type
        </div>
        <div className="grid grid-cols-3 gap-2">
          {KINDS.map((k) => (
            <button
              key={k.value}
              type="button"
              onClick={() => setKind(k.value)}
              disabled={busy}
              className="pill !px-2 disabled:opacity-40" data-active={kind === k.value}
>
              {k.label}
            </button>
          ))}
        </div>
      </section>

      {/* Focus input */}
      <section className="space-y-2">
        <div className="eyebrow">
          Focus area{" "}
          <span className="font-sans normal-case tracking-normal text-muted-foreground/90 text-[11px]">optional</span>
        </div>
        <input
          type="text"
          value={focus}
          onChange={(e) => setFocus(e.target.value.slice(0, 200))}
          disabled={busy}
          placeholder="guard under fatigue, left shoulder, pressure after a miss…"
          className="field-glass !min-h-[48px] !py-0 !text-sm placeholder:text-muted-foreground disabled:opacity-40"
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
            className="dropzone w-full transition-all duration-300 disabled:opacity-50 py-12 flex flex-col items-center justify-center gap-4"
><span className="dz-icon"><Upload className="w-6 h-6" strokeWidth={1.25} /></span>
            <div className="font-mono text-[11px] uppercase tracking-[0.16em] text-foreground/80">
              Drop footage
            </div>
            <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground/90">
              mp4 · mov · first 75s processed
            </div>
          </button>
        ) : (
          <LinkInput value={linkUrl} onChange={setLinkUrl} onSubmit={onSubmitLink} disabled={busy} />
        )}
      </section>

      {phase.stage === "error" && (
        <div data-testid="analyse-error" role="alert" className="glass glass-red !rounded-2xl px-4 py-3 space-y-2">
          <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-destructive/90">
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
              className="mt-1 font-mono text-[10px] uppercase tracking-[0.14em] border border-destructive/50 text-destructive/90 hover:bg-destructive/15 transition-colors px-3 py-1.5 rounded-2xl"
            >
              Retry
            </button>
          )}
        </div>
      )}

      {subject === "opponent" ? (
        <OpponentHistory items={opponentItems} loading={opponentLoading} onOpen={onOpenOpponent} />
      ) : (
        <History
          items={analyses}
          loading={analysesLoading}
          onOpen={onOpen}
          compareId={compareId}
          onSetCompare={onSetCompare}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Desktop workstation panels
// ---------------------------------------------------------------------------

function WorkstationLeft({
  analysis,
  videoUrl,
  trackNote = null,
  playback,
  onClose,
}: {
  analysis: VideoAnalysis;
  videoUrl: string | null;
  trackNote?: string | null;
  playback: Playback;
  onClose: () => void;
}) {
  const [activeKf, setActiveKf] = useState(0);
  const [localNotes, setLocalNotes] = useState<Record<number, string>>(analysis.keyframeNotes ?? {});
  const updateNotes = useUpdateKeyframeNotes(analysis.id);
  const kf = analysis.keyframes[activeKf];
  const track = useDecodedTrack(analysis.poseTrack);
  const opponent = useDecodedOpponent(analysis.poseTrack);
  // Footage (video or ghost) is available when there's a video or a track.
  const hasFootage = !!videoUrl || !!track;

  // New report -> clock back to 0.
  useEffect(() => {
    playback.reset(analysis.durationSec);
  }, [playback, analysis.id, analysis.durationSec]);

  function seekTo(ts: number, idx: number) {
    setActiveKf(idx);
    playback.seek(ts);
  }

  function commitNote(notes: Record<number, string>) {
    void updateNotes.mutate(notes);
  }

  return (
    <div className="flex flex-col h-full">
      {/* meta bar */}
      <div className="flex-none flex items-center justify-between px-5 py-3 border-b border-border/30 bg-white/[0.025]">
        <div className="eyebrow">
          {analysis.kind} · {analysis.durationSec.toFixed(0)}s read
          {analysis.focus && (
            <span className="ml-2 normal-case tracking-normal text-muted-foreground">
              · {analysis.focus}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="New analysis"
          className="icon-round flex-none text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="w-4 h-4" strokeWidth={1.5} />
        </button>
      </div>

      {/* main area — video player when available, keyframe fallback for saved reports */}
      <div className="flex-1 min-h-0 flex flex-col bg-black">
        {hasFootage ? (
          <div className="flex-1 min-h-0 overflow-y-auto p-3">
            <FootageBlock
              videoUrl={videoUrl}
              trackNote={trackNote}
              track={track}
              opponent={opponent}
              events={analysis.detectedEvents ?? []}
              moments={analysis.replayMoments ?? []}
              durationSec={analysis.durationSec}
              playback={playback}
              videoClassName="w-full border border-border/30 object-contain bg-black"
              videoStyle={{ maxHeight: "60vh" }}
            />
          </div>
        ) : (
          <div className="flex-1 min-h-0 flex items-center justify-center p-4 bg-white/[0.025]">
            {kf ? (
              <figure className="w-full space-y-2">
                <img
                  src={kf.imageBase64}
                  alt={kf.caption}
                  className="w-full border border-border/40 object-contain max-h-[50vh] rounded-2xl"
                />
                <figcaption className="eyebrow px-1">
                  {kf.timestamp.toFixed(1)}s · {kf.caption}
                </figcaption>
                {localNotes[activeKf] && (
                  <div className="font-mono text-[10px] text-[#C7A15A] px-1 leading-snug">
                    {localNotes[activeKf]}
                  </div>
                )}
              </figure>
            ) : (
              <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground/90">
                No keyframes
              </div>
            )}
          </div>
        )}
      </div>

      {/* filmstrip — click to seek + annotate */}
      {analysis.keyframes.length > 0 && (
        <div className="flex-none border-t border-border/30 bg-white/[0.025] px-4 py-3 space-y-2">
          <div className="eyebrow">
            Detected events
            {hasFootage && (
              <span className="ml-2 normal-case tracking-normal text-muted-foreground/90">
                · click to seek · click again to annotate
              </span>
            )}
            {!hasFootage && (
              <span className="ml-2 normal-case tracking-normal text-muted-foreground/90">
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
                className={`flex-none flex flex-col overflow-hidden rounded-xl border transition-colors ${
                  i === activeKf ? "border-primary/70" : "border-border/40 hover:border-primary/40"
                }`}
                style={{ width: 88 }}
                title={`${k.timestamp.toFixed(1)}s — ${k.caption}`}
              >
                <img src={k.imageBase64} alt={k.caption} className="w-full" />
                <div className="eyebrow px-1 py-1 truncate bg-white/[0.025]">
                  {k.timestamp.toFixed(1)}s
                </div>
                <div className="eyebrow px-1 pb-1 truncate">
                  {k.caption}
                </div>
                {localNotes[i] && (
                  <div className="font-mono text-[10px] text-[#C7A15A] px-1 pb-1 truncate leading-tight border-t border-border/20 pt-0.5">
                    {localNotes[i]}
                  </div>
                )}
              </button>
            ))}
          </div>
          {/* inline note editor for the active keyframe */}
          <div className="flex items-center gap-2 pt-1">
            <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground/90 flex-none">
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
              className="field-glass flex-1 !min-h-[44px] !py-0 !text-xs placeholder:text-muted-foreground"
            />
          </div>
        </div>
      )}

      {/* FRAME Replay — curated moments, click to seek the footage */}
      {analysis.replayMoments.length > 0 && (
        <div className="flex-none border-t border-border/30 bg-white/[0.025] px-4 py-3 max-h-[42%] overflow-y-auto">
          <ReplaySection analysis={analysis} onSeek={seekTo} />
        </div>
      )}
    </div>
  );
}

function WorkstationRight({
  analysis,
  fighter,
  playback,
  baselineId = null,
  onClose,
  onSelectSession,
}: {
  analysis: VideoAnalysis;
  fighter: Fighter | null;
  playback: Playback;
  baselineId?: number | null;
  onClose: () => void;
  onSelectSession?: (id: number) => void;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [saving, setSaving] = useState(false);
  const { data: analysesData } = useAnalyses();
  const track = useDecodedTrack(analysis.poseTrack);

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
          className="inline-flex items-center gap-2 disabled:opacity-50 btn-quiet"
        >
          <Download className="w-3.5 h-3.5" strokeWidth={1.5} />
          {saving ? "Rendering…" : "Save card"}
        </button>
      </div>

      {/* summary */}
      <p className="glass glass-gold font-display not-italic text-[1.2rem] text-[#f1ede6] leading-snug p-5">
        {analysis.summary}
      </p>

      {/* FRAME asks one grounded question about this read */}
      <FeedbackCard analysis={analysis} />

      {/* findings table */}
      {analysis.findings.length > 0 && (
        <FindingsTable
          findings={analysis.findings}
          keyframes={analysis.keyframes}
          track={track}
          onJump={(ts) => playback.seek(ts)}
        />
      )}

      {/* movement graphs — per-frame series from the pose track, synced to playback */}
      {track && (
        <MovementGraphs
          track={track}
          events={analysis.detectedEvents ?? []}
          durationSec={analysis.durationSec}
          playback={playback}
        />
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

      {/* ghost comparisons: best vs worst rep, this vs last session (hidden without data) */}
      <PoseComparisons analysis={analysis} track={track} baselineId={baselineId} />

      {/* session-over-session trend chart — desktop only, needs 3+ sessions */}
      {(analysesData?.analyses?.length ?? 0) >= 3 && (
        <TrendSection analyses={analysesData!.analyses} currentId={analysis.id} />
      )}

      {/* score provenance */}
      <ScoreProvenance analysis={analysis} />

      <button
        type="button"
        onClick={onClose}
        className="w-full btn-quiet"
      >
        Analyse another
      </button>
    </div>
  );
}

function SavedWorkstationLeft({
  id,
  playback,
  onClose,
}: {
  id: number;
  playback: Playback;
  onClose: () => void;
}) {
  const { data, isLoading, isError } = useAnalysis(id);
  if (isLoading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 py-16">
        <FrameOctagon size={56} spin spinSeconds={4} glow={false} />
        <div className="eyebrow">
          Loading read
        </div>
      </div>
    );
  }
  if (isError || !data?.analysis) {
    return (
      <div className="p-6 space-y-4">
        <div className="glass glass-red !rounded-2xl px-3 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-destructive/90">
          could not load this read
        </div>
        <button type="button" onClick={onClose} className="w-full btn-quiet">
          Back
        </button>
      </div>
    );
  }
  return <WorkstationLeft analysis={data.analysis} videoUrl={null} playback={playback} onClose={onClose} />;
}

function SavedWorkstationRight({
  id,
  compareId,
  fighter,
  playback,
  onClose,
  onSelectSession,
}: {
  id: number;
  compareId: number | null;
  fighter: Fighter | null;
  playback: Playback;
  onClose: () => void;
  onSelectSession?: (id: number) => void;
}) {
  const { data, isLoading, isError } = useAnalysis(id, compareId);
  if (isLoading || isError || !data?.analysis) return null;
  return <WorkstationRight analysis={data.analysis} fighter={fighter} playback={playback} baselineId={compareId} onClose={onClose} onSelectSession={onSelectSession} />;
}

// ---------------------------------------------------------------------------
// Shared sub-components (used in both mobile Report and desktop Workstation)
// ---------------------------------------------------------------------------

function FindingsTable({
  findings,
  keyframes,
  track,
  onJump,
}: {
  findings: VideoAnalysis["findings"];
  keyframes?: AnalysisKeyframe[];
  track?: DecodedTrack | null;
  onJump?: (timestamp: number) => void;
}) {
  return (
    <section className="space-y-3">
      <div className="section-title">
        What the body is doing
      </div>
      <div className="glass glass-table w-full">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-border/40">
              <th className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground text-left px-3 py-2 w-[90px]">
                Area
              </th>
              <th className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground text-left px-3 py-2">
                Finding
              </th>
              <th className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground text-left px-3 py-2 w-[72px]">
                Signal
              </th>
            </tr>
          </thead>
          <tbody>
            {findings.map((f, i) => (
              <Fragment key={i}>
              <tr
                className="border-b border-border/30 last:border-0"
              >
                <td className="px-3 py-2.5 align-top">
                  <span
                    className={`font-mono text-[10px] uppercase tracking-[0.14em] px-2.5 py-0.5 border rounded-full inline-block ${
                      f.severity === "high"
                        ? "text-[#E0564E] border-[#E0564E]/40"
                        : f.severity === "medium"
                          ? "text-[#C7A15A] border-[#C7A15A]/40"
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
                    <div className="text-xs text-[#C7A15A] leading-relaxed italic">
                      {f.nervousSystemFraming}
                    </div>
                  )}
                </td>
                <td className="px-3 py-2.5 align-top">
                  <span
                    className={`font-mono text-[10px] uppercase tracking-[0.14em] ${
                      f.severity === "high"
                        ? "text-[#E0564E]"
                        : f.severity === "medium"
                          ? "text-[#C7A15A]"
                          : "text-muted-foreground"
                    }`}
                  >
                    {f.severity}
                  </span>
                </td>
              </tr>
              {keyframes && track && f.keyframeIndex != null && f.bodyRegion && (
                <tr className="border-b border-border/30 last:border-0">
                  <td colSpan={3} className="px-3 pb-3">
                    <AnnotatedFindingFrame finding={f} keyframes={keyframes} track={track} onJump={onJump} />
                  </td>
                </tr>
              )}
              </Fragment>
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
        <Minus className="w-3 h-3 text-muted-foreground/90 inline-block" strokeWidth={2} />
      </span>
    );
  }
  if (dir === "up") {
    return (
      <span title={`Improved — was: ${prevValue}`}>
        <ArrowUpRight className="w-3.5 h-3.5 text-[#E6D2A3] inline-block" strokeWidth={2} />
      </span>
    );
  }
  if (dir === "down") {
    return (
      <span title={`Declined — was: ${prevValue}`}>
        <ArrowDownRight className="w-3.5 h-3.5 text-[#E0564E] inline-block" strokeWidth={2} />
      </span>
    );
  }
  // changed but no known ordering
  return (
    <span
      className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground/90"
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
            ? "text-[#E6D2A3]"
            : dir === "down"
              ? "text-[#E0564E]"
              : "text-muted-foreground/90";
        const tappable = !isCurrent && step.id != null && onSelectSession != null;
        return (
          <span key={i} className="flex items-center gap-x-0.5">
            {i > 0 && (
              <span className={`font-mono text-[10px] leading-none select-none ${arrowColor}`}>›</span>
            )}
            {tappable ? (
              <button
                type="button"
                onClick={() => onSelectSession!(step.id!)}
                title="View this session's full read"
                className={`font-mono text-[10px] uppercase tracking-wider leading-none text-muted-foreground/90 underline decoration-dotted underline-offset-2 hover:text-foreground/70 active:text-foreground/90 transition-colors cursor-pointer`}
              >
                {step.value}
              </button>
            ) : (
              <span
                className={`font-mono text-[10px] uppercase tracking-wider leading-none ${
                  isCurrent ? "text-foreground/80" : "text-muted-foreground/90"
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
      <div className="flex items-baseline gap-3">
        <span className="section-title">
          Raw signals
        </span>
        {hasPrev && hasCustomCompare && (
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#C7A15A]">
            vs selected baseline
          </span>
        )}
      </div>
      <div className="glass glass-table w-full">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-border/40 bg-secondary/20">
              <th className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground text-left px-3 py-2 w-[130px]">
                Signal
              </th>
              <th className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground text-left px-3 py-2 w-[80px]">
                Value
              </th>
              {hasPrev && (
                <th className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground text-left px-3 py-2 w-[28px]" title={hasCustomCompare ? "Change vs selected baseline" : "Change vs previous session"}>
                  vs
                </th>
              )}
              <th className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground text-left px-3 py-2">
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
                    <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-foreground/80">
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
                        <div className="font-mono text-[10px] text-muted-foreground/90 mt-0.5 leading-snug">
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
                        <span className="font-mono text-[10px] text-muted-foreground/90">—</span>
                      )}
                    </td>
                  )}
                  <td className="px-3 py-2 align-top">
                    <span className="text-xs text-muted-foreground leading-relaxed">
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
      <div className="flex items-baseline gap-3">
        <span className="section-title">
          What changed
        </span>
        {isCustomBaseline && (
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#C7A15A]">
            vs selected baseline
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {comparison.deltas.map((d) => (
          <div
            key={d.key}
            className="flex items-center justify-between gap-2 border border-border/50 px-3 py-2 rounded-2xl"
          >
            <span className="eyebrow">
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
        <p className="text-sm text-[#C7A15A] leading-relaxed italic">
          {comparison.note}
        </p>
      )}
    </section>
  );
}

function ScoreProvenance({ analysis }: { analysis: VideoAnalysis }) {
  return (
    <section className="space-y-2 pt-1">
      <div className="eyebrow">
        How these scores were derived
      </div>
      <div className="space-y-1.5">
        {analysis.scores.map((s) => (
          <div key={s.key} className="font-mono text-[10px] tracking-wide" title={s.basis}>
            <span className="uppercase tracking-[0.14em] text-foreground/85">
              {s.label} {s.value}
            </span>
            <span className="text-muted-foreground"> — {s.basis}</span>
          </div>
        ))}
      </div>
      <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground/90 pt-2 leading-relaxed">
        {analysis.metrics.poseFrames} of {analysis.metrics.framesAnalysed} frames locked a pose ·
        every number derived from measured movement, never invented
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// FRAME Replay — up to three curated moments, each tied to a real keyframe
// ---------------------------------------------------------------------------

const REPLAY_ROLE_META: Record<ReplayMoment["role"], { label: string; accent: string }> = {
  best_decision: { label: "Best decision", accent: "text-[#E6D2A3] border-[#E6D2A3]/40" },
  worst_habit: { label: "Worst habit", accent: "text-destructive/90 border-destructive/40" },
  biggest_opportunity: {
    label: "Biggest opportunity",
    accent: "text-[#C7A15A] border-primary/40",
  },
};

function ReplayMomentRow({
  moment,
  keyframe,
  index,
  onSeek,
}: {
  moment: ReplayMoment;
  keyframe: AnalysisKeyframe | null;
  index: number;
  onSeek?: (ts: number, idx: number) => void;
}) {
  const meta = REPLAY_ROLE_META[moment.role];
  const seekable = !!onSeek && index >= 0;
  const inner = (
    <>
      {keyframe && (
        <img
          src={keyframe.imageBase64}
          alt={keyframe.caption}
          className="flex-none w-20 h-14 object-cover rounded-xl border border-white/10"
        />
      )}
      <div className="flex-1 min-w-0 space-y-1">
        <div
          className={`inline-block font-mono text-[10px] uppercase tracking-[0.14em] border rounded-full px-2.5 py-0.5 ${meta.accent}`}
        >
          {meta.label}
        </div>
        <div className="eyebrow">
          {moment.timestamp.toFixed(1)}s{moment.label ? ` · ${moment.label}` : ""}
        </div>
        <p className="text-[0.85rem] text-foreground/90 leading-snug">{moment.note}</p>
      </div>
    </>
  );
  if (seekable) {
    return (
      <button
        type="button"
        onClick={() => onSeek!(moment.timestamp, index)}
        className="glass w-full flex gap-3 items-stretch text-left p-2.5 transition-colors hover:border-primary/40"
      >
        {inner}
      </button>
    );
  }
  return (
    <div className="glass w-full flex gap-3 items-stretch text-left p-2.5">
      {inner}
    </div>
  );
}

function ReplaySection({
  analysis,
  onSeek,
}: {
  analysis: VideoAnalysis;
  onSeek?: (ts: number, idx: number) => void;
}) {
  const moments = analysis.replayMoments;
  if (!moments || moments.length === 0) return null;

  return (
    <section className="space-y-3">
      <div className="section-title">
        FRAME Replay
      </div>
      <div className="space-y-2">
        {moments.map((m, i) => {
          const idx = analysis.keyframes.findIndex(
            (k) => Math.abs(k.timestamp - m.timestamp) < 0.05,
          );
          return (
            <ReplayMomentRow
              key={i}
              moment={m}
              keyframe={idx >= 0 ? analysis.keyframes[idx] : null}
              index={idx}
              onSeek={onSeek}
            />
          );
        })}
      </div>
      {onSeek && (
        <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground/90">
          tap a moment to jump to that frame
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// FRAME asks — one grounded question after the read; the answer is recorded
// ---------------------------------------------------------------------------

function FeedbackCard({ analysis }: { analysis: VideoAnalysis }) {
  const question = analysis.reviewQuestion;
  const [draft, setDraft] = useState("");
  const answerMutation = useAnswerReview(analysis.id);

  if (!question) return null;

  const recorded = answerMutation.data?.analysis.reviewAnswer || analysis.reviewAnswer;

  return (
    <section className="glass space-y-3 p-5">
      <div className="eyebrow eyebrow-gold">
        FRAME asks
      </div>
      <p className="text-[0.95rem] text-foreground/90 leading-relaxed">{question}</p>

      {recorded ? (
        <div className="space-y-1.5">
          <div className="border-l-2 border-primary-light/70 pl-3 text-[0.9rem] text-foreground/90 leading-relaxed">
            {recorded}
          </div>
          <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#C7A15A]">
            Recorded — FRAME will hold this
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={500}
            rows={3}
            placeholder="Answer honestly — one or two lines is enough."
            className="field-glass !min-h-0 !py-3 !text-[0.9rem] placeholder:text-muted-foreground resize-none"
          />
          <div className="flex items-center justify-between gap-3">
            <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground/90">
              {draft.trim().length}/500
            </div>
            <button
              type="button"
              disabled={!draft.trim() || answerMutation.isPending}
              onClick={() => answerMutation.mutate(draft.trim())}
              className="btn-quiet btn-quiet-gold disabled:opacity-40"
            >
              {answerMutation.isPending ? "Recording…" : "Record"}
            </button>
          </div>
          {answerMutation.isError && (
            <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-destructive/80">
              could not record — try again
            </div>
          )}
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Mobile-only Report component (identical to original, uses shared sub-components)
// ---------------------------------------------------------------------------

function Report({
  analysis,
  fighter,
  videoUrl,
  trackNote = null,
  baselineId = null,
  onClose,
  onSelectSession,
}: {
  analysis: VideoAnalysis;
  fighter: Fighter | null;
  videoUrl: string | null;
  trackNote?: string | null;
  /** Saved reports: the session picked as "vs" baseline, so the pose overlay compares against it too. */
  baselineId?: number | null;
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
  const footageRef = useRef<HTMLDivElement>(null);
  const kf = analysis.keyframes[activeKf];
  const track = useDecodedTrack(analysis.poseTrack);
  const opponent = useDecodedOpponent(analysis.poseTrack);
  // The phone layout owns its own clock (the desktop workstation has another).
  const playback = useMemo(() => new Playback(), []);
  useEffect(() => {
    playback.reset(analysis.durationSec);
  }, [playback, analysis.id, analysis.durationSec]);

  function commitNote(notes: Record<number, string>) {
    void updateNotes.mutate(notes);
  }

  function seekTo(ts: number, idx: number) {
    setActiveKf(idx);
    playback.seek(ts);
    footageRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  return (
    <div className="space-y-7">
      <div className="flex items-start justify-between gap-4">
        <div className="eyebrow">
          {analysis.kind} · {analysis.durationSec.toFixed(0)}s read
          {analysis.focus && (
            <span className="block normal-case tracking-normal text-muted-foreground mt-1">
              focus: {analysis.focus}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="New analysis"
          className="icon-round flex-none text-muted-foreground hover:text-foreground transition-colors"
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
          className="inline-flex items-center gap-2 disabled:opacity-50 btn-quiet"
        >
          <Download className="w-3.5 h-3.5" strokeWidth={1.5} />
          {saving ? "Rendering…" : "Save card"}
        </button>
      </div>

      <p className="glass glass-gold font-display not-italic text-[1.2rem] text-[#f1ede6] leading-snug p-5">
        {analysis.summary}
      </p>

      {/* FRAME asks one grounded question about this read */}
      <FeedbackCard analysis={analysis} />

      {/* comparison vs selected or last session */}
      {(() => {
        const cmp = analysis.liveComparison ?? analysis.comparison;
        return cmp && cmp.deltas.length > 0 ? (
          <ComparisonSection comparison={cmp} isCustomBaseline={!!analysis.liveComparison} />
        ) : null;
      })()}

      {/* footage: the fresh upload with live skeleton overlay, or (saved reports, no video
          stored) the ghost player — both on one clock with the event/replay timeline */}
      {(videoUrl || track) && (
        <div ref={footageRef}>
          <FootageBlock
            videoUrl={videoUrl}
            trackNote={trackNote}
            track={track}
            opponent={opponent}
            events={analysis.detectedEvents ?? []}
            moments={analysis.replayMoments ?? []}
            durationSec={analysis.durationSec}
            playback={playback}
            videoClassName="w-full rounded border border-border/40 bg-black"
          />
        </div>
      )}

      {/* FRAME Replay — up to three curated moments, tap to seek */}
      <ReplaySection analysis={analysis} onSeek={seekTo} />

      {/* detected events — clickable keyframes + note annotation */}
      {analysis.keyframes.length > 0 && (
        <section className="space-y-3">
          <div className="section-title">
            Detected events
          </div>
          {kf && (
            <figure className="space-y-2">
              <img
                src={kf.imageBase64}
                alt={kf.caption}
                className="w-full rounded border border-border/50"
              />
              <figcaption className="eyebrow">
                {kf.timestamp.toFixed(1)}s · {kf.caption}
              </figcaption>
              {localNotes[activeKf] && (
                <div className="font-mono text-[10px] text-[#C7A15A] leading-snug">
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
                onClick={() => seekTo(k.timestamp, i)}
                className={`flex-none w-20 overflow-hidden rounded-xl border transition-colors ${
                  i === activeKf ? "border-primary/70" : "border-border/40 hover:border-primary/40"
                }`}
              >
                <img src={k.imageBase64} alt={k.caption} className="w-full" />
                <div className="eyebrow px-1 py-1 truncate">
                  {k.caption}
                </div>
                {localNotes[i] && (
                  <div className="font-mono text-[10px] text-[#C7A15A] px-1 pb-1 truncate leading-tight border-t border-border/20 pt-0.5">
                    {localNotes[i]}
                  </div>
                )}
              </button>
            ))}
          </div>
          {/* inline note editor for active keyframe */}
          <div className="flex items-center gap-2">
            <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground/90 flex-none">
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
              className="field-glass flex-1 !min-h-[44px] !py-0 !text-xs placeholder:text-muted-foreground"
            />
          </div>
        </section>
      )}

      {/* findings table */}
      {analysis.findings.length > 0 && (
        <FindingsTable
          findings={analysis.findings}
          keyframes={analysis.keyframes}
          track={track}
          onJump={(ts) => {
            playback.seek(ts);
            footageRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
          }}
        />
      )}

      {/* movement graphs from the pose track */}
      {track && (
        <MovementGraphs
          track={track}
          events={analysis.detectedEvents ?? []}
          durationSec={analysis.durationSec}
          playback={playback}
        />
      )}

      {/* raw signals */}
      {analysis.metrics.signals.length > 0 && (
        <RawSignalsTable signals={analysis.metrics.signals} prevSignals={analysis.prevSignals} signalHistory={analysis.signalHistory} hasCustomCompare={!!analysis.liveComparison} onSelectSession={onSelectSession} />
      )}

      {/* ghost comparisons (hidden without data) */}
      <PoseComparisons analysis={analysis} track={track} baselineId={baselineId} />

      {/* score provenance */}
      <ScoreProvenance analysis={analysis} />

      <button
        type="button"
        onClick={onClose}
        className="w-full btn-quiet"
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
        <div className="eyebrow">
          Loading read
        </div>
      </div>
    );
  }
  if (isError || !data?.analysis) {
    return (
      <div className="space-y-4">
        <div className="glass glass-red !rounded-2xl px-3 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-destructive/90">
          could not load this read
        </div>
        <button
          type="button"
          onClick={onClose}
          className="w-full btn-quiet"
        >
          Back
        </button>
      </div>
    );
  }
  return <Report analysis={data.analysis} fighter={fighter} videoUrl={null} baselineId={compareId} onClose={onClose} onSelectSession={onSelectSession} />;
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
      <div className="section-title">
        Trend
        <span className="ml-2 normal-case tracking-normal text-muted-foreground/90">
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
                <span className="eyebrow">
                  {label}
                </span>
                {hasData && (
                  <span className="font-mono text-[10px] text-foreground/60">
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
                          <div className="glass px-3 py-1.5 font-mono text-[11px] text-foreground !rounded-xl">
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
                  className="flex items-center justify-center font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground/90 border border-border/20 rounded-2xl"
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
    <div className="fixed inset-0 z-50 bg-[#050505]/95 backdrop-blur-xl flex flex-col items-center justify-center px-8 overflow-hidden">
      <div className="pointer-events-none absolute inset-0 frame-scanlines" />
      <div className="pointer-events-none absolute inset-x-0 h-24 frame-scan-sweep" />

      <div className="pointer-events-none absolute left-1/2 top-[34%] h-[360px] w-[360px] -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ background: "radial-gradient(closest-side, rgba(138,106,47,0.42), rgba(191,29,29,0.10) 60%, transparent)", filter: "blur(30px)" }} />
      <div className="glass relative flex items-center justify-center w-32 h-32 !rounded-full">
        <img
          src={`${import.meta.env.BASE_URL.replace(/\/$/, "")}frame-logo.png`}
          alt="FRAME"
          className="w-20 h-20 object-contain rounded-full mix-blend-screen"
          style={{ animation: "frame-logo-pulse 2.4s ease-in-out infinite", opacity: 0.92 }}
          draggable={false}
        />
        <style>{`
          @keyframes frame-logo-pulse {
            0%, 100% { opacity: 0.6; transform: scale(0.97); }
            50% { opacity: 0.95; transform: scale(1.03); }
          }
          @media (prefers-reduced-motion: reduce) { img[alt="FRAME"] { animation: none !important; } }
        `}</style>
      </div>

      <div className="mt-10 text-center space-y-2 relative">
        <div className="eyebrow">
          {kindLabel}
        </div>
        <div className="font-mono text-base uppercase tracking-[0.16em] text-foreground/95">
          {PHASE_TITLE[key]}
        </div>
        <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#C7A15A] h-4 transition-opacity">
          {phrases[phraseIdx]}
          {pct != null ? ` · ${pct}%` : ""}
        </div>
      </div>

      <div className="mt-10 flex items-center gap-2 relative">
        {steps.map((s, i) => (
          <div
            key={s}
            className={`h-1 rounded-full transition-all duration-500 ${
              i <= activeIdx ? "w-10 bg-[#C7A15A]" : "w-6 bg-white/15"
            }`}
          />
        ))}
      </div>
    </div>
  );
}

function deltaIcon(d: number) {
  if (d > 1) return <ArrowUpRight className="w-3.5 h-3.5 text-[#E6D2A3]" strokeWidth={2} />;
  if (d < -1) return <ArrowDownRight className="w-3.5 h-3.5 text-[#E0564E]" strokeWidth={2} />;
  return <Minus className="w-3.5 h-3.5 text-muted-foreground" strokeWidth={2} />;
}

function SubjectToggle({
  subject,
  setSubject,
  disabled,
}: {
  subject: AnalysisSubject;
  setSubject: (s: AnalysisSubject) => void;
  disabled: boolean;
}) {
  const opts: { value: AnalysisSubject; label: string; accent: string; text: string }[] = [
    { value: "self", label: "Your read", accent: "0,68%,46%", text: "hsl(0,55%,65%)" },
    { value: "opponent", label: "Opponent scout", accent: "199,84%,56%", text: "hsl(199,70%,70%)" },
  ];
  return (
    <section className="space-y-2">
      <div className="eyebrow">
        Mode
      </div>
      <div className="grid grid-cols-2 gap-2">
        {opts.map((o) => {
          const active = subject === o.value;
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => setSubject(o.value)}
              disabled={disabled}
              className="pill !px-2 disabled:opacity-40" data-active={active}
>
              {o.label}
            </button>
          );
        })}
      </div>
    </section>
  );
}

function OpponentHistory({
  items,
  loading,
  onOpen,
}: {
  items: OpponentListItem[];
  loading: boolean;
  onOpen: (id: number) => void;
}) {
  if (loading) return null;
  if (items.length === 0) return null;
  const SCOUT = "199,84%,56%";
  return (
    <section className="space-y-3 pt-2">
      <div className="flex items-center gap-3 pb-1">
        <span
          className="h-[5px] w-[5px] rounded-full flex-none"
          style={{ background: `hsla(${SCOUT},0.7)` }}
        />
        <div className="section-title">
          Scouting reads
        </div>
      </div>
      <div className="space-y-2.5">
        {items.map((a, idx) => (
          <button
            key={a.id}
            type="button"
            onClick={() => onOpen(a.id)}
            className="glass w-full text-left px-5 py-4 transition-colors hover:border-primary/40"
>
            <div className="flex items-start gap-3">
              <Crosshair
                className="w-[14px] h-[14px] mt-0.5 flex-none"
                style={{ color: `hsla(${SCOUT},0.6)` }}
                strokeWidth={1.5}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-3 mb-1">
                  <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-foreground/80 truncate">
                    {a.opponentName || "Unnamed"}
                    <span className="text-muted-foreground/90"> · {a.kind}</span>
                  </span>
                  <span className="flex items-baseline gap-2 flex-none">
                    {a.hasMatchup && (
                      <span
                        className="font-mono text-[10px] uppercase tracking-[0.14em] px-1.5 py-0.5"
                        style={{ color: `hsla(${SCOUT},0.85)`, border: `1px solid hsla(${SCOUT},0.3)` }}
                      >
                        matchup
                      </span>
                    )}
                    {a.nervousSystemLoad != null && (
                      <span
                        className={`font-mono text-[10px] uppercase tracking-[0.14em] ${LOAD_COLOR[a.nervousSystemLoad].split(" ")[0]}`}
                      >
                        {LOAD_LABEL[a.nervousSystemLoad]}
                      </span>
                    )}
                  </span>
                </div>
                <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground/90 mt-1.5">
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
        ))}
      </div>
    </section>
  );
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
      <div className="flex items-center justify-between gap-3 pb-1">
        <div className="flex items-center gap-3">
          <span className="h-[6px] w-[6px] rounded-full bg-[#C7A15A] flex-none" />
          <div className="section-title">
            Session log
          </div>
        </div>
        {baselineItem && (
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#C7A15A]">
              Baseline: {baselineItem.kind} ·{" "}
              {new Date(baselineItem.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
            </span>
            <button
              type="button"
              onClick={() => onSetCompare(compareId!)}
              className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground/90 hover:text-foreground/70 transition-colors"
              title="Clear baseline"
            >
              <X className="w-3 h-3" strokeWidth={1.5} />
            </button>
          </div>
        )}
      </div>
      <div className="space-y-2.5">
        {items.map((a, idx) => {
          const isBaseline = a.id === compareId;
          if (a.locked) {
            // Free tier: everything except the latest session is server-locked.
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => openUpgrade("analysis_history")}
                className="glass w-full text-left px-5 py-4 opacity-85 transition-colors hover:border-primary/40"
>
                <div className="flex items-center gap-3">
                  <Lock className="w-[14px] h-[14px] flex-none text-muted-foreground/90" strokeWidth={1.5} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="eyebrow">
                        {a.kind}
                      </span>
                      <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#C7A15A] border border-primary/25 px-1.5 py-0.5 rounded-2xl">
                        FRAME+
                      </span>
                    </div>
                    <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground/90 mt-1.5">
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
                className={`glass w-full text-left px-5 py-4 pr-16 transition-colors hover:border-primary/40 ${isBaseline ? "glass-gold" : ""}`}
>
                <div className="flex items-start gap-3">
                  <Film className="w-[14px] h-[14px] mt-0.5 flex-none" style={{ color: isBaseline ? "#E6D2A3" : "#C7A15A" }} strokeWidth={1.5} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-3 mb-1">
                      <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-foreground/80">
                        {a.kind}
                        {a.styleProfile ? <span className="text-muted-foreground/90"> · {a.styleProfile}</span> : null}
                        {isBaseline && (
                          <span className="ml-2 font-mono text-[10px] uppercase tracking-[0.14em] text-[#C7A15A] border border-primary/30 px-1 py-0.5 rounded-2xl">
                            baseline
                          </span>
                        )}
                      </span>
                      <span className="flex items-baseline gap-2">
                        {(a.sessionScore ?? 0) > 0 && (
                          <span className="numeral numeral-m !text-[1.5rem]">{a.sessionScore}</span>
                        )}
                        {a.nervousSystemLoad != null && (
                          <span className={`font-mono text-[10px] uppercase tracking-[0.14em] ${LOAD_COLOR[a.nervousSystemLoad].split(" ")[0]}`}>
                            {LOAD_LABEL[a.nervousSystemLoad]}
                          </span>
                        )}
                      </span>
                    </div>
                    <p className="text-[0.8rem] text-foreground/70 leading-snug line-clamp-2">
                      {a.summary}
                    </p>
                    <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground/90 mt-1.5">
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
                className={`absolute right-3 top-1/2 -translate-y-1/2 min-h-[44px] min-w-[44px] rounded-full font-mono text-[10px] uppercase tracking-[0.14em] border transition-all duration-150 ${
                  isBaseline
                    ? "opacity-100 border-primary-light/40 text-[#C7A15A] bg-primary/10 hover:bg-primary/20"
                    : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100 border-border/60 text-muted-foreground hover:border-primary/40 hover:text-[#C7A15A]"
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
