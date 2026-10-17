import { Link } from "wouter";
import { Shield, ChevronRight } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { CosmicOrb, ORB_PALETTE } from "@/components/cosmic-orb";
import { FramePlusPill } from "@/components/frame-plus-modal";
import { FrameWordmark } from "@/components/frame-wordmark";
import { BottomNav } from "@/components/bottom-nav";
import { useFighter } from "@/hooks/use-fighter";
import { useAutoWelcome } from "@/hooks/use-auto-welcome";
import { useFrameState, type FrameStateLabel } from "@/hooks/use-frame-state";
import { useAnalyses } from "@/hooks/use-analysis";
import { useTodayCheckin } from "@/hooks/use-checkin";
import { api } from "@/lib/api";
import { readinessModifier, applyReadinessModifier } from "@/lib/readiness-modifier";

// One coaching cue per interpretive state. Deterministic — keyed to the same
// honestly-derived state as the orb label, never generated, never a metric.
const STATE_CUE: Record<FrameStateLabel, string> = {
  Dormant: "Step in. The frame reads what you feed it.",
  Stable: "Narrow the decision tree.",
  Loaded: "Trade speed for position.",
  Recovering: "Protect the rebuild.",
  Tight: "Commit earlier than comfort wants.",
  Volatile: "Anchor the breath before the exchange.",
  Composed: "Hold the standard. Add pressure, not pace.",
  Overextended: "Cut volume. Keep structure.",
};

