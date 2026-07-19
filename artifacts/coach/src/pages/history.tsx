import { useMemo } from "react";
import { Link } from "wouter";
import { ChevronLeft, ChevronRight, Lock } from "lucide-react";
import { BottomNav } from "@/components/bottom-nav";
import { useMemory } from "@/hooks/use-memory";
import { useAnalyses } from "@/hooks/use-analysis";
import { useSubscription } from "@/hooks/use-subscription";
import { useFramePlus } from "@/components/frame-plus-modal";
import type { AthleteFact, FactCategory, AnalysisListItem } from "@/lib/api";

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

// Honest confidence read — five dots, filled to the recorded 1-5 value.
// Tooltip carries the real value and provenance source.
function ConfidenceDots({ value, source }: { value: number; source?: string }) {
  return (
    <div
      className="flex flex-none items-center gap-[3px]"
      title={`Confidence ${value}/5${source ? ` · ${source}` : ""}`}
      aria-label={`Confidence ${value} of 5`}
    >
      {[1, 2, 3, 4, 5].map((i) => (
        <span
          key={i}
          className={`w-1 h-1 rounded-full ${
            i <= value ? "bg-primary/80" : "bg-white/15"
          }`}
        />
      ))}
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
    for (const f of facts) bucketFor(f.createdAt).facts.push(f);

    const arr = [...map.values()].sort(
      (a, b) => b.date.getTime() - a.date.getTime(),
    );
    for (const day of arr) {
      day.analyses.sort((x, y) => (x.createdAt < y.createdAt ? 1 : -1));
      day.facts.sort((x, y) => (x.createdAt < y.createdAt ? 1 : -1));
    }
    return arr;
  }, [facts, analyses]);

  const isEmpty = !isLoading && days.length === 0;

  return (
    <div
      className="relative flex flex-col h-[100dvh] text-foreground font-sans overflow-hidden"
      style={{ background: "#000" }}
    >
      {/* Page-wide vignette — matches the flagship home atmosphere */}
      <div
        className="absolute inset-0 pointer-events-none z-0"
        style={{
          background:
            "radial-gradient(ellipse 95% 60% at 50% 30%, transparent 45%, rgba(0,0,0,0.55) 95%)",
        }}
      />

      {/* Ultra-fine grain — kills banding on the OLED black */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none opacity-[0.04] mix-blend-overlay z-0"
        aria-hidden
      >
        <filter id="frame-history-grain">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.9"
            numOctaves="2"
            stitchTiles="stitch"
          />
          <feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.5 0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#frame-history-grain)" />
      </svg>

      <header className="relative z-10 flex-none flex items-center justify-between px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 border-b border-border/60 bg-background/95 backdrop-blur-sm">
        <Link
          href="/home"
          className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft className="w-5 h-5" strokeWidth={1.5} />
          <span className="font-mono text-[10px] uppercase tracking-widest">Frame</span>
        </Link>
        <div className="font-sans font-extralight text-[13px] uppercase tracking-[0.45em] text-foreground/90">
          History
        </div>
        <div className="w-[74px]" aria-hidden />
      </header>

      <main className="relative z-10 flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-6 py-9">
          {/* Editorial intro */}
          <div className="mb-11 text-center">
            <div className="font-mono text-[10px] uppercase tracking-[0.5em] text-foreground/45">
              The record
            </div>
            <p className="mt-3 font-sans font-extralight text-[0.95rem] leading-relaxed text-foreground/60">
              Your sessions and what FRAME holds now, newest first.
            </p>
            <div
              className="mt-6 mx-auto max-w-[10rem] flex items-center gap-3 px-1"
              aria-hidden
            >
              <div
                className="flex-1 h-px"
                style={{
                  background:
                    "linear-gradient(to right, transparent, hsla(35,55%,55%,0.18))",
                }}
              />
              <div
                className="w-1 h-1 rounded-full"
                style={{ background: "hsla(35,55%,55%,0.22)" }}
              />
              <div
                className="flex-1 h-px"
                style={{
                  background:
                    "linear-gradient(to left, transparent, hsla(35,55%,55%,0.18))",
                }}
              />
            </div>
          </div>

          {isLoading ? (
            <div className="flex justify-center pt-16 text-muted-foreground font-mono text-xs uppercase tracking-widest">
              Loading record…
            </div>
          ) : isEmpty ? (
            <div className="flex flex-col items-center justify-center min-h-[45vh] gap-6 text-center px-4">
              <div className="font-mono text-[10px] uppercase tracking-[0.5em] text-foreground/45">
                No record yet
              </div>
              <p className="font-sans font-extralight text-lg leading-relaxed text-foreground/70 max-w-sm">
                The timeline fills as you train and FRAME records what it sees.
              </p>
            </div>
          ) : (
            <div className="relative">
              {/* Thin vertical rule threading every node */}
              <div
                aria-hidden
                className="absolute top-1 bottom-1 left-[7px] w-px"
                style={{
                  background:
                    "linear-gradient(to bottom, transparent, hsla(35,55%,55%,0.20) 10%, hsla(35,55%,55%,0.20) 90%, transparent)",
                }}
              />

              <div className="space-y-12">
                {days.map((day, di) => (
                  <section
                    key={day.key}
                    className="frame-timeline-in"
                    style={{ animationDelay: `${Math.min(di * 0.06, 0.5)}s` }}
                  >
                    {/* Day header */}
                    <div className="relative pl-8 mb-6">
                      <span
                        aria-hidden
                        className="absolute left-[1px] top-[3px] w-[13px] h-[13px] rounded-full border border-primary/50 flex items-center justify-center"
                        style={{ background: "#000" }}
                      >
                        <span
                          className="w-1 h-1 rounded-full"
                          style={{
                            background: "hsla(35,60%,56%,0.9)",
                            boxShadow: "0 0 8px hsla(35,65%,55%,0.55)",
                          }}
                        />
                      </span>
                      <h2 className="font-sans font-extralight uppercase text-[1.35rem] tracking-[0.3em] leading-none text-foreground/90">
                        {dayHeader(day.date)}
                      </h2>
                      {dayHeader(day.date) !== explicitDate(day.date) && (
                        <div className="mt-2 font-mono text-[9px] uppercase tracking-[0.5em] text-foreground/40">
                          {explicitDate(day.date)}
                        </div>
                      )}
                    </div>

                    <div className="space-y-6">
                      {/* Analysed sessions */}
                      {day.analyses.map((a) => (
                        <Link
                          key={`a-${a.id}`}
                          href="/analyse"
                          className="group relative block pl-8 outline-none focus-visible:ring-1 focus-visible:ring-primary/50 rounded-md"
                          aria-label={`View session analysis · ${a.styleProfile}`}
                        >
                          <span
                            aria-hidden
                            className="absolute left-[3px] top-[6px] w-[9px] h-[9px] rounded-full"
                            style={{
                              background: "hsla(35,60%,56%,0.85)",
                              boxShadow: "0 0 8px hsla(35,65%,55%,0.4)",
                            }}
                          />
                          <div className="font-mono text-[9px] uppercase tracking-[0.5em] text-foreground/45">
                            Analysed session
                          </div>
                          <div className="mt-1.5 flex items-baseline justify-between gap-4">
                            <div className="font-sans font-extralight text-[1.05rem] tracking-wide leading-snug text-foreground/90 group-hover:text-primary/90 transition-colors">
                              {a.styleProfile}
                            </div>
                            <ChevronRight
                              className="flex-none w-3.5 h-3.5 text-foreground/30 group-hover:text-primary/80 transition-colors"
                              strokeWidth={1.5}
                            />
                          </div>
                          <div className="mt-2 flex items-baseline gap-2">
                            <span className="font-mono text-[9px] uppercase tracking-[0.4em] text-foreground/45">
                              Session score
                            </span>
                            <span className="font-sans font-light text-[17px] tabular-nums leading-none text-primary/90">
                              {Math.round(a.sessionScore ?? 0)}
                            </span>
                          </div>
                        </Link>
                      ))}

                      {/* FRAME noticed — facts recorded that day */}
                      {day.facts.length > 0 && (
                        <div className="relative pl-8">
                          <span
                            aria-hidden
                            className="absolute left-[3px] top-[6px] w-[9px] h-[9px] rounded-full"
                            style={{
                              background: "hsla(35,60%,56%,0.85)",
                              boxShadow: "0 0 8px hsla(35,65%,55%,0.4)",
                            }}
                          />
                          <div className="flex items-baseline justify-between gap-3">
                            <div className="font-mono text-[9px] uppercase tracking-[0.5em] text-primary/70">
                              FRAME noticed
                            </div>
                            {day.facts.length > 1 && (
                              <div className="flex-none font-mono text-[9px] uppercase tracking-[0.3em] text-foreground/40">
                                {day.facts.length} observations
                              </div>
                            )}
                          </div>

                          {modelLocked ? (
                            <button
                              type="button"
                              onClick={() => openUpgrade("athlete_model")}
                              className="mt-4 w-full flex items-center justify-between gap-3 border-l border-white/[0.08] pl-3.5 py-2 text-left group"
                            >
                              <span className="flex items-center gap-2.5 min-w-0">
                                <Lock className="h-3.5 w-3.5 flex-none text-foreground/40" strokeWidth={1.5} />
                                <span className="text-[0.85rem] text-foreground/55 leading-relaxed">
                                  {day.facts.length} observation{day.facts.length === 1 ? "" : "s"} recorded — the full model is FRAME+
                                </span>
                              </span>
                              <span className="flex-none font-mono text-[9px] uppercase tracking-[0.3em] text-primary/80 group-hover:text-primary transition-colors">
                                FRAME+
                              </span>
                            </button>
                          ) : (
                            <div className="mt-4 space-y-4">
                              {day.facts.map((f) => (
                                <div
                                  key={`f-${f.id}`}
                                  className="border-l border-white/[0.08] pl-3.5"
                                >
                                  <div className="flex items-baseline justify-between gap-3 mb-1">
                                    <div className="font-mono text-[9px] uppercase tracking-[0.3em] text-primary/80 truncate">
                                      {CATEGORY_LABELS[f.category]}
                                    </div>
                                    <ConfidenceDots value={f.confidence} source={f.source} />
                                  </div>
                                  <div className="text-[0.95rem] leading-relaxed text-foreground/90">
                                    {f.content}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </section>
                ))}
              </div>
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
          animation: frame-timeline-in 0.7s cubic-bezier(0.22, 0.61, 0.36, 1) both;
        }
        @media (prefers-reduced-motion: reduce) {
          .frame-timeline-in { animation: none; }
        }
      `}</style>
    </div>
  );
}
