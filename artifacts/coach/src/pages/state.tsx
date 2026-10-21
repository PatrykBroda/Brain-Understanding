import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { ChevronRight } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { CosmicOrb, ORB_PALETTE, type OrbState } from "@/components/cosmic-orb";
import { FramePlusPill } from "@/components/frame-plus-modal";
import { BottomNav } from "@/components/bottom-nav";
import { useFighter } from "@/hooks/use-fighter";
import { useAutoWelcome } from "@/hooks/use-auto-welcome";
import type { FrameStateLabel } from "@/hooks/use-frame-state";
import { useToday } from "@/hooks/use-today";
import { stateHeadline } from "@/lib/today";
import { api } from "@/lib/api";

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

// Short tips shown when the athlete taps the orb, one per tap, rotating. Mirrors frame-mobile.
// DRAFT COPY: needs Harry's sign-off before release (FRAME update 21 Oct, §5).
const STATE_TIPS: Record<FrameStateLabel, string[]> = {
  Dormant: [
    "Tell your coach how training went.",
    "Log a check-in. The read starts there.",
    "Name one thing you are working on.",
  ],
  Stable: [
    "Keep the plan simple. Execute it.",
    "One read, one answer. Don't hunt.",
    "Good day to sharpen one detail.",
  ],
  Loaded: [
    "Position first. Speed comes back.",
    "Shorter rounds, cleaner reps.",
    "Recover between efforts, not after.",
  ],
  Recovering: [
    "Quality over volume today.",
    "Move well before you move hard.",
    "Sleep is part of the session.",
  ],
  Tight: [
    "Exhale on the first move.",
    "Decide before the exchange starts.",
    "Loose shoulders, quick hands.",
  ],
  Volatile: [
    "Slow the breath. Then the feet.",
    "Reset your stance between exchanges.",
    "One clear intention per round.",
  ],
  Composed: [
    "Raise the pressure. Keep the shape.",
    "Test the standard against a harder look.",
    "Stay patient. Make them come to you.",
  ],
  Overextended: [
    "Fewer rounds. Same intent.",
    "Protect the structure. Drop the extras.",
    "Rest is part of the next session.",
  ],
};

/** "today's check-in (readiness 62/100)" → "Read from today's check-in.": no readiness wording on State. */
function stateWhy(source: string): string {
  const clean = source.replace(/\s*\([^)]*readiness[^)]*\)/gi, "").trim();
  if (!clean) return "";
  if (/^not enough/i.test(clean)) return `${clean.charAt(0).toUpperCase()}${clean.slice(1)}.`;
  return `Read from ${clean}.`;
}

const TIP_MS = 3500;
const DRAG_THRESHOLD = 6;

