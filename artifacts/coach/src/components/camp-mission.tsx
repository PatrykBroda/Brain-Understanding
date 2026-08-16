import { useState } from "react";
import { HelpCircle, Lock, RefreshCcw, X } from "lucide-react";
import { FrameOctagon } from "@/components/frame-octagon";
import { useFramePlus } from "@/components/frame-plus-modal";
import { useFighter } from "@/hooks/use-fighter";
import {
  usePlanner,
  useRegeneratePlanner,
  useTogglePlannerItem,
} from "@/hooks/use-planner";
import { ApiError, type PlanCategory, type PlanItem } from "@/lib/api";

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

const CATEGORY_COLOR: Record<PlanCategory, { bar: string; glow: string; label: string }> = {
  fix:       { bar: "hsla(0,68%,46%,0.95)",    glow: "hsla(0,68%,46%,0.07)",   label: "hsl(0,55%,62%)" },
  goal_step: { bar: "hsla(39,49%,36%,0.9)",    glow: "hsla(39,49%,36%,0.07)",  label: "hsl(39,49%,36%)" },
  train:     { bar: "hsla(0,0%,55%,0.7)",      glow: "hsla(0,0%,55%,0.04)",    label: "hsl(0,0%,70%)" },
  technique: { bar: "hsla(210,38%,52%,0.8)",   glow: "hsla(210,38%,52%,0.06)", label: "hsl(210,35%,68%)" },
  regulate:  { bar: "hsla(160,28%,38%,0.8)",   glow: "hsla(160,28%,38%,0.06)", label: "hsl(160,28%,56%)" },
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

export function CampMission() {
  const { data: fighterData } = useFighter();
  const fighter = fighterData?.fighter ?? null;
  const planner = usePlanner();
  const regen = useRegeneratePlanner();
  const toggle = useTogglePlannerItem();
  const [help, setHelp] = useState(false);
  const { openUpgrade } = useFramePlus();

  const isPreview = planner.data?.preview === true;
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
    <div className="space-y-5">
      {/* Fighter + regenerate row */}
      <div className="flex items-center justify-between">
        <div>
          <div className="font-mono text-[9px] uppercase tracking-[0.4em] text-muted-foreground/60">
            {fighter?.name ?? "Athlete"}
          </div>
          <div className="font-sans text-[13px] font-light tracking-[0.12em] text-foreground/80 mt-0.5">
            {formatWeekRange(weekStart)}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setHelp(true)}
            className="text-muted-foreground hover:text-foreground transition-colors"
            aria-label="How the weekly mission works"
          >
            <HelpCircle className="w-4 h-4" strokeWidth={1.5} />
          </button>
          <button
            type="button"
            onClick={() =>
              regen.mutate(undefined, {
                onError: (e) => {
                  if (e instanceof ApiError && e.kind === "upgrade_required") {
                    openUpgrade("weekly_mission");
                  }
                },
              })
            }
            disabled={regen.isPending}
            className="font-mono text-[10px] uppercase tracking-widest border border-border/50 px-3 py-2 text-foreground/70 hover:text-foreground hover:border-destructive/50 transition-all duration-300 disabled:opacity-40 flex items-center gap-1.5"
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
        </div>
      </div>

      {/* Day grid — operational timeline */}
      <section aria-label="This week's days, today highlighted" className="grid grid-cols-7 gap-[3px]">
        {DAY_LABELS.map((label, idx) => {
          const isToday = idx === todayIdx;
          const isPast = todayIdx >= 0 && idx < todayIdx;
          return (
            <div
              key={label}
              className="relative text-center py-2.5 transition-all duration-300"
              style={{
                background: isToday
                  ? "hsla(0,68%,46%,0.12)"
                  : isPast
                  ? "hsla(0,0%,100%,0.02)"
                  : "hsla(0,0%,100%,0.025)",
                borderBottom: isToday
                  ? "2px solid hsla(0,68%,46%,0.8)"
                  : "2px solid hsla(0,0%,100%,0.07)",
              }}
            >
              {isToday && (
                <div
                  className="absolute inset-0 pointer-events-none"
                  style={{ boxShadow: "inset 0 0 12px hsla(0,68%,46%,0.08)" }}
                />
              )}
              <div
                className="font-mono text-[9px] uppercase tracking-widest"
                style={{ color: isToday ? "hsl(0,55%,62%)" : isPast ? "hsla(0,0%,100%,0.25)" : "hsla(0,0%,100%,0.45)" }}
              >
                {label}
              </div>
              {isToday && (
                <div className="w-1 h-1 rounded-full bg-destructive/80 mx-auto mt-1 animate-pulse" />
              )}
            </div>
          );
        })}
      </section>

      {regen.isError &&
        !(regen.error instanceof ApiError && regen.error.kind === "upgrade_required") && (
        <div className="border-l-2 border-destructive/70 bg-destructive/8 px-4 py-3 font-mono text-[10px] uppercase tracking-widest text-destructive/90">
          {(regen.error as Error).message || "generation failed"}
        </div>
      )}

      {isPreview && plan && (
        <button
          type="button"
          onClick={() => openUpgrade("weekly_mission")}
          className="w-full text-left border-l-2 border-primary/60 bg-primary/[0.06] px-4 py-3 transition-colors hover:bg-primary/[0.1]"
        >
          <div className="flex items-center gap-2.5">
            <Lock className="w-3.5 h-3.5 flex-none text-primary/80" strokeWidth={1.5} />
            <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-primary/90">
              Mission preview
            </span>
          </div>
          <p className="text-[0.8rem] text-foreground/60 leading-relaxed mt-1.5">
            Your first directive is open. FRAME+ unlocks the full week — every item, every rationale.
          </p>
        </button>
      )}

      {planner.isLoading ? (
        <div className="text-muted-foreground font-mono text-[10px] uppercase tracking-widest py-16 text-center opacity-60">
          Loading
        </div>
      ) : !plan ? (
        /* Empty state — dramatic */
        <div
          className="relative border border-border/30 p-6 space-y-4 mt-4"
          style={{ background: "linear-gradient(160deg, hsla(0,60%,30%,0.04), transparent 60%)" }}
        >
          <span className="absolute left-0 top-0 h-3 w-3 border-l-2 border-t-2 border-destructive/40" />
          <span className="absolute right-0 top-0 h-3 w-3 border-r-2 border-t-2 border-destructive/40" />
          <span className="absolute left-0 bottom-0 h-3 w-3 border-l-2 border-b-2 border-destructive/40" />
          <span className="absolute right-0 bottom-0 h-3 w-3 border-r-2 border-b-2 border-destructive/40" />
          <div className="font-mono text-[9px] uppercase tracking-[0.45em] text-destructive/70">
            No directive issued
          </div>
          <p className="text-sm text-foreground/80 leading-relaxed">
            The mission reads your accumulated model, recent calibrations, and chat signals,
            then builds 5-7 actions for the week. Every item is anchored to a real recorded signal.
            No padding, no streaks, no invented work.
          </p>
          <p className="text-sm text-muted-foreground/70 leading-relaxed">
            Generate when you're ready.
          </p>
        </div>
      ) : (
        <>
          {/* Mission directive card */}
          {plan.rationale && (
            <div
              className="relative mt-1"
              style={{
                background: "linear-gradient(170deg, hsla(0,60%,30%,0.1) 0%, hsla(0,0%,0%,0) 55%)",
                borderLeft: "2px solid hsla(0,68%,46%,0.6)",
                borderTop: "1px solid hsla(0,68%,46%,0.2)",
                borderRight: "1px solid hsla(0,0%,100%,0.05)",
                borderBottom: "1px solid hsla(0,0%,100%,0.05)",
              }}
            >
              <div className="px-4 pt-3 pb-4">
                <div className="flex items-center gap-2.5 mb-3">
                  <span className="h-[5px] w-[5px] rounded-full bg-destructive animate-pulse" />
                  <div className="font-mono text-[9px] uppercase tracking-[0.45em] text-destructive/80">
                    Mission directive
                  </div>
                </div>
                <p className="text-[0.9rem] text-foreground/90 leading-relaxed font-light">{plan.rationale}</p>
              </div>
            </div>
          )}

          {/* Completion tracker */}
          {plan.items.length > 0 && (
            <div className="flex items-center gap-3 py-1">
              <div className="flex-1 relative h-[1px] bg-white/8 overflow-hidden">
                <div
                  className="absolute top-0 left-0 h-full transition-all duration-700"
                  style={{
                    width: `${Math.round((completions.size / plan.items.length) * 100)}%`,
                    background: completions.size === plan.items.length
                      ? "hsl(39,49%,36%)"
                      : "hsl(0,68%,46%)",
                  }}
                />
              </div>
              <div
                className="flex-none font-mono text-[9px] uppercase tracking-widest"
                style={{
                  color: completions.size === plan.items.length
                    ? "hsl(39,49%,36%)"
                    : "hsla(0,0%,100%,0.45)",
                }}
              >
                {completions.size}/{plan.items.length}
              </div>
            </div>
          )}

          {/* Category sections */}
          <div className="space-y-10 pt-2">
            {CATEGORY_ORDER.map((cat, ci) => {
              const items = grouped[cat];
              if (items.length === 0) return null;
              const col = CATEGORY_COLOR[cat];
              return (
                <section
                  key={cat}
                  className="plan-section"
                  style={{ animationDelay: `${ci * 0.09}s` }}
                >
                  {/* Zone header */}
                  <div className="mb-4">
                    <div className="flex items-center gap-3">
                      <span
                        className="font-mono text-[9px] tracking-widest px-2 py-0.5"
                        style={{
                          color: col.label,
                          borderLeft: `2px solid ${col.bar}`,
                          background: col.glow,
                        }}
                      >
                        {String(ci + 1).padStart(2, "0")}
                      </span>
                      <div>
                        <div
                          className="font-mono text-[12px] uppercase tracking-[0.35em]"
                          style={{ color: col.label }}
                        >
                          {CATEGORY_LABEL[cat]}
                        </div>
                      </div>
                      <div className="flex-1 ml-2" style={{ height: 1, background: `linear-gradient(90deg, ${col.bar} 0%, transparent 100%)`, opacity: 0.4 }} />
                    </div>
                    <div className="font-mono text-[9px] uppercase tracking-[0.3em] text-muted-foreground/45 mt-1.5 pl-10">
                      {CATEGORY_HINT[cat]}
                    </div>
                  </div>

                  {/* Items */}
                  <div className="space-y-3">
                    {items.map((item, ii) => (
                      <PlanItemCard
                        key={item.key}
                        item={item}
                        cat={cat}
                        index={ii}
                        done={completions.has(item.key)}
                        disabled={toggle.isPending}
                        onToggle={(done) =>
                          toggle.mutate({ key: item.key, completed: done })
                        }
                        onLockedTap={() => openUpgrade("weekly_mission")}
                      />
                    ))}
                  </div>
                </section>
              );
            })}
          </div>

          {/* Footer metadata */}
          <div className="flex items-center justify-between pt-4 border-t border-white/5">
            <div className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground/40">
              Issued {new Date(plan.createdAt).toLocaleString(undefined, {
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}
            </div>
            <div className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground/30">
              {plan.aiProvider}
            </div>
          </div>
        </>
      )}

      <MissionAnimations />
      {help && <HelpOverlay onClose={() => setHelp(false)} />}
    </div>
  );
}

function PlanItemCard({
  item,
  cat,
  index,
  done,
  disabled,
  onToggle,
  onLockedTap,
}: {
  item: PlanItem;
  cat: PlanCategory;
  index: number;
  done: boolean;
  disabled: boolean;
  onToggle: (done: boolean) => void;
  onLockedTap: () => void;
}) {
  const col = CATEGORY_COLOR[cat];
  const doneBar = "hsla(39,49%,36%,0.85)";

  if (item.locked) {
    // Free-tier preview stub: title + category only, tap opens the upgrade modal.
    return (
      <button
        type="button"
        onClick={onLockedTap}
        className="plan-item w-full text-left transition-colors duration-300 hover:bg-white/[0.02]"
        style={{
          borderLeft: `3px solid hsla(0,0%,100%,0.12)`,
          borderTop: "1px solid hsla(0,0%,100%,0.07)",
          borderRight: "1px solid hsla(0,0%,100%,0.04)",
          borderBottom: "1px solid hsla(0,0%,100%,0.04)",
          animationDelay: `${index * 0.07}s`,
        }}
      >
        <div className="flex items-start gap-3.5 px-5 py-4">
          <Lock className="flex-none mt-0.5 w-[18px] h-[18px] text-muted-foreground/40" strokeWidth={1.5} />
          <div className="flex-1 min-w-0">
            <div className="text-[0.95rem] leading-snug font-light text-foreground/45 mb-1.5">
              {item.title}
            </div>
            <span className="font-mono text-[9px] uppercase tracking-widest text-primary/60 border border-primary/25 px-1.5 py-0.5">
              FRAME+ unlocks this
            </span>
          </div>
        </div>
      </button>
    );
  }

  return (
    <div
      className="plan-item relative transition-all duration-400"
      style={{
        borderLeft: `3px solid ${done ? doneBar : col.bar}`,
        borderTop: "1px solid hsla(0,0%,100%,0.07)",
        borderRight: "1px solid hsla(0,0%,100%,0.04)",
        borderBottom: "1px solid hsla(0,0%,100%,0.04)",
        background: done
          ? "linear-gradient(95deg, hsla(39,49%,36%,0.06), transparent 70%)"
          : `linear-gradient(95deg, ${col.glow}, transparent 70%)`,
        animationDelay: `${index * 0.07}s`,
      }}
    >
      {/* Background index watermark */}
      <div
        className="absolute right-4 top-1/2 -translate-y-1/2 font-mono font-bold select-none pointer-events-none"
        style={{ fontSize: "2.8rem", opacity: 0.04, color: done ? "hsl(39,49%,36%)" : col.label }}
        aria-hidden
      >
        {String(index + 1).padStart(2, "0")}
      </div>

      <div className="flex items-start gap-3.5 px-5 py-4">
        {/* Toggle */}
        <button
          type="button"
          onClick={() => onToggle(!done)}
          disabled={disabled}
          aria-pressed={done}
          aria-label={done ? "Mark not done" : "Mark done"}
          className="flex-none mt-0.5 w-[18px] h-[18px] border flex items-center justify-center transition-all duration-300"
          style={{
            borderColor: done ? "hsl(39,49%,36%)" : col.bar,
            background: done ? "hsla(39,49%,36%,0.15)" : "transparent",
            color: done ? "hsl(39,49%,36%)" : "transparent",
          }}
        >
          <svg viewBox="0 0 20 20" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2.8">
            <path d="M4 10.5 L8 14.5 L16 6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        <div className="flex-1 min-w-0">
          {/* Directive title */}
          <div
            className="text-[0.95rem] leading-snug font-light transition-colors duration-300 mb-2"
            style={{
              color: done ? "hsla(0,0%,100%,0.32)" : "hsla(0,0%,100%,0.94)",
              textDecoration: done ? "line-through" : "none",
            }}
          >
            {item.title}
          </div>

          {/* Execution detail */}
          <p
            className="text-[0.82rem] leading-relaxed transition-colors duration-300"
            style={{ color: done ? "hsla(0,0%,100%,0.28)" : "hsla(0,0%,100%,0.60)" }}
          >
            {item.detail}
          </p>

          {/* Source + days footer */}
          <div
            className="flex items-center justify-between mt-3"
            title={[
              item.sourceFactIds.length ? `facts: ${item.sourceFactIds.join(", ")}` : "",
              item.sourceCalibrationKeys.length ? `calibrations: ${item.sourceCalibrationKeys.join(", ")}` : "",
            ].filter(Boolean).join(" · ")}
          >
            <div className="flex items-center gap-2">
              <span className="flex-none" style={{ display: "inline-block", width: 14, height: 1, background: done ? "hsla(39,49%,36%,0.5)" : col.bar, opacity: 0.7 }} />
              <span className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground/55">
                {item.sourceLabel}
              </span>
            </div>
            <span className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground/40">
              {item.suggestedDays}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function MissionAnimations() {
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
