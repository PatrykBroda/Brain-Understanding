import { useState } from "react";
import { Link } from "wouter";
import { ChevronLeft, HelpCircle, RefreshCcw, X } from "lucide-react";
import { BottomNav } from "@/components/bottom-nav";
import { FrameOctagon } from "@/components/frame-octagon";
import { useFighter } from "@/hooks/use-fighter";
import {
  usePlanner,
  useRegeneratePlanner,
  useTogglePlannerItem,
} from "@/hooks/use-planner";
import type { PlanCategory, PlanItem } from "@/lib/api";

const CATEGORY_ORDER: PlanCategory[] = ["fix", "train", "technique", "regulate", "goal_step"];

const CATEGORY_LABEL: Record<PlanCategory, string> = {
  fix: "Fix",
  train: "Train",
  technique: "Technique",
  regulate: "Regulate",
  goal_step: "Goal step",
};

const CATEGORY_HINT: Record<PlanCategory, string> = {
  fix: "Weaknesses you've named",
  train: "Mat time + conditioning",
  technique: "Drills on weak topics",
  regulate: "Nervous-system work",
  goal_step: "One step toward a stated goal",
};

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

function formatWeekRange(weekStartIso: string) {
  const start = new Date(weekStartIso);
  const end = new Date(start.getTime() + 6 * 24 * 60 * 60 * 1000);
  const fmt = (d: Date) =>
    `${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
  return `${fmt(start)} — ${fmt(end)}`;
}

function todayIndex(weekStartIso: string): number {
  // 0=Mon..6=Sun, relative to the plan's weekStart (ISO Monday UTC)
  const start = new Date(weekStartIso).getTime();
  const now = Date.now();
  const diffDays = Math.floor((now - start) / (24 * 60 * 60 * 1000));
  if (diffDays < 0 || diffDays > 6) return -1;
  return diffDays;
}

export default function PlannerPage() {
  const { data: fighterData } = useFighter();
  const fighter = fighterData?.fighter ?? null;
  const planner = usePlanner();
  const regen = useRegeneratePlanner();
  const toggle = useTogglePlannerItem();
  const [help, setHelp] = useState(false);

  const plan = planner.data?.plan ?? null;
  const completions = new Set(planner.data?.completions ?? []);
  const weekStart = planner.data?.weekStart ?? new Date().toISOString();
  const todayIdx = todayIndex(weekStart);

  const grouped: Record<PlanCategory, PlanItem[]> = {
    fix: [],
    train: [],
    technique: [],
    regulate: [],
    goal_step: [],
  };
  if (plan) {
    for (const item of plan.items) grouped[item.category].push(item);
  }

  return (
    <div className="flex flex-col h-[100dvh] bg-background text-foreground">
      <header className="flex-none flex items-center justify-between px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-3 border-b border-border/40">
        <Link href="/" className="text-muted-foreground hover:text-foreground transition-colors">
          <ChevronLeft className="w-5 h-5" strokeWidth={1.5} />
        </Link>
        <div className="text-center">
          <div className="font-mono text-[9px] uppercase tracking-[0.35em] text-muted-foreground">
            This week
          </div>
          <div className="font-mono text-sm uppercase tracking-[0.3em] text-foreground/95 mt-0.5">
            Planner
          </div>
        </div>
        <button
          type="button"
          onClick={() => setHelp(true)}
          className="text-muted-foreground hover:text-foreground transition-colors"
          aria-label="How the planner works"
        >
          <HelpCircle className="w-5 h-5" strokeWidth={1.5} />
        </button>
      </header>

      <main className="flex-1 overflow-y-auto">
        <div className="max-w-md mx-auto px-5 py-6 space-y-6 pb-10">
          <section className="flex items-baseline justify-between">
            <div>
              <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
                {fighter?.name ?? "Athlete"}
              </div>
              <div className="font-mono text-[11px] uppercase tracking-widest text-foreground/85 mt-1">
                {formatWeekRange(weekStart)}
              </div>
            </div>
            <button
              type="button"
              onClick={() => regen.mutate()}
              disabled={regen.isPending}
              className="font-mono text-[10px] uppercase tracking-widest border border-border/60 px-3 py-2 text-foreground/80 hover:text-foreground hover:border-primary/50 transition-colors disabled:opacity-40 flex items-center gap-1.5"
            >
              {regen.isPending ? (
                <>
                  <FrameOctagon size={14} spin spinSeconds={3} glow={false} />
                  Generating
                </>
              ) : (
                <>
                  <RefreshCcw className="w-3 h-3" strokeWidth={1.5} />
                  {plan ? "Regenerate" : "Generate"}
                </>
              )}
            </button>
          </section>

          <section
            aria-label="This week's days, today highlighted"
            className="grid grid-cols-7 gap-1"
          >
            {DAY_LABELS.map((label, idx) => {
              const isToday = idx === todayIdx;
              return (
                <div
                  key={label}
                  className={`text-center py-1.5 border ${
                    isToday
                      ? "border-primary/70 bg-primary/10 text-primary"
                      : "border-border/40 text-muted-foreground/80"
                  }`}
                >
                  <div className="font-mono text-[9px] uppercase tracking-widest">{label}</div>
                  {isToday && (
                    <div className="font-mono text-[8px] uppercase tracking-widest mt-0.5">
                      Today
                    </div>
                  )}
                </div>
              );
            })}
          </section>

          {regen.isError && (
            <div className="border border-destructive/40 bg-destructive/10 px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-destructive/90">
              {(regen.error as Error).message || "generation failed"}
            </div>
          )}

          {planner.isLoading ? (
            <div className="text-muted-foreground font-mono text-[10px] uppercase tracking-widest py-10 text-center">
              Loading
            </div>
          ) : !plan ? (
            <div className="border border-border/40 p-5 space-y-3">
              <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
                No plan for this week yet
              </div>
              <p className="text-sm text-foreground/85 leading-relaxed">
                The planner reads your accumulated model, recent calibrations, and chat signals,
                then drafts 5-7 actions for the next 7 days. Every item cites the recorded signal
                it came from. No padding, no streaks, no fake biometrics — only what the system
                can actually see.
              </p>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Generate when you're ready. Regenerate any time the picture shifts.
              </p>
            </div>
          ) : (
            <>
              {plan.rationale && (
                <div className="border-l-2 border-primary/60 pl-4 py-1">
                  <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-primary/85 mb-1.5">
                    This week
                  </div>
                  <p className="text-sm text-foreground/90 leading-relaxed">{plan.rationale}</p>
                </div>
              )}

              <div className="space-y-7">
                {CATEGORY_ORDER.map((cat) => {
                  const items = grouped[cat];
                  return (
                    <section key={cat} className="space-y-3">
                      <div className="flex items-baseline justify-between border-b border-border/40 pb-1.5">
                        <div className="font-mono text-[11px] uppercase tracking-[0.3em] text-foreground/95">
                          {CATEGORY_LABEL[cat]}
                        </div>
                        <div className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground/80">
                          {CATEGORY_HINT[cat]}
                        </div>
                      </div>
                      {items.length === 0 ? (
                        <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground/70 px-1 py-2">
                          no anchoring signal yet — keep talking to the coach
                        </div>
                      ) : (
                        items.map((item) => (
                          <PlanItemCard
                            key={item.key}
                            item={item}
                            done={completions.has(item.key)}
                            disabled={toggle.isPending}
                            onToggle={(done) =>
                              toggle.mutate({ key: item.key, completed: done })
                            }
                          />
                        ))
                      )}
                    </section>
                  );
                })}
              </div>

              <div className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground/70 pt-2 border-t border-border/30">
                last built {new Date(plan.createdAt).toLocaleString(undefined, {
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}{" "}
                · via {plan.aiProvider}
              </div>
            </>
          )}
        </div>
      </main>

      <BottomNav />

      {help && <HelpOverlay onClose={() => setHelp(false)} />}
    </div>
  );
}

function PlanItemCard({
  item,
  done,
  disabled,
  onToggle,
}: {
  item: PlanItem;
  done: boolean;
  disabled: boolean;
  onToggle: (done: boolean) => void;
}) {
  return (
    <div
      className={`border px-4 py-3 transition-colors ${
        done ? "border-primary/40 bg-primary/[0.04]" : "border-border/60"
      }`}
    >
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={() => onToggle(!done)}
          disabled={disabled}
          aria-pressed={done}
          aria-label={done ? "Mark not done" : "Mark done"}
          className={`flex-none mt-0.5 w-5 h-5 border flex items-center justify-center transition-colors ${
            done
              ? "border-primary bg-primary/20 text-primary"
              : "border-border hover:border-primary/60 text-transparent hover:text-primary/40"
          }`}
        >
          <svg viewBox="0 0 20 20" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M4 10.5 L8 14.5 L16 6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline justify-between gap-3 mb-1">
            <div className={`text-[0.95rem] leading-snug ${done ? "text-foreground/55 line-through decoration-1" : "text-foreground/95"}`}>
              {item.title}
            </div>
            <div className="flex-none font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
              {item.suggestedDays}
            </div>
          </div>
          <p className={`text-sm leading-relaxed ${done ? "text-muted-foreground/70" : "text-foreground/80"}`}>
            {item.detail}
          </p>
          <div
            className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground/85 mt-2"
            title={[
              item.sourceFactIds.length ? `fact ids: ${item.sourceFactIds.join(", ")}` : "",
              item.sourceCalibrationKeys.length
                ? `calibrations: ${item.sourceCalibrationKeys.join(", ")}`
                : "",
            ]
              .filter(Boolean)
              .join(" · ")}
          >
            source · {item.sourceLabel}
          </div>
        </div>
      </div>
    </div>
  );
}

function HelpOverlay({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="relative max-w-md w-full bg-background border border-border/60 p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute top-3 right-3 text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="w-4 h-4" strokeWidth={1.5} />
        </button>
        <div className="font-mono text-[10px] uppercase tracking-[0.35em] text-muted-foreground">
          How the planner works
        </div>
        <div className="space-y-3 text-sm text-foreground/85 leading-relaxed">
          <p>
            One plan per week. 5-7 actions for the next 7 days, grouped into Fix, Train,
            Technique, Regulate, and Goal step. Empty categories say so — the system never
            invents items to fill them.
          </p>
          <p>
            Every item is drawn from a real recorded signal — a fact in your athlete model, or a
            calibration answer. The source line under each item names where it came from. The
            suggested-days label is the system's best guess given your recorded training
            frequency, not a prescription.
          </p>
          <p>
            Marking an item done writes a low-confidence pattern into your model so the next plan
            knows what you actually executed. Un-marking reverses it.
          </p>
          <p className="text-muted-foreground">
            No streaks, no points, no celebration. The plan is a mirror, not a game.
          </p>
        </div>
      </div>
    </div>
  );
}
