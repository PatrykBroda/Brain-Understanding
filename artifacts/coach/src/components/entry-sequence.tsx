import { VideoBackdrop } from "@/components/media-backdrop";
import { TAGLINE, SUBLINE } from "@/components/auth-layout";
import { useEffect, useRef, useState } from "react";

interface EntrySequenceProps {
  fighterName: string | null;
  onDismiss: () => void;
}

const MIN_DISPLAY_MS = 3600;
const FADE_OUT_MS = 420;

export function EntrySequence({ fighterName, onDismiss }: EntrySequenceProps) {
  const [closing, setClosing] = useState(false);
  const mountedAtRef = useRef(performance.now());
  const dismissTimerRef = useRef<number | null>(null);
  const autoDismissTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (dismissTimerRef.current !== null) window.clearTimeout(dismissTimerRef.current);
      if (autoDismissTimerRef.current !== null) window.clearTimeout(autoDismissTimerRef.current);
    };
  }, []);

  const close = (userInitiated: boolean) => {
    if (closing) return;
    setClosing(true);
    const elapsed = performance.now() - mountedAtRef.current;
    const dwell = userInitiated ? 0 : Math.max(0, MIN_DISPLAY_MS - elapsed);
    if (dismissTimerRef.current !== null) window.clearTimeout(dismissTimerRef.current);
    dismissTimerRef.current = window.setTimeout(onDismiss, FADE_OUT_MS + dwell);
  };

  useEffect(() => {
    const elapsed = performance.now() - mountedAtRef.current;
    const wait = Math.max(MIN_DISPLAY_MS - elapsed, 400);
    autoDismissTimerRef.current = window.setTimeout(() => close(false), wait);
    return () => {
      if (autoDismissTimerRef.current !== null) {
        window.clearTimeout(autoDismissTimerRef.current);
        autoDismissTimerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <OpeningScene name={fighterName} closing={closing} onContinue={() => close(true)} fixed />;
}

/**
 * Shared opening scene (first-run entry + intro splash): monochrome athlete imagery
 * under a dark scrim, wordmark on top, a reserved text band at the bottom with the
 * two brand lines and ONE primary action. No atmospheric light beyond the imagery.
 */
export function OpeningScene({
  name,
  closing,
  onContinue,
  fixed = false,
}: {
  name: string | null;
  closing: boolean;
  onContinue: () => void;
  fixed?: boolean;
}) {
  const first = name?.split(" ")[0] ?? null;
  return (
    <div
      className={`${fixed ? "fixed inset-0 z-50" : "relative h-[100dvh]"} grid overflow-hidden bg-[var(--f-bg)] text-foreground transition-opacity duration-[320ms] ease-out ${
        closing ? "pointer-events-none opacity-0" : "opacity-100"
      }`}
      style={{ gridTemplateRows: "auto minmax(0,1fr) auto" }}
    >
      <VideoBackdrop dim={0.28} />

      <header className="relative z-10 flex items-center justify-center px-6 pt-[max(1.25rem,env(safe-area-inset-top))] pb-2">
        <div className="wordmark text-[1.15rem]">Frame</div>
      </header>

      <div />

      <section className="relative z-10 mx-auto flex w-full max-w-[460px] flex-col gap-5 px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <div className="frame-rise">
          {first && <p className="label mb-2">Welcome, {first}</p>}
          <h1 className="punch punch-xl text-balance">{TAGLINE}</h1>
          <p className="mt-3 text-base leading-6 text-[var(--f-text-2)]">{SUBLINE}</p>
        </div>
        <button
          type="button"
          onClick={onContinue}
          disabled={closing}
          className="btn-bronze frame-rise w-full"
          style={{ animationDelay: "80ms" }}
        >
          Continue
        </button>
      </section>
    </div>
  );
}
