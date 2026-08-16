import { Link } from "wouter";
import { Shield, ChevronRight } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { CosmicOrb, ORB_PALETTE } from "@/components/cosmic-orb";
import { FramePlusPill } from "@/components/frame-plus-modal";
import { BottomNav } from "@/components/bottom-nav";
import { useFighter } from "@/hooks/use-fighter";
import { useAutoWelcome } from "@/hooks/use-auto-welcome";
import { useFrameState, type FrameStateLabel } from "@/hooks/use-frame-state";
import { useAnalyses } from "@/hooks/use-analysis";
import { useTodayCheckin } from "@/hooks/use-checkin";
import { api } from "@/lib/api";
import { readinessModifier, applyReadinessModifier } from "@/lib/readiness-modifier";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

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
      style={{
        gridTemplateRows: "auto minmax(0,1fr) auto auto",
        background: "#000",
      }}
    >
      {/* ─── Ambient environment — pure OLED black. No photo here by request:
          the hub is just the orb, the state and readiness on true black.
          (The uploaded hero still drives the Home-tab + Profile surfaces.) */}

      {/* Page-wide vignette — anchored on the orb, eases off so it doesn't eat the CTA */}
      <div
        className="absolute inset-0 pointer-events-none z-0"
        style={{
          background:
            "radial-gradient(ellipse 95% 55% at 50% 38%, transparent 40%, rgba(0,0,0,0.55) 95%)",
        }}
      />

      {/* Ultra-fine grain — barely perceptible, kills banding on the OLED black */}
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
        <div className="flex items-center gap-3">
          <img
            src={`${basePath}/frame-logo.png`}
            alt=""
            aria-hidden
            width={36}
            height={36}
            className="object-contain opacity-90"
            style={{ filter: "brightness(1.05)" }}
          />
          <div>
            <div className="font-sans font-extralight text-[15px] tracking-[0.55em] text-foreground/95 leading-none">
              FRAME
            </div>
            <div className="font-mono text-[10px] tracking-[0.5em] text-foreground/55 mt-1.5 font-light">
              {(fighter?.primarySport ?? "COMBAT").toUpperCase()} · CALIBRATION SYSTEM
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <FramePlusPill />
          <Link
            href="/profile"
            aria-label="Open profile"
            className="w-10 h-10 rounded-full border border-white/[0.06] flex items-center justify-center text-foreground/40 hover:border-primary/40 hover:text-primary/90 outline-none focus-visible:ring-1 focus-visible:ring-primary/60 transition-all duration-500"
          >
            <Shield className="w-[15px] h-[15px]" strokeWidth={1.2} />
          </Link>
        </div>
      </header>

      <main className="relative z-10 min-h-0 grid place-items-center overflow-hidden px-6">
        <div className="frame-fade-in h-full w-full grid place-items-center">
          <CosmicOrb
            state={frameState.orb}
            className="h-full max-h-[400px] max-w-full w-auto"
          />
        </div>
      </main>

      <section className="relative z-10 flex flex-col items-center text-center px-6 gap-5 pb-3">
        <div className="space-y-3">
          <div className="frame-state-caption-top font-mono text-[10px] uppercase tracking-[0.55em] text-foreground/65 font-light">
            State
          </div>
          <div
            key={frameState.label}
            className="frame-state-label font-sans font-extralight uppercase text-[clamp(1.7rem,7vw,2.4rem)] tracking-[0.4em] leading-none"
            style={{
              color: labelColor,
              textShadow: labelGlow,
              transition: "color 1.6s cubic-bezier(0.22, 0.61, 0.36, 1), text-shadow 1.6s cubic-bezier(0.22, 0.61, 0.36, 1)",
            }}
            title={frameState.source}
          >
            {frameState.label}
          </div>
          <div className="frame-state-caption-bottom font-mono text-[10px] uppercase tracking-[0.45em] text-foreground/65 font-light pt-2">
            {STATE_CUE[frameState.label]}
          </div>
        </div>

        {/* ─── Fight readiness — real, or an honest prompt ─────────────
            Same priority as the Home dashboard: today's self-reported
            check-in composite, else the last analysed session's score.
            No data, no number — never "calibrating". */}
        <Link
          href={readiness != null && checkinScore != null ? "/home" : "/analyse"}
          className="group frame-readiness-in flex items-center gap-3 outline-none focus-visible:ring-1 focus-visible:ring-primary/50 rounded-lg px-3 py-1"
          aria-label={readiness != null ? "View readiness detail" : "Analyse a session"}
        >
          <span className="font-mono text-[9px] uppercase tracking-[0.5em] text-foreground/45 font-light">
            Fight readiness
          </span>
          <span aria-hidden className="w-px h-3 bg-white/10" />
          {readiness != null ? (
            <span className="flex items-baseline gap-1.5">
              <span className="font-sans font-light text-[19px] tabular-nums leading-none text-primary/90">
                {readiness}
              </span>
              <span className="font-mono text-[9px] uppercase tracking-widest text-foreground/40">
                / 100 · {readinessSource}
              </span>
            </span>
          ) : (
            <span className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.25em] text-foreground/50 group-hover:text-primary/80 transition-colors">
              Analyse a session
              <ChevronRight className="w-3 h-3" strokeWidth={1.5} />
            </span>
          )}
        </Link>

        <div className="w-full max-w-[10rem] flex items-center gap-3 px-1" aria-hidden>
          <div className="flex-1 h-px" style={{ background: "linear-gradient(to right, transparent, hsla(35,55%,55%,0.18))" }} />
          <div className="w-1 h-1 rounded-full" style={{ background: "hsla(35,55%,55%,0.22)" }} />
          <div className="flex-1 h-px" style={{ background: "linear-gradient(to left, transparent, hsla(35,55%,55%,0.18))" }} />
        </div>

        <div className="w-full max-w-sm">
          <Link
            href="/chat"
            aria-label={hasSession ? "Continue session" : "Enter the frame"}
            className="group block w-full rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
          >
            <div
              className="relative w-full h-[58px] rounded-2xl flex items-center justify-center transition-all duration-500"
              style={{
                background:
                  "linear-gradient(180deg, hsla(35, 60%, 55%, 0.05) 0%, hsla(35, 60%, 55%, 0.015) 100%)",
                border: "1px solid hsla(35, 65%, 58%, 0.38)",
                boxShadow:
                  "0 10px 50px -12px hsla(35, 65%, 55%, 0.32), inset 0 1px 0 hsla(35, 70%, 60%, 0.14)",
              }}
            >
              <span className="font-sans text-[13px] uppercase tracking-[0.5em] font-light text-primary group-hover:tracking-[0.55em] transition-all duration-500">
                {hasSession ? "Continue" : "Enter"}
              </span>
              <div
                className="absolute inset-0 rounded-2xl pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                style={{
                  boxShadow:
                    "0 0 0 1px hsla(35, 65%, 60%, 0.55), 0 14px 60px -8px hsla(35, 65%, 55%, 0.5)",
                }}
              />
            </div>
          </Link>
        </div>
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
          from { opacity: 0; letter-spacing: 0.18em; }
          to   { opacity: 1; letter-spacing: 0.4em; }
        }
        .frame-state-label {
          animation: frame-state-in 0.75s cubic-bezier(0.22, 0.61, 0.36, 1) 0.35s both;
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
