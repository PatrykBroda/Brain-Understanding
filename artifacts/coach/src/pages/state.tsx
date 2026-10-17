import { useState } from "react";
import { Link } from "wouter";
import { ChevronDown, ChevronRight, Shield } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { CosmicOrb } from "@/components/cosmic-orb";
import { FramePlusPill } from "@/components/frame-plus-modal";
import { FrameWordmark } from "@/components/frame-wordmark";
import { BottomNav } from "@/components/bottom-nav";
import { Status } from "@/components/frame-ui";
import { useFighter } from "@/hooks/use-fighter";
import { useAutoWelcome } from "@/hooks/use-auto-welcome";
import { useFrameState, type FrameStateLabel } from "@/hooks/use-frame-state";
import { useAnalyses } from "@/hooks/use-analysis";
import { useTodayCheckin } from "@/hooks/use-checkin";
import { api } from "@/lib/api";
import { readinessModifier, applyReadinessModifier } from "@/lib/readiness-modifier";

// One coaching cue per interpretive state. Deterministic - keyed to the same
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

const NO_DATA = "No data yet";

function Factor({ label, value, sub }: { label: string; value: string; sub?: string }) {
  const empty = value === NO_DATA;
  return (
    <div className="flex items-start justify-between gap-4 py-3 row-hair">
      <dt className="label pt-0.5">{label}</dt>
      <dd className="min-w-0 text-right">
        <span className={`tnum block text-[15px] font-medium leading-snug ${empty ? "text-[var(--f-text-3)]" : "text-foreground"}`}>
          {value}
        </span>
        {sub && <span className="mt-0.5 block text-xs leading-4 text-[var(--f-text-3)]">{sub}</span>}
      </dd>
    </div>
  );
}

