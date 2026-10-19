import { useMemo } from "react";
import { Link } from "wouter";
import { ChevronLeft, ChevronRight, Lock } from "lucide-react";
import { BottomNav } from "@/components/bottom-nav";
import { useMemory } from "@/hooks/use-memory";
import { useAnalyses } from "@/hooks/use-analysis";
import { useSubscription } from "@/hooks/use-subscription";
import { useFramePlus } from "@/components/frame-plus-modal";
import type { AthleteFact, FactCategory, AnalysisListItem } from "@/lib/api";
import { factLastSeen, observationPrompt } from "@/lib/fact-seen";

// Local, self-owned label map — human-readable names for each fact category.
const CATEGORY_LABELS: Record<FactCategory, string> = {
  weakness: "Weakness",
  strength: "Strength",
  technical_knowledge: "Technical knowledge",
  pattern: "Recurring pattern",
  preference: "Coaching preference",
  goal: "Active goal",
  event: "Event",
  context: "Life context",
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

// Local calendar-day key (YYYY-MM-DD) so entries bucket by the athlete's day.
function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

// "Mon 30 Jun" — always available; used as the explicit far-date header.
function explicitDate(d: Date): string {
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

// Relative day header: "Today", "Yesterday", else the explicit date.
function dayHeader(d: Date): string {
  const diff = Math.round(
    (startOfDay(new Date()).getTime() - startOfDay(d).getTime()) / 86_400_000,
  );
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return explicitDate(d);
}

type DayBucket = {
  key: string;
  date: Date;
  analyses: AnalysisListItem[];
  facts: AthleteFact[];
};

// Honest confidence read: thin bar plus a text label, real recorded 1-5 value.
function ConfidenceBar({ value, source }: { value: number; source?: string }) {
  return (
    <div
      className="flex flex-none items-center gap-2"
      title={`Confidence ${value} of 5${source ? ` · ${source}` : ""}`}
    >
      <div className="bar-thin w-10" aria-hidden>
        <span style={{ width: `${(Math.max(0, Math.min(5, value)) / 5) * 100}%` }} />
      </div>
      <span className="label tnum">{value} of 5</span>
    </div>
  );
}

export default function HistoryPage() {
  const memoryQuery = useMemory(true);
  const analysesQuery = useAnalyses();
  const { isFramePlus, isLoading: subLoading } = useSubscription();
  const { openUpgrade } = useFramePlus();
  // Full observation history is part of the FRAME+ athlete model.
  const modelLocked = !subLoading && !isFramePlus;

  const facts = memoryQuery.data?.facts ?? [];
  // Locked stubs (free tier) carry no real data and their detail routes 402 —
  // keep the history timeline to sessions this athlete can actually open.
  const analyses = (analysesQuery.data?.analyses ?? []).filter(
    (a) => !a.locked && a.sessionScore != null,
  );
  const isLoading = memoryQuery.isLoading || analysesQuery.isLoading;

  const days = useMemo<DayBucket[]>(() => {
    const map = new Map<string, DayBucket>();
    const bucketFor = (iso: string): DayBucket => {
      const d = new Date(iso);
      const key = dayKey(d);
      let bucket = map.get(key);
      if (!bucket) {
        bucket = { key, date: startOfDay(d), analyses: [], facts: [] };
        map.set(key, bucket);
      }
      return bucket;
    };

    for (const a of analyses) bucketFor(a.createdAt).analyses.push(a);
    for (const f of facts) bucketFor(factLastSeen(f)).facts.push(f);

    const arr = [...map.values()].sort(
      (a, b) => b.date.getTime() - a.date.getTime(),
    );
    for (const day of arr) {
      day.analyses.sort((x, y) => (x.createdAt < y.createdAt ? 1 : -1));
      day.facts.sort((x, y) => (factLastSeen(x) < factLastSeen(y) ? 1 : -1));
    }
    return arr;
  }, [facts, analyses]);

  const isEmpty = !isLoading && days.length === 0;

  const hasError = memoryQuery.isError || analysesQuery.isError;

  return (
    <div className="relative flex flex-col h-[100dvh] text-foreground font-sans overflow-hidden">
      <header className="relative z-10 flex-none flex items-center justify-between px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-3">
        <Link
          href="/home"
          aria-label="Back to home"
          className="icon-round text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft className="w-5 h-5" strokeWidth={1.5} />
        </Link>
        <h1 className="display-heading">History</h1>
        <div className="w-11" aria-hidden />
      </header>

      <main className="relative z-10 flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-5 py-6">
          <p className="mb-8 text-[1rem] leading-[1.6] text-muted-foreground">
            Your sessions and what FRAME holds now, newest first.
          </p>

          {isLoading ? (
            <div className="flex flex-col items-center gap-3 pt-16 text-[0.9375rem] text-muted-foreground" role="status">
              <span className="h-5 w-5 rounded-full border-2 border-white/15 border-t-[#B9A477] animate-spin motion-reduce:animate-none" aria-hidden />
              Loading your record
            </div>
          ) : hasError ? (
            <div role="alert" className="glass glass-red px-5 py-5 space-y-3">
              <div className="text-[1rem] font-medium text-[#E5645A]">Could not load your history</div>
              <p className="text-[0.9375rem] text-foreground/80">Check your connection and try again.</p>
              <button
                type="button"
                onClick={() => {
                  void memoryQuery.refetch();
                  void analysesQuery.refetch();
                }}
                className="btn-quiet btn-quiet-red"
              >
                Try again
              </button>
            </div>
          ) : isEmpty ? (
            <div className="glass px-5 py-8">
              <h2 className="section-title">No record yet</h2>
              <p className="mt-2 text-[1rem] leading-[1.6] text-muted-foreground max-w-sm">
                The timeline fills as you train and FRAME records what it sees. Start with a
                conversation or a clip.
              </p>
              <div className="mt-5 flex flex-col sm:flex-row gap-3">
                <Link href="/chat" className="btn-bronze">
                  Talk to your coach
                </Link>
                <Link href="/analyse" className="btn-glass">
                  Analyse a clip
                </Link>
              </div>
            </div>
          ) : (
            <div className="space-y-10">
              {days.map((day, di) => (
                <section
                  key={day.key}
                  className="frame-timeline-in"
                  style={{ animationDelay: `${Math.min(di * 0.04, 0.3)}s` }}
                >
                  <div className="mb-3 flex items-baseline gap-3">
                    <h2 className="section-title !text-[1.25rem]">{dayHeader(day.date)}</h2>
                    {dayHeader(day.date) !== explicitDate(day.date) && (
                      <div className="label tnum">{explicitDate(day.date)}</div>
                    )}
                  </div>

                  <div className="space-y-3">
                    {/* Analysed sessions */}
                    {day.analyses.map((a) => (
                      <Link
                        key={`a-${a.id}`}
                        href="/analyse"
                        className="glass group flex items-center justify-between gap-4 p-4 outline-none transition-colors hover:border-white/20"
                        aria-label={`View session analysis: ${a.styleProfile}`}
                      >
                        <div className="min-w-0">
                          <div className="label">Analysed session</div>
                          <div className="mt-1 text-[1.0625rem] font-medium leading-snug text-foreground">
                            {a.styleProfile}
                          </div>
                        </div>
                        <div className="flex flex-none items-center gap-3">
                          <div className="text-right">
                            <div className="numeral numeral-m !text-[1.75rem] !text-[#D4C7A3]">
                              {Math.round(a.sessionScore ?? 0)}
                            </div>
                            <div className="label -mt-0.5">score</div>
                          </div>
                          <ChevronRight
                            className="w-5 h-5 text-muted-foreground group-hover:text-[#B9A477] transition-colors"
                            strokeWidth={1.5}
                          />
                        </div>
                      </Link>
                    ))}

                    {/* FRAME noticed: facts recorded that day */}
                    {day.facts.length > 0 && (
                      <div className="glass p-4">
                        <div className="flex items-baseline justify-between gap-3">
                          <h3 className="text-[1rem] font-semibold text-[#D4C7A3]">FRAME noticed</h3>
                          {day.facts.length > 1 && (
                            <div className="label tnum flex-none">{day.facts.length} observations</div>
                          )}
                        </div>

                        {modelLocked ? (
                          <button
                            type="button"
                            onClick={() => openUpgrade("athlete_model")}
                            className="mt-3 w-full min-h-[44px] flex items-center justify-between gap-3 text-left"
                          >
                            <span className="flex items-center gap-2.5 min-w-0">
                              <Lock className="h-4 w-4 flex-none text-muted-foreground" strokeWidth={1.5} />
                              <span className="text-[0.9375rem] text-muted-foreground leading-[1.55]">
                                {day.facts.length} observation{day.facts.length === 1 ? "" : "s"} recorded. The full model is FRAME+.
                              </span>
                            </span>
                            <span className="chip chip-gold flex-none">FRAME+</span>
                          </button>
                        ) : (
                          <div className="mt-2">
                            {day.facts.map((f) => (
                              <Link
                                key={`f-${f.id}`}
                                href={`/chat?prefill=${encodeURIComponent(observationPrompt(f, CATEGORY_LABELS[f.category]))}&n=${f.id}`}
                                aria-label={`${CATEGORY_LABELS[f.category]}: ${f.content}, ${dayHeader(day.date)}. Discuss this with your coach`}
                                className="group -mx-2 block rounded-[12px] border-t border-white/[0.06] px-2 py-3 outline-none transition-colors first:border-t-0 hover:bg-white/[0.04] focus-visible:ring-2 focus-visible:ring-[var(--f-gold)]"
                              >
                                <div className="flex items-baseline justify-between gap-3 mb-1">
                                  <div className="label truncate">{CATEGORY_LABELS[f.category]}</div>
                                  <ConfidenceBar value={f.confidence} source={f.source} />
                                </div>
                                <div className="flex items-start justify-between gap-3">
                                  <div className="text-[1rem] leading-[1.55] text-foreground/90">{f.content}</div>
                                  <ChevronRight className="mt-1 h-4 w-4 flex-none text-[var(--f-text-3)] transition-colors group-hover:text-foreground" strokeWidth={1.75} aria-hidden />
                                </div>
                              </Link>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>
      </main>

      <div className="relative z-10">
        <BottomNav />
      </div>

      <style>{`
        @keyframes frame-timeline-in {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .frame-timeline-in {
          animation: frame-timeline-in 0.3s cubic-bezier(0.2, 0, 0, 1) both;
        }
        @media (prefers-reduced-motion: reduce) {
          .frame-timeline-in { animation: none; }
        }
      `}</style>
    </div>
  );
}
