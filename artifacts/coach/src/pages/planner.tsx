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

const CATEGORY_ORDER: PlanCategory[] = ["fix", "goal_step", "train", "technique", "regulate"];

const CATEGORY_LABEL: Record<PlanCategory, string> = {
  fix: "Primary weakness",
  goal_step: "Structural objective",
  train: "Daily execution",
  technique: "Technical drilling",
  regulate: "Recovery protocol",
};

const CATEGORY_HINT: Record<PlanCategory, string> = {
  fix: "The leak being closed",
  goal_step: "One step toward a stated goal",
  train: "Mat time + conditioning",
  technique: "Drills on weak topics",
  regulate: "Nervous-system work",
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
        <div className="text-center flex flex-col items-center gap-1">
          <svg viewBox="0 0 64 64" fill="none" width="18" height="18" aria-hidden>
            <polygon points="32,4 54,16 54,48 32,60 10,48 10,16" stroke="hsl(35,65%,58%)" strokeWidth="2" opacity="0.85" />
            <polygon points="32,14 46,22 46,42 32,50 18,42 18,22" stroke="hsl(35,65%,58%)" strokeWidth="1" opacity="0.48" />
            <circle cx="32" cy="32" r="3" fill="hsl(35,65%,58%)" opacity="0.75" />
          </svg>
          <div className="font-mono text-sm uppercase tracking-[0.3em] text-foreground/95">
            Weekly mission
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
                <div
                  className="relative border border-primary/25 px-4 py-4"
                  style={{
                    background:
                      "linear-gradient(180deg, hsla(40,45%,55%,0.05), transparent 60%)",
                  }}
                >
                  <span className="absolute left-0 top-0 h-2.5 w-2.5 border-l border-t border-primary/60" />
                  <span className="absolute right-0 top-0 h-2.5 w-2.5 border-r border-t border-primary/60" />
                  <span className="absolute left-0 bottom-0 h-2.5 w-2.5 border-l border-b border-primary/60" />
                  <span className="absolute right-0 bottom-0 h-2.5 w-2.5 border-r border-b border-primary/60" />
                  <div className="flex items-center gap-2 mb-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                    <div className="font-mono text-[10px] uppercase tracking-[0.35em] text-primary/90">
                      Mission focus
                    </div>
                  </div>
                  <p className="text-sm text-foreground/90 leading-relaxed">{plan.rationale}</p>
                </div>
              )}

              {/* Completion counter */}
              {plan.items.length > 0 && (
                <div className="flex items-center gap-3">
                  <div className="flex-1 relative h-[2px] bg-border/40 overflow-hidden">
                    <div
                      className="absolute top-0 left-0 h-full bg-primary/70 transition-all duration-700"
                      style={{ width: `${Math.round((completions.size / plan.items.length) * 100)}%` }}
                    />
                  </div>
                  <div className="flex-none font-mono text-[10px] uppercase tracking-widest text-foreground/65">
                    {completions.size}/{plan.items.length}
                  </div>
                </div>
              )}

              <div className="space-y-8">
                {CATEGORY_ORDER.map((cat, ci) => {
                  const items = grouped[cat];
                  return (
                    <section key={cat} className="space-y-2.5 plan-section" style={{ animationDelay: `${ci * 0.07}s` }}>
                      <div
                        className="relative flex items-center gap-3 pb-2"
                        style={{ borderBottom: "1px solid hsla(35,55%,50%,0.14)" }}
                      >
                        <span className="font-mono text-[9px] tracking-[0.3em] text-primary/45">
                          {String(ci + 1).padStart(2, "0")}
                        </span>
                        <div className="flex-1">
                          <div className="font-mono text-[11px] uppercase tracking-[0.35em] text-foreground/95">
                            {CATEGORY_LABEL[cat]}
                          </div>
                        </div>
                        <div className="font-mono text-[8px] uppercase tracking-[0.25em] text-muted-foreground/65">
                          {CATEGORY_HINT[cat]}
                        </div>
                      </div>
                      {items.length === 0 ? (
                        <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground/50 px-1 py-2">
                          no anchoring signal yet
                        </div>
                      ) : (
                        items.map((item, ii) => (
                          <PlanItemCard
                            key={item.key}
                            item={item}
                            index={ii}
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

              <div className="flex items-center justify-between pt-3 border-t border-border/20">
                <div className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground/55">
                  Built {new Date(plan.createdAt).toLocaleString(undefined, {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </div>
                <div className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground/40">
                  {plan.aiProvider}
                </div>
              </div>
            </>
          )}
        </div>
      </main>

      <BottomNav />
      <PlannerAnimations />

      {help && <HelpOverlay onClose={() => setHelp(false)} />}
    </div>
  );
}

function PlanItemCard({
  item,
  index,
  done,
  disabled,
  onToggle,
}: {
  item: PlanItem;
  index: number;
  done: boolean;
  disabled: boolean;
  onToggle: (done: boolean) => void;
}) {
  return (
    <div
      className="plan-item relative border transition-all duration-400"
      style={{
        borderColor: done ? "hsla(35,65%,55%,0.35)" : "hsla(0,0%,100%,0.09)",
        background: done
          ? "linear-gradient(90deg, hsla(35,55%,45%,0.06), transparent)"
          : undefined,
        animationDelay: `${index * 0.06}s`,
      }}
    >
      {/* Left accent bar — primary when done, crimson-dim when pending */}
      <div
        className="absolute left-0 top-0 bottom-0 w-[2px] transition-colors duration-400"
        style={{
          background: done
            ? "hsl(35,65%,55%)"
            : "hsla(0,50%,30%,0.5)",
        }}
      />

      <div className="flex items-start gap-3 px-4 py-3.5 pl-5">
        <button
          type="button"
          onClick={() => onToggle(!done)}
          disabled={disabled}
          aria-pressed={done}
          aria-label={done ? "Mark not done" : "Mark done"}
          className="flex-none mt-0.5 w-5 h-5 border flex items-center justify-center transition-all duration-300"
          style={{
            borderColor: done ? "hsl(35,65%,55%)" : "hsla(0,0%,100%,0.22)",
            background: done ? "hsla(35,65%,55%,0.18)" : undefined,
            color: done ? "hsl(35,65%,58%)" : "transparent",
          }}
        >
          <svg viewBox="0 0 20 20" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M4 10.5 L8 14.5 L16 6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-baseline justify-between gap-3 mb-1">
            <div
              className="text-[0.93rem] leading-snug transition-colors duration-300"
              style={{ color: done ? "hsla(0,0%,100%,0.4)" : "hsla(0,0%,100%,0.92)", textDecoration: done ? "line-through" : "none" }}
            >
              {item.title}
            </div>
            <div className="flex-none font-mono text-[9px] uppercase tracking-widest text-muted-foreground/80">
              {item.suggestedDays}
            </div>
          </div>

          <p
            className="text-sm leading-relaxed transition-colors duration-300"
            style={{ color: done ? "hsla(0,0%,100%,0.38)" : "hsla(0,0%,100%,0.72)" }}
          >
            {item.detail}
          </p>

          <div
            className="flex items-center gap-2 mt-2.5"
            title={[
              item.sourceFactIds.length ? `fact ids: ${item.sourceFactIds.join(", ")}` : "",
              item.sourceCalibrationKeys.length
                ? `calibrations: ${item.sourceCalibrationKeys.join(", ")}`
                : "",
            ]
              .filter(Boolean)
              .join(" · ")}
          >
            <span className="h-px w-3 bg-primary/30 flex-none" />
            <span className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground/70">
              {item.sourceLabel}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function PlannerAnimations() {
  return (
    <style>{`
      @keyframes plan-section-in {
        from { opacity: 0; transform: translateY(6px); }
        to   { opacity: 1; transform: translateY(0); }
      }
      .plan-section {
        animation: plan-section-in 0.5s ease-out both;
      }
      @keyframes plan-item-in {
        from { opacity: 0; transform: translateX(-4px); }
        to   { opacity: 1; transform: translateX(0); }
      }
      .plan-item {
        animation: plan-item-in 0.4s ease-out both;
      }
      @media (prefers-reduced-motion: reduce) {
        .plan-section, .plan-item { animation: none; }
      }
    `}</style>
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
          How the mission works
        </div>
        <div className="space-y-3 text-sm text-foreground/85 leading-relaxed">
          <p>
            One mission per week. 5-7 actions for the next 7 days, grouped into Primary weakness,
            Structural objective, Daily execution, Technical drilling, and Recovery protocol. Empty
            sections say so — the system never invents items to fill them.
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