export default function StatePage() {
  const { data: fighterData } = useFighter();
  const fighter = fighterData?.fighter ?? null;

  useAutoWelcome();
  const frameState = useFrameState();

  const analysesQuery = useAnalyses();
  const latest =
    analysesQuery.data?.analyses?.find((a) => !a.locked && a.sessionScore != null) ?? null;

  // Same readiness priority as the Home dashboard: today's self-reported
  // check-in composite first, else the last analysed session's score.
  const checkinQuery = useTodayCheckin();
  const checkin = checkinQuery.data?.checkin ?? null;
  const checkinScore = checkin
    ? Math.round((checkin.sleep + checkin.energy + checkin.soreness + checkin.stress) / 4)
    : null;
  const sessionScore = latest?.sessionScore != null ? Math.round(latest.sessionScore) : null;
  const baseReadiness = checkinScore ?? sessionScore;
  const readinessSource = checkinScore != null ? "today" : "last session";

  // Warms the shared ["conversation"] cache Chat reuses; lets the doorway read
  // "Continue" only when there's a real prior session (not keyed on analyses).
  const conversationQuery = useQuery({
    queryKey: ["conversation"],
    queryFn: () => api.getActiveConversation(),
    enabled: !!fighter,
  });
  const hasSession = (conversationQuery.data?.messages?.length ?? 0) > 0;

  // Recent chat drives a small ±10 modifier on top of the base readiness,
  // reusing the conversation already fetched above — no new data flow. Mirrors
  // the native app so the Fight Readiness number matches across surfaces.
  const chatModifier = readinessModifier(conversationQuery.data?.messages ?? []);
  const readiness = applyReadinessModifier(baseReadiness, chatModifier);

  const { hue, sat, light } = ORB_PALETTE[frameState.orb];
  const labelColor = `hsl(${hue}, ${Math.round(sat * 35)}%, 91%)`;
  const labelGlow = `0 0 48px hsla(${hue}, ${Math.round(sat * 100)}%, ${Math.round(light * 100)}%, 0.38), 0 2px 12px rgba(0,0,0,0.6)`;


  return (
    <div
      className="relative grid h-[100dvh] text-foreground overflow-hidden"
      style={{ gridTemplateRows: "auto minmax(0,1fr) auto auto" }}
    >
      {/* ─── Ambient environment — bronze glow behind the orb, crimson low-left.
          The body already carries the graphite gradient; these add local depth. */}
      <div aria-hidden className="glow-orb z-0 left-1/2 top-[14%] h-[26rem] w-[26rem] -translate-x-1/2 opacity-70" />
      <div
        aria-hidden
        className="glow-orb z-0 bottom-[-10rem] left-[-8rem] h-[22rem] w-[22rem]"
        style={{ background: "radial-gradient(circle, rgba(191,29,29,0.20), transparent 70%)" }}
      />

      {/* Ultra-fine grain — barely perceptible, kills banding on the dark gradients */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none opacity-[0.04] mix-blend-overlay z-0"
        aria-hidden
      >
        <filter id="frame-grain">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch" />
          <feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.5 0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#frame-grain)" />
      </svg>

      <header className="relative z-10 flex items-center justify-between px-6 pt-[max(1.1rem,env(safe-area-inset-top))] pb-3">
        <div>
          <FrameWordmark size={30} />
          <div className="eyebrow mt-2.5">State calibration system</div>
        </div>
        <div className="flex items-center gap-2.5">
          <FramePlusPill />
          <Link
            href="/profile"
            aria-label="Open profile"
            className="icon-round text-foreground/80 outline-none transition-colors hover:text-[hsl(var(--primary-light))]"
          >
            <Shield className="w-[17px] h-[17px]" strokeWidth={1.4} />
          </Link>
        </div>
      </header>

      <main className="relative z-10 min-h-0 grid place-items-center overflow-hidden px-2">
        {/* Container-sized so the orb is always a whole, uncropped square; the soft
            radial mask melts the canvas edge into the glow field behind it. */}
        <div
          className="frame-fade-in h-full w-full grid place-items-center [container-type:size]"
          style={{
            WebkitMaskImage: "radial-gradient(closest-side, #000 86%, transparent 100%)",
            maskImage: "radial-gradient(closest-side, #000 86%, transparent 100%)",
          }}
        >
          <CosmicOrb state={frameState.orb} className="w-[min(100cqw,100cqh,560px)]" />
        </div>
      </main>

      <section className="relative z-10 flex flex-col items-center text-center px-6 gap-4 pb-4">
        <div className="space-y-2">
          <div className="frame-state-caption-top eyebrow eyebrow-gold">State</div>
          <div
            key={frameState.label}
            className="frame-state-label punch text-[clamp(3.6rem,17vw,5.4rem)]"
            style={{
              color: labelColor,
              textShadow: labelGlow,
              transition: "color 1.6s cubic-bezier(0.22, 0.61, 0.36, 1), text-shadow 1.6s cubic-bezier(0.22, 0.61, 0.36, 1)",
            }}
            title={frameState.source}
          >
            {frameState.label}
          </div>
          <div className="frame-state-caption-bottom font-light tracking-wide text-[1rem] leading-snug text-foreground/80 pt-1">
            {STATE_CUE[frameState.label]}
          </div>
        </div>

        {/* ─── Fight readiness — real, or an honest prompt ─────────────
            Same priority as the Home dashboard: today's self-reported
            check-in composite, else the last analysed session's score.
            No data, no number — never "calibrating". */}
        <Link
          href={readiness != null && checkinScore != null ? "/home" : "/analyse"}
          className="group frame-readiness-in glass block w-full max-w-sm px-5 py-3 outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--primary-light))]"
          aria-label={readiness != null ? "View readiness detail" : "Analyse a session"}
        >
          <div className="flex min-h-[44px] items-center justify-between gap-4">
            <span className="eyebrow">Fight readiness</span>
            {readiness != null ? (
              <span className="flex items-baseline gap-2">
                <span className="numeral numeral-m !text-[2.2rem] !text-[hsl(var(--primary-pale))]">{readiness}</span>
                <span className="text-xs text-muted-foreground">/ 100 · {readinessSource}</span>
              </span>
            ) : (
              <span className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground transition-colors group-hover:text-[hsl(var(--primary-light))]">
                Analyse a session
                <ChevronRight className="w-3.5 h-3.5" strokeWidth={1.5} />
              </span>
            )}
          </div>
          {readiness != null && (
            <div className="bar-thin mt-1" aria-hidden>
              <span style={{ width: `${Math.max(0, Math.min(100, readiness))}%` }} />
            </div>
          )}
        </Link>

        <Link
          href="/chat"
          aria-label={hasSession ? "Continue session" : "Enter the frame"}
          className="btn-bronze w-full max-w-sm outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--primary-pale))]"
        >
          Continue
        </Link>
      </section>

      <div className="relative z-10">
        <BottomNav />
      </div>

      <style>{`
        @keyframes frame-fade-in {
          from { opacity: 0; transform: scale(0.96); }
          to   { opacity: 1; transform: scale(1); }
        }
        .frame-fade-in {
          animation: frame-fade-in 1.4s cubic-bezier(0.22, 0.61, 0.36, 1) both;
        }

        @keyframes frame-caption-in {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        .frame-state-caption-top {
          animation: frame-caption-in 0.4s cubic-bezier(0.22, 0.61, 0.36, 1) 0.1s both;
        }

        @keyframes frame-state-in {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: none; }
        }
        .frame-state-label {
          animation: frame-state-in 0.75s cubic-bezier(0.22, 1, 0.36, 1) 0.35s both;
        }

        .frame-state-caption-bottom {
          animation: frame-caption-in 0.4s cubic-bezier(0.22, 0.61, 0.36, 1) 0.9s both;
        }

        .frame-readiness-in {
          animation: frame-caption-in 0.6s cubic-bezier(0.22, 0.61, 0.36, 1) 1.05s both;
        }

        @media (prefers-reduced-motion: reduce) {
          .frame-fade-in,
          .frame-state-caption-top,
          .frame-state-label,
          .frame-state-caption-bottom,
          .frame-readiness-in { animation: none; }
        }
      `}</style>
    </div>
  );
}
