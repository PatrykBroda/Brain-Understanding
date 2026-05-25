import { useEffect, useMemo, useRef, useState } from "react";
import type { CalibrationQuestion } from "@/lib/api";

interface EntrySequenceProps {
  fighterName: string | null;
  question: CalibrationQuestion | null;
  questionLoading: boolean;
  briefingPending: boolean;
  isAnswering: boolean;
  onAnswer: (key: string, answer: string) => void;
  onDismiss: () => void;
}

const APHORISMS: string[] = [
  "Most mistakes are nervous system mistakes.",
  "Pressure is not the problem. Fragmentation under pressure is.",
  "The system you build is the system that tests you.",
  "Coherence beats intensity.",
  "What you can name, you can hold.",
  "Position before submission. Regulation before position.",
  "The roll reveals what the drill hides.",
  "Tilt is data.",
  "Anchor before you act.",
  "Narrow the decision tree.",
  "The frame is built one rep at a time.",
  "You do not rise to the level of your hope. You fall to the level of your wiring.",
];

const MOODS: { light: string; accent: string; rim: string }[] = [
  { light: "rgba(190, 140, 80, 0.11)", accent: "rgba(70, 100, 140, 0.06)", rim: "rgba(190, 140, 80, 0.06)" },
  { light: "rgba(90, 140, 180, 0.09)", accent: "rgba(190, 140, 80, 0.05)", rim: "rgba(90, 140, 180, 0.05)" },
  { light: "rgba(170, 90, 80, 0.10)", accent: "rgba(80, 120, 140, 0.05)", rim: "rgba(170, 90, 80, 0.05)" },
  { light: "rgba(140, 140, 150, 0.08)", accent: "rgba(190, 140, 80, 0.05)", rim: "rgba(170, 170, 180, 0.04)" },
  { light: "rgba(160, 120, 90, 0.10)", accent: "rgba(100, 90, 130, 0.05)", rim: "rgba(160, 120, 90, 0.05)" },
];