export default function StatePage() {
  const { data: fighterData } = useFighter();
  const fighter = fighterData?.fighter ?? null;

  useAutoWelcome();
  const frameState = useFrameState();
  const [expanded, setExpanded] = useState(false);

  // Same cache key the state hook uses, so this is not a second fetch.
  const memoryQuery = useQuery({
    queryKey: ["memory"],
    queryFn: api.getMemory,
    enabled: !!fighter,
  });
  const noteCount = memoryQuery.data?.facts?.length ?? null;
  const memoryLoading = memoryQuery.isLoading;
  const memoryError = memoryQuery.isError;

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
  const readinessSource = checkinScore != null ? "today's check-in" : "last session";

  // Warms the shared ["conversation"] cache Chat reuses; lets the doorway read
  // "Continue" only when there's a real prior session (not keyed on analyses).
  const conversationQuery = useQuery({
    queryKey: ["conversation"],
    queryFn: () => api.getActiveConversation(),
    enabled: !!fighter,
  });
  const messages = conversationQuery.data?.messages ?? [];
  const hasSession = messages.length > 0;

  // Recent chat drives a small +/-10 modifier on top of the base readiness.
  const chatModifier = readinessModifier(messages);
  const readiness = applyReadinessModifier(baseReadiness, chatModifier);

  const label = frameState.label;
  const toggle = () => setExpanded((v) => !v);

  return (
    <div className="relative flex h-[100dvh] flex-col overflow-hidden text-foreground">
      {/* The ONE atmospheric light on this screen: champagne, behind the orb. Pinned (does not scroll). */}
      <div
        className="atmo atmo-champagne"
        style={{ WebkitMaskImage: "linear-gradient(#000 60%, transparent)", maskImage: "linear-gradient(#000 60%, transparent)" }}
        aria-hidden
      />
      <header className="relative z-10 flex flex-none items-center justify-between px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-2">
        <FrameWordmark size={28} />
        <div className="flex items-center gap-2">
          <FramePlusPill />
          <Link href="/profile" aria-label="Open profile" className="icon-round outline-none">
            <Shield className="h-[18px] w-[18px]" strokeWidth={1.75} />
          </Link>
        </div>
      </header>

      <main className="relative z-10 min-h-0 flex-1 overflow-y-auto">
        <div className="relative z-10 mx-auto flex w-full max-w-md flex-col items-center px-5 pb-6 pt-2">
          {/* Orb = button. idle -> pressed (scale .98 + brightness) -> expanded (factors panel) */}
          <button
            type="button"
            onClick={toggle}
            aria-expanded={expanded}
            aria-controls="state-factors"
            aria-label={`${label} state. ${expanded ? "Hide" : "Show"} what feeds this state.`}
            style={expanded ? { marginBottom: "calc(min(66vw, 280px) * -0.42)" } : undefined}
            className={`group relative w-[min(66vw,280px)] origin-top rounded-full outline-none transition-[transform,filter] duration-[220ms] ease-out hover:brightness-110 focus-visible:ring-2 focus-visible:ring-[var(--f-gold)] focus-visible:ring-offset-4 focus-visible:ring-offset-[var(--f-bg)] ${expanded ? "scale-[0.58] active:scale-[0.56]" : "active:scale-[0.98]"} active:brightness-125 motion-reduce:transition-none`}
          >
            <CosmicOrb state={frameState.orb} className="w-full" />
          </button>

          <span aria-hidden className="mt-1 inline-flex min-h-[32px] items-center gap-1 text-xs font-medium text-[var(--f-text-3)]">
            {expanded ? "Hide factors" : "Tap the sphere for the factors"}
            <ChevronDown
              className={`h-3.5 w-3.5 transition-transform duration-200 motion-reduce:transition-none ${expanded ? "rotate-180" : ""}`}
              strokeWidth={1.75}
            />
          </span>

          <div className="mt-3 w-full text-center">
            <p className="label">Your state</p>
            {memoryLoading ? (
              <div className="mt-2 flex flex-col items-center gap-2" role="status" aria-label="Reading your notes">
                <div className="h-10 w-40 rounded-[12px] bg-white/[0.06]" />
                <p className="text-sm text-[var(--f-text-3)]">Reading your notes</p>
              </div>
            ) : (
              <>
                <h1 className="punch punch-xl mt-1" title={frameState.source}>
                  {label}
                </h1>
                <p className="mx-auto mt-3 max-w-[28ch] text-[17px] leading-6 text-[var(--f-text-2)]">{STATE_CUE[label]}</p>
              </>
            )}
            {memoryError && (
              <div className="mt-3 flex justify-center">
                <Status tone="red" label="Couldn't load your notes" />
              </div>
            )}
          </div>

          {expanded && (
            <section
              id="state-factors"
              aria-label="What feeds this state"
              className="frame-rise glass mt-5 w-full px-5 pb-2 pt-4"
            >
              <h2 className="section-title">What feeds this state</h2>
              <p className="mt-1 text-sm leading-5 text-[var(--f-text-2)]">
                Only things FRAME actually holds. Nothing here is measured live.
              </p>
              <dl className="mt-2">
                <Factor
                  label="State"
                  value={label}
                  sub={memoryLoading ? undefined : `Based on: ${frameState.source}`}
                />
                <Factor
                  label="Recorded notes"
                  value={noteCount == null ? NO_DATA : noteCount === 0 ? NO_DATA : `${noteCount} ${noteCount === 1 ? "note" : "notes"}`}
                  sub={noteCount ? `The latest ${Math.min(12, noteCount)} are scanned for signal` : "State stays Dormant until FRAME has notes"}
                />
                <Factor
                  label="Today's check-in"
                  value={
                    checkin
                      ? `Sleep ${Math.round(checkin.sleep)} · Energy ${Math.round(checkin.energy)}`
                      : NO_DATA
                  }
                  sub={
                    checkin
                      ? `Soreness ${Math.round(checkin.soreness)} · Stress ${Math.round(checkin.stress)}`
                      : "Feeds readiness, not the state label"
                  }
                />
                <Factor
                  label="Last analysed session"
                  value={sessionScore != null ? `${sessionScore} / 100` : NO_DATA}
                  sub={sessionScore != null ? "Used for readiness when there is no check-in today" : undefined}
                />
                <Factor
                  label="Recent chat"
                  value={!hasSession ? NO_DATA : chatModifier === 0 ? "No change" : `${chatModifier > 0 ? "+" : "−"}${Math.abs(chatModifier)} readiness`}
                  sub={hasSession ? "Small adjustment (at most 10) from what you said" : undefined}
                />
                <Factor
                  label="Fight readiness"
                  value={readiness != null ? `${readiness} / 100` : NO_DATA}
                  sub={readiness != null ? `From ${readinessSource}` : undefined}
                />
              </dl>
              <div className="border-t border-[var(--f-hairline)] py-3">
                <p className="label">Coaching cue</p>
                <p className="mt-0.5 text-[15px] leading-snug text-foreground">{STATE_CUE[label]}</p>
              </div>
            </section>
          )}

          {/* Fight readiness - real, or an honest prompt */}
          <Link
            href={readiness != null && checkinScore != null ? "/home" : "/analyse"}
            className="glass mt-5 block w-full px-5 py-3 outline-none focus-visible:ring-2 focus-visible:ring-[var(--f-gold)]"
            aria-label={readiness != null ? "View readiness detail" : "Analyse a session"}
          >
            <div className="flex min-h-[44px] items-center justify-between gap-4">
              <span className="label">Fight readiness</span>
              {readiness != null ? (
                <span className="flex items-baseline gap-2">
                  <span className="numeral numeral-m">{readiness}</span>
                  <span className="tnum text-xs text-[var(--f-text-3)]">/ 100 &middot; {readinessSource}</span>
                </span>
              ) : checkinQuery.isLoading || analysesQuery.isLoading ? (
                <span className="text-sm text-[var(--f-text-3)]" role="status">Loading</span>
              ) : (
                <span className="flex items-center gap-1 text-sm font-medium text-[var(--f-gold)]">
                  Analyse a session
                  <ChevronRight className="h-4 w-4" strokeWidth={1.75} />
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
            aria-label={hasSession ? "Continue session" : "Start coaching"}
            className="btn-bronze mt-3 w-full outline-none focus-visible:ring-2 focus-visible:ring-[var(--f-gold-pale)]"
          >
            {hasSession ? "Continue coaching" : "Start coaching"}
          </Link>
        </div>
      </main>

      <div className="relative z-10 flex-none">
        <BottomNav />
      </div>
    </div>
  );
}
