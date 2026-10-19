import { useState } from "react";
import { Link, useLocation } from "wouter";
import { ArrowUpRight, ChevronDown, ChevronRight, Lock } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { CosmicOrb, type OrbState } from "@/components/cosmic-orb";
import { FramePlusPill } from "@/components/frame-plus-modal";
import { FrameWordmark } from "@/components/frame-wordmark";
import { BottomNav } from "@/components/bottom-nav";
import { Status } from "@/components/frame-ui";
import { DisclosureNotice } from "@/components/today-cards";
import { ReadinessBars } from "@/components/readiness-bars";
import { useFighter } from "@/hooks/use-fighter";
import { useAutoWelcome } from "@/hooks/use-auto-welcome";
import { useAnalyses } from "@/hooks/use-analysis";
import { useCheckinHistory } from "@/hooks/use-checkin";
import { useSubscription } from "@/hooks/use-subscription";
import { useToday } from "@/hooks/use-today";
import { api } from "@/lib/api";
import { formatDay } from "@/lib/local-day";
import { STATE_TIPS, stateTipPrompt } from "@/lib/state-tips";
import { stateDateLine, stateHeadline } from "@/lib/today";
import { readinessModifier, applyReadinessModifier } from "@/lib/readiness-modifier";

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
  const [, setLocation] = useLocation();
  const { data: fighterData } = useFighter();
  const fighter = fighterData?.fighter ?? null;

  useAutoWelcome();
  const [expanded, setExpanded] = useState(false);
  const [openDate, setOpenDate] = useState<string | null>(null);

  // State, Today's Focus and readiness for the athlete's local day (the server decides what "today" is).
  const todayQuery = useToday();
  const today = todayQuery.data ?? null;
  const state = today?.state ?? null;
  const current = !!state?.current && !!state.name;
  const stateName = current ? state!.name! : null;
  const orb: OrbState = (stateName ?? "Dormant").toLowerCase() as OrbState;
  const loading = todayQuery.isLoading;

  const memoryQuery = useQuery({
    queryKey: ["memory"],
    queryFn: api.getMemory,
    enabled: !!fighter,
  });
  const noteCount = memoryQuery.data?.facts?.length ?? null;

  const analysesQuery = useAnalyses();
  const latest = analysesQuery.data?.analyses?.find((a) => !a.locked && a.sessionScore != null) ?? null;
  const sessionScore = latest?.sessionScore != null ? Math.round(latest.sessionScore) : null;

  // Readiness is TODAY's check-in. An older check-in is shown dated, never as today's number.
  const checkin = today?.readiness.today?.checkin ?? null;
  const checkinScore = today?.readiness.today?.score ?? null;
  const lastCheckin = today?.readiness.latest ?? null;

  const conversationQuery = useQuery({
    queryKey: ["conversation"],
    queryFn: () => api.getActiveConversation(),
    enabled: !!fighter,
  });
  const messages = conversationQuery.data?.messages ?? [];
  const hasSession = messages.length > 0;
  const chatModifier = readinessModifier(messages);
  const readiness = applyReadinessModifier(checkinScore, chatModifier);

  // FRAME+: tappable readiness history.
  const { isFramePlus } = useSubscription();
  const historyQuery = useCheckinHistory(isFramePlus);
  const historyCheckins = historyQuery.data?.checkins ?? [];

  const toggle = () => setExpanded((v) => !v);
  const goCheckIn = () => setLocation("/home?checkin=1");
  const dateLine = state ? stateDateLine(state, formatDay) : null;

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
        <FramePlusPill />
      </header>

      <main className="relative z-10 min-h-0 flex-1 overflow-y-auto">
        <div className="relative z-10 mx-auto flex w-full max-w-md flex-col items-center px-5 pb-6 pt-2">
          {/* Orb = button. idle -> pressed (scale .98 + brightness) -> expanded (factors panel) */}
          <button
            type="button"
            onClick={toggle}
            aria-expanded={expanded}
            aria-controls="state-factors"
            aria-label={`${stateName ?? "No"} state. ${expanded ? "Hide" : "Show"} what feeds this state.`}
            style={expanded ? { marginBottom: "calc(min(66vw, 280px) * -0.42)" } : undefined}
            className={`group relative w-[min(66vw,280px)] origin-top rounded-full outline-none transition-[transform,filter] duration-[220ms] ease-out hover:brightness-110 focus-visible:ring-2 focus-visible:ring-[var(--f-gold)] focus-visible:ring-offset-4 focus-visible:ring-offset-[var(--f-bg)] ${expanded ? "scale-[0.58] active:scale-[0.56]" : "active:scale-[0.98]"} active:brightness-125 motion-reduce:transition-none`}
          >
            <CosmicOrb state={orb} className="w-full" />
          </button>

          <span aria-hidden className="mt-1 inline-flex min-h-[32px] items-center gap-1 text-xs font-medium text-[var(--f-text-3)]">
            {expanded ? "Hide factors" : "Tap the sphere for the factors"}
            <ChevronDown
              className={`h-3.5 w-3.5 transition-transform duration-200 motion-reduce:transition-none ${expanded ? "rotate-180" : ""}`}
              strokeWidth={1.75}
            />
          </span>

          <div className="mt-3 w-full text-center">
            <p className="label tnum">{dateLine ?? "Your state"}</p>
            {loading ? (
              <div className="mt-2 flex flex-col items-center gap-2" role="status" aria-label="Reading your day">
                <div className="h-10 w-40 rounded-[12px] bg-white/[0.06]" />
                <p className="text-sm text-[var(--f-text-3)]">Reading your day</p>
              </div>
            ) : todayQuery.isError ? (
              <div className="mt-3 flex flex-col items-center gap-3">
                <Status tone="red" label="Couldn't load your state" />
                <button type="button" className="btn-quiet" onClick={() => void todayQuery.refetch()}>
                  Try again
                </button>
              </div>
            ) : (
              <>
                <h1 className={`punch punch-xl mt-1 ${current ? "" : "!text-[var(--f-text-3)]"}`} title={state?.source}>
                  {state ? stateHeadline(state) : "No read yet"}
                </h1>
                {current && state?.source && (
                  <p className="mt-1 text-sm text-[var(--f-text-2)]">Read from {state.source}.</p>
                )}
                {!current && state?.name && (
                  <p className="mt-1 text-sm text-[var(--f-text-2)]">
                    Last read: {state.name}, {state.asOf ? formatDay(state.asOf) : ""}. Not today&apos;s state.
                  </p>
                )}

                {today && (
                  <div className="mt-4">
                    <DisclosureNotice disclosure={today.disclosure} onCheckIn={goCheckIn} />
                  </div>
                )}

                {stateName && (
                  <Link
                    href={`/chat?prefill=${encodeURIComponent(stateTipPrompt(stateName))}&n=${Date.now()}`}
                    aria-label={`Tip: ${STATE_TIPS[stateName].tip} ${STATE_TIPS[stateName].why} Opens your coach with this tip ready to send.`}
                    className="glass mt-4 block w-full px-4 py-4 text-left outline-none transition-colors hover:bg-white/[0.04] active:bg-white/[0.06] focus-visible:ring-2 focus-visible:ring-[var(--f-gold)] motion-reduce:transition-none"
                  >
                    <span className="flex items-center justify-between">
                      <span className="eyebrow">Tip</span>
                      <ArrowUpRight className="h-4 w-4 text-[var(--f-text-2)]" strokeWidth={1.75} aria-hidden />
                    </span>
                    <span className="mt-1.5 block text-[18px] font-semibold leading-[1.4] tracking-[-0.01em] text-foreground">
                      {STATE_TIPS[stateName].tip}
                    </span>
                    <span className="mt-1.5 block text-sm leading-5 text-[var(--f-text-2)]">{STATE_TIPS[stateName].why}</span>
                  </Link>
                )}
              </>
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
                  value={stateName ?? NO_DATA}
                  sub={current && state ? `Read from ${state.source}, ${formatDay(state.asOf!)}` : "FRAME has nothing from you today, so it is not reading a state."}
                />
                <Factor
                  label="Recorded notes"
                  value={noteCount == null ? NO_DATA : noteCount === 0 ? NO_DATA : `${noteCount} ${noteCount === 1 ? "note" : "notes"}`}
                  sub={noteCount ? "Recent notes feed the state; older ones fade" : undefined}
                />
                <Factor
                  label="Today's check-in"
                  value={checkin ? `Sleep ${Math.round(checkin.sleep)} · Energy ${Math.round(checkin.energy)}` : NO_DATA}
                  sub={
                    checkin
                      ? `Soreness ${Math.round(100 - checkin.soreness)} · Stress ${Math.round(100 - checkin.stress)} (100 = most)`
                      : lastCheckin
                        ? `Last check-in ${formatDay(lastCheckin.date)}, not today`
                        : undefined
                  }
                />
                <Factor
                  label="Last analysed session"
                  value={sessionScore != null ? `${sessionScore} / 100` : NO_DATA}
                />
                <Factor
                  label="Recent chat"
                  value={!hasSession || !checkin ? NO_DATA : chatModifier === 0 ? "No change" : `${chatModifier > 0 ? "+" : "−"}${Math.abs(chatModifier)} readiness`}
                  sub={hasSession && checkin ? "Small adjustment (at most 10) from what you said" : undefined}
                />
                <Factor
                  label="Fight readiness"
                  value={readiness != null ? `${readiness} / 100` : NO_DATA}
                  sub={readiness != null ? "From today's check-in" : undefined}
                />
              </dl>
              {stateName && (
                <div className="border-t border-[var(--f-hairline)] py-3">
                  <p className="label">Coaching cue</p>
                  <p className="mt-0.5 text-[15px] leading-snug text-foreground">{STATE_TIPS[stateName].tip}</p>
                </div>
              )}
            </section>
          )}

          {/* Fight readiness: today's number, or the last one clearly dated */}
          <button
            type="button"
            onClick={goCheckIn}
            className="glass mt-5 block w-full px-5 py-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-[var(--f-gold)]"
            aria-label={readiness != null ? "Fight readiness from today's check-in. Update it" : "No check-in today. Log one"}
          >
            <div className="flex min-h-[44px] items-center justify-between gap-4">
              <span className="label">Fight readiness</span>
              {readiness != null ? (
                <span className="flex items-baseline gap-2">
                  <span className="numeral numeral-m">{readiness}</span>
                  <span className="tnum text-xs text-[var(--f-text-3)]">/ 100 &middot; today&apos;s check-in</span>
                </span>
              ) : loading ? (
                <span className="text-sm text-[var(--f-text-3)]" role="status">Loading</span>
              ) : (
                <span className="flex items-center gap-1 text-sm font-medium text-[var(--f-gold)]">
                  {lastCheckin ? `Last: ${lastCheckin.score} on ${formatDay(lastCheckin.date)}` : "Log a check-in"}
                  <ChevronRight className="h-4 w-4" strokeWidth={1.75} />
                </span>
              )}
            </div>
            {readiness != null && (
              <div className="bar-thin mt-1" aria-hidden>
                <span style={{ width: `${Math.max(0, Math.min(100, readiness))}%` }} />
              </div>
            )}
          </button>

          {/* Check-in history: select a bar to open that day */}
          <section className="glass mt-3 w-full px-5 py-4" aria-label="Check-in history">
            <h2 className="text-[1.0625rem] font-semibold text-foreground">Check-in history</h2>
            {isFramePlus ? (
              historyQuery.isLoading ? (
                <p className="mt-2 text-sm text-[var(--f-text-3)]" role="status">Loading your check-ins…</p>
              ) : historyQuery.isError ? (
                <p className="mt-2 text-sm text-[var(--f-text-3)]">Couldn&apos;t load your history. Try again later.</p>
              ) : historyCheckins.length === 0 ? (
                <p className="mt-2 text-sm text-[var(--f-text-3)]">No check-ins in the last 30 days. Log one to start your history.</p>
              ) : (
                <div className="mt-3.5">
                  <ReadinessBars checkins={historyCheckins} today={today?.date ?? ""} selected={openDate} onSelect={setOpenDate} />
                  {openDate == null && <p className="mt-2.5 text-[0.8125rem] text-[var(--f-text-3)]">Select a day to open that check-in.</p>}
                </div>
              )
            ) : (
              <Link href="/home" className="mt-2 flex min-h-[44px] items-center justify-between gap-3 text-sm text-[var(--f-text-2)]">
                <span className="flex items-center gap-2"><Lock className="h-4 w-4" strokeWidth={1.5} aria-hidden /> See past check-ins</span>
                <span className="font-medium text-[var(--f-gold)]">FRAME+</span>
              </Link>
            )}
          </section>

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