const NOISE_SVG = `data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.5 0"/></filter><rect width="100%" height="100%" filter="url(#n)" opacity="0.85"/></svg>`,
)}`;

const MIN_DISPLAY_MS = 1400;
const CALIBRATION_REVEAL_MS = 550;

function pickRotated<T>(arr: T[], storageKey: string): T {
  if (arr.length === 0) throw new Error("empty array");
  if (arr.length === 1) return arr[0]!;
  let lastIdx = -1;
  try {
    const stored = window.localStorage.getItem(storageKey);
    if (stored !== null) lastIdx = Number(stored);
  } catch {
    /* ignore */
  }
  let idx = Math.floor(Math.random() * arr.length);
  if (idx === lastIdx) idx = (idx + 1) % arr.length;
  try {
    window.localStorage.setItem(storageKey, String(idx));
  } catch {
    /* ignore */
  }
  return arr[idx]!;
}

export function EntrySequence({
  fighterName,
  question,
  questionLoading,
  briefingPending,
  isAnswering,
  onAnswer,
  onDismiss,
}: EntrySequenceProps) {
  const aphorism = useMemo(() => pickRotated(APHORISMS, "synochi:lastAphorismIdx"), []);
  const mood = useMemo(() => pickRotated(MOODS, "synochi:lastMoodIdx"), []);
  const layout = useRef({
    lightX: 18 + Math.random() * 64,
    lightY: 58 + Math.random() * 36,
    accentX: 10 + Math.random() * 80,
    accentY: 8 + Math.random() * 32,
    rimY: 92 + Math.random() * 8,
    rotation: -1 + Math.random() * 2,
  }).current;

  const [closing, setClosing] = useState(false);
  const [calibrationVisible, setCalibrationVisible] = useState(false);
  const mountedAtRef = useRef(performance.now());
  const dismissTimerRef = useRef<number | null>(null);
  const autoDismissTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const id = window.setTimeout(() => setCalibrationVisible(true), CALIBRATION_REVEAL_MS);
    return () => window.clearTimeout(id);
  }, []);

  // Master cleanup — never let a pending timer call setState after unmount.
  useEffect(() => {
    return () => {
      if (dismissTimerRef.current !== null) window.clearTimeout(dismissTimerRef.current);
      if (autoDismissTimerRef.current !== null) window.clearTimeout(autoDismissTimerRef.current);
    };
  }, []);

  // userInitiated=true skips the minimum-dwell gate so repeat visits feel snappy.
  const close = (userInitiated: boolean) => {
    if (closing) return;
    setClosing(true);
    const elapsed = performance.now() - mountedAtRef.current;
    const dwell = userInitiated ? 0 : Math.max(0, MIN_DISPLAY_MS - elapsed);
    if (dismissTimerRef.current !== null) window.clearTimeout(dismissTimerRef.current);
    dismissTimerRef.current = window.setTimeout(onDismiss, 320 + dwell);
  };

  useEffect(() => {
    if (questionLoading) return;
    if (question) return;
    if (briefingPending) return;
    const elapsed = performance.now() - mountedAtRef.current;
    const wait = Math.max(MIN_DISPLAY_MS - elapsed, 450);
    if (autoDismissTimerRef.current !== null) window.clearTimeout(autoDismissTimerRef.current);
    autoDismissTimerRef.current = window.setTimeout(() => close(false), wait);
    return () => {
      if (autoDismissTimerRef.current !== null) {
        window.clearTimeout(autoDismissTimerRef.current);
        autoDismissTimerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questionLoading, question, briefingPending]);

  const handleAnswer = (option: string) => {
    if (!question || isAnswering) return;
    onAnswer(question.key, option);
    close(true);
  };

  const centerpiece = question?.prompt ?? aphorism;
  const isQuestion = !!question;

  const background = `
    radial-gradient(ellipse 65% 55% at ${layout.lightX}% ${layout.lightY}%, ${mood.light} 0%, transparent 62%),
    radial-gradient(ellipse 40% 32% at ${layout.accentX}% ${layout.accentY}%, ${mood.accent} 0%, transparent 55%),
    radial-gradient(ellipse 110% 30% at 50% ${layout.rimY}%, ${mood.rim} 0%, transparent 70%),
    radial-gradient(ellipse 130% 130% at 50% 50%, #0d0d10 0%, #07070a 55%, #030305 100%)
  `;

  return (
    <div
      className={`fixed inset-0 z-50 text-foreground transition-opacity duration-300 ${
        closing ? "opacity-0 pointer-events-none" : "opacity-100"
      }`}
      style={{ background }}
    >
      {/* photographic grain overlay */}
      <div
        className="absolute inset-0 pointer-events-none mix-blend-overlay"
        style={{
          backgroundImage: `url("${NOISE_SVG}")`,
          opacity: 0.18,
        }}
      />
      {/* dark vignette */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 100% 70% at 50% 50%, transparent 30%, rgba(0,0,0,0.45) 78%, rgba(0,0,0,0.85) 100%)",
        }}
      />

      <div
        className="relative h-full flex flex-col px-6"
        style={{
          paddingTop: "max(1.75rem, env(safe-area-inset-top))",
          paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))",
        }}
      >
        <header className="flex-none flex items-center justify-between animate-in fade-in slide-in-from-top-1 duration-700">
          <div className="font-mono text-[9px] tracking-[0.45em] text-muted-foreground uppercase">
            Entry Sequence
          </div>
          {fighterName && (
            <div className="font-mono text-[10px] tracking-[0.4em] text-primary/85 uppercase">
              {fighterName}
            </div>
          )}
        </header>

        <main className="flex-1 grid place-items-center min-h-0 py-8">
          <div
            className="text-center max-w-[22ch] mx-auto animate-in fade-in zoom-in-95 duration-1000"
            style={{ transform: `rotate(${layout.rotation.toFixed(2)}deg)` }}
          >
            {isQuestion && (
              <div className="font-mono text-[10px] tracking-[0.5em] text-primary/90 uppercase mb-6 animate-in fade-in duration-700 delay-300 fill-mode-both">
                Calibration
              </div>
            )}
            <div
              className="font-sans uppercase font-extralight leading-[1.35] text-foreground/95"
              style={{
                fontSize: "clamp(1.4rem, 6.2vw, 2.15rem)",
                letterSpacing: "0.13em",
                textShadow: "0 1px 30px rgba(0,0,0,0.55)",
              }}
            >
              {centerpiece}
            </div>
            {!isQuestion && (
              <div className="mt-8 flex items-center justify-center gap-1.5 animate-in fade-in duration-700 delay-500 fill-mode-both">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="w-1 h-1 rounded-full bg-foreground/40 animate-pulse"
                    style={{ animationDelay: `${i * 220}ms` }}
                  />
                ))}
              </div>
            )}
          </div>
        </main>

        <section
          className={`flex-none w-full max-w-md mx-auto min-h-[112px] transition-all duration-500 ${
            calibrationVisible
              ? "opacity-100 translate-y-0"
              : "opacity-0 translate-y-3 pointer-events-none"
          }`}
        >
          {isQuestion && question && (
            <div className="flex flex-wrap gap-2 justify-center">
              {question.options.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  disabled={isAnswering || closing}
                  onClick={() => handleAnswer(opt)}
                  className="px-3.5 py-2 border border-foreground/15 bg-foreground/[0.04] hover:border-primary/60 hover:bg-foreground/[0.08] text-[12.5px] font-mono tracking-wide text-foreground/85 transition-all duration-150 disabled:opacity-40 backdrop-blur-sm"
                >
                  {opt}
                </button>
              ))}
            </div>
          )}
        </section>

        <footer className="flex-none mt-8 flex flex-col items-center gap-4 animate-in fade-in duration-700 delay-200 fill-mode-both">
          <div className="text-center">
            <div className="font-mono font-bold text-[15px] tracking-[0.4em] text-foreground/85">
              SYNOCHI
            </div>
            <div className="font-mono text-[8px] tracking-[0.55em] text-muted-foreground/80 mt-1.5">
              V 0 · 1
            </div>
          </div>
          <button
            type="button"
            onClick={() => close(true)}
            disabled={closing}
            className="font-mono text-[10px] tracking-[0.45em] text-muted-foreground/85 hover:text-foreground transition-colors uppercase disabled:opacity-40"
          >
            {isQuestion ? "Skip · enter frame" : "Enter frame"}
          </button>
        </footer>
      </div>
    </div>
  );
}