export default function StatePage() {
  const { data: fighterData } = useFighter();
  const fighter = fighterData?.fighter ?? null;

  useAutoWelcome();

  // The server decides what "today" is (athlete's timezone). The orb and name follow the
  // athlete's current read; an old state is never presented as today's.
  const todayQuery = useToday();
  const state = todayQuery.data?.state ?? null;
  const current = !!state?.current && !!state.name;
  const label: FrameStateLabel = current ? (state!.name as FrameStateLabel) : "Dormant";
  const orb = label.toLowerCase() as OrbState;
  const headline = state ? stateHeadline(state) : "No read yet";

  // Why this state is showing, then what to do next.
  const why = current && state ? stateWhy(state.source) : "FRAME holds no read for today, so the orb is resting.";
  const next = current ? STATE_CUE[label] : "Check in or tell your coach how training went.";

  // Warms the shared ["conversation"] cache Chat reuses; lets the doorway read
  // "Continue" only when there's a real prior session (not keyed on analyses).
  const conversationQuery = useQuery({
    queryKey: ["conversation"],
    queryFn: () => api.getActiveConversation(),
    enabled: !!fighter,
  });
  const hasSession = (conversationQuery.data?.messages?.length ?? 0) > 0;

  const { hue, sat, light } = ORB_PALETTE[orb];
  const labelColor = `hsl(${hue}, ${Math.round(sat * 35)}%, 91%)`;
  const labelGlow = `0 0 48px hsla(${hue}, ${Math.round(sat * 100)}%, ${Math.round(light * 100)}%, 0.38), 0 2px 12px rgba(0,0,0,0.6)`;

  // ── Orb interaction: drag (springs home on release) and click/tap (a short tip) ──
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{ id: number; x: number; y: number; moved: boolean } | null>(null);
  const [tip, setTip] = useState<string | null>(null);
  const tipIndex = useRef(0);
  const tipTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showTip = () => {
    const tips = STATE_TIPS[label];
    setTip(tips[tipIndex.current % tips.length]);
    tipIndex.current += 1;
    if (tipTimer.current) clearTimeout(tipTimer.current);
    tipTimer.current = setTimeout(() => setTip(null), TIP_MS);
  };
  useEffect(() => {
    tipIndex.current = 0;
    setTip(null);
  }, [label]);
  useEffect(
    () => () => {
      if (tipTimer.current) clearTimeout(tipTimer.current);
    },
    [],
  );

  const onOrbPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    dragRef.current = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onOrbPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    if (!d.moved) {
      d.moved = true;
      setDragging(true);
    }
    // Keep the orb's centre on screen.
    const maxX = window.innerWidth / 2;
    const maxY = window.innerHeight / 2;
    setOffset({ x: Math.max(-maxX, Math.min(maxX, dx)), y: Math.max(-maxY, Math.min(maxY, dy)) });
  };
  const endOrbPointer = (e: React.PointerEvent<HTMLDivElement>, cancelled = false) => {
    const d = dragRef.current;
    if (!d || d.id !== e.pointerId) return;
    dragRef.current = null;
    if (!d.moved && !cancelled) showTip();
    setDragging(false);
    setOffset({ x: 0, y: 0 });
  };

  return (
    <div
      className="relative grid h-[100dvh] text-foreground overflow-hidden"
      style={{
        gridTemplateRows: "auto minmax(0,1fr) auto auto",
        background: "#000",
      }}
    >
      {/* ─── Ambient environment — pure OLED black. No photo here by request:
          the hub is just the orb and the state on true black.
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

      {/* Header: the octagon only */}
      <header className="relative z-10 flex items-center justify-between px-6 pt-[max(1.1rem,env(safe-area-inset-top))] pb-3">
        <img
          src={`${basePath}/frame-octagon-logo.png`}
          srcSet={`${basePath}/frame-octagon-logo.png 1x, ${basePath}/frame-octagon-logo@2x.png 2x, ${basePath}/frame-octagon-logo@3x.png 3x`}
          alt="FRAME"
          width={34}
          height={34}
          className="h-[34px] w-[34px] object-contain"
          draggable={false}
        />
        <div className="flex items-center gap-2">
          <FramePlusPill />
        </div>
      </header>

      <main className="relative z-20 min-h-0 grid place-items-center overflow-visible px-2">
        <div className="frame-fade-in h-full w-full grid place-items-center">
          <div
            role="button"
            tabIndex={0}
            aria-label={`Your state orb: ${label}. Click for a tip; drag to move it.`}
            onPointerDown={onOrbPointerDown}
            onPointerMove={onOrbPointerMove}
            onPointerUp={(e) => endOrbPointer(e)}
            onPointerCancel={(e) => endOrbPointer(e, true)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                showTip();
              }
            }}
            className="relative h-full w-full max-w-[640px] grid place-items-center outline-none focus-visible:ring-1 focus-visible:ring-primary/40 rounded-3xl"
            style={{
              touchAction: "none",
              cursor: dragging ? "grabbing" : "grab",
              userSelect: "none",
              transform: `translate(${offset.x}px, ${offset.y}px)`,
              // Spring back: an overshooting ease when released, none while dragging.
              transition: dragging ? "none" : "transform 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)",
            }}
          >
            <CosmicOrb state={orb} className="w-full max-h-full h-auto" />
            {tip && (
              <div
                key={tip}
                role="status"
                className="frame-tip-in pointer-events-none absolute top-[18%] left-1/2 -translate-x-1/2 max-w-[280px] w-max rounded-2xl border border-white/[0.12] bg-black/80 px-4 py-2.5 text-center font-sans text-[14px] leading-snug text-[#cfcfcf]"
              >
                {tip}
              </div>
            )}
          </div>
        </div>
      </main>

      <section className="relative z-10 flex flex-col items-center text-center px-6 gap-5 pb-3">
        <div className="space-y-2">
          <div className="frame-state-caption-top font-sans text-[13px] text-[#999]">State</div>
          {todayQuery.isError ? (
            <div className="space-y-3" role="alert">
              <div className="font-sans text-[15px] text-destructive">Couldn't load your state</div>
              <button
                type="button"
                onClick={() => void todayQuery.refetch()}
                className="font-sans text-[14px] text-primary hover:text-primary/80 transition-colors"
              >
                Try again
              </button>
            </div>
          ) : (
            <>
              <div
                key={headline}
                className={`frame-state-label font-sans font-light leading-none ${
                  current || todayQuery.isLoading
                    ? "text-[clamp(1.9rem,8vw,2.6rem)]"
                    : "text-[clamp(1.4rem,6vw,1.9rem)]"
                }`}
                style={{
                  color: labelColor,
                  textShadow: labelGlow,
                  transition: "color 1.6s cubic-bezier(0.22, 0.61, 0.36, 1), text-shadow 1.6s cubic-bezier(0.22, 0.61, 0.36, 1)",
                }}
                role={todayQuery.isLoading ? "status" : undefined}
              >
                {todayQuery.isLoading ? "…" : headline}
              </div>
              {!todayQuery.isLoading && (
                <p className="frame-state-caption-bottom mx-auto max-w-[26rem] pt-2 font-sans text-[15px] leading-relaxed text-[#cfcfcf]">
                  {[why, next].filter(Boolean).join(" ")}
                </p>
              )}
            </>
          )}
        </div>

        <div className="w-full max-w-sm">
          <Link
            href="/chat"
            aria-label={hasSession ? "Continue session" : "Enter the frame"}
            className="group block w-full rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
          >
            <div
              className="relative w-full h-[58px] rounded-2xl flex items-center justify-center gap-1.5 transition-all duration-500"
              style={{
                background:
                  "linear-gradient(180deg, hsla(39,49%,36%, 0.05) 0%, hsla(39,49%,36%, 0.015) 100%)",
                border: "1px solid hsla(39,49%,36%, 0.38)",
                boxShadow:
                  "0 10px 50px -12px hsla(39,49%,36%, 0.32), inset 0 1px 0 hsla(39,49%,36%, 0.14)",
              }}
            >
              <span className="font-sans text-[16px] text-[#cfcfcf] group-hover:text-foreground transition-colors duration-500">
                Continue
              </span>
              <ChevronRight className="w-4 h-4 text-[#cfcfcf]" strokeWidth={1.5} />
              <div
                className="absolute inset-0 rounded-2xl pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                style={{
                  boxShadow:
                    "0 0 0 1px hsla(39,49%,36%, 0.55), 0 14px 60px -8px hsla(39,49%,36%, 0.5)",
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
        .frame-state-label {
          animation: frame-caption-in 0.75s cubic-bezier(0.22, 0.61, 0.36, 1) 0.35s both;
        }
        .frame-state-caption-bottom {
          animation: frame-caption-in 0.4s cubic-bezier(0.22, 0.61, 0.36, 1) 0.9s both;
        }
        .frame-tip-in {
          animation: frame-caption-in 0.18s ease-out both;
        }

        @media (prefers-reduced-motion: reduce) {
          .frame-fade-in,
          .frame-state-caption-top,
          .frame-state-label,
          .frame-state-caption-bottom,
          .frame-tip-in { animation: none; }
        }
      `}</style>
    </div>
  );
}
