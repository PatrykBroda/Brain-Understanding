import { useRef, useState } from "react";
import { HelpCircle, Lock, RefreshCcw, X } from "lucide-react";
import { useFramePlus } from "@/components/frame-plus-modal";
import { useFighter } from "@/hooks/use-fighter";
import { useQueryClient } from "@tanstack/react-query";
import {
  usePlanner,
  useRegeneratePlanner,
  useTogglePlannerItem,
} from "@/hooks/use-planner";
import { api, ApiError, type PlanCategory, type PlanItem } from "@/lib/api";

const CATEGORY_ORDER: PlanCategory[] = ["fix", "goal_step", "train", "technique", "regulate"];

const CATEGORY_LABEL: Record<PlanCategory, string> = {
  fix: "Primary weakness",
  goal_step: "Structural objective",
  train: "Daily execution",
  technique: "Technical drilling",
  regulate: "Recovery",
};

const CATEGORY_HINT: Record<PlanCategory, string> = {
  fix: "The leak being closed",
  goal_step: "One step toward a stated goal",
  train: "Mat time + conditioning",
  technique: "Drills on weak topics",
  regulate: "Nervous-system work",
};

// Category accents stay quiet: red text only for the primary weakness, gold for the
// structural objective, neutral for the rest.
const CATEGORY_COLOR: Record<PlanCategory, { bar: string; label: string }> = {
  fix:       { bar: "#E5645A", label: "#E5645A" },
  goal_step: { bar: "#B9A477", label: "#B9A477" },
  train:     { bar: "#8A8F96", label: "#A4A8AE" },
  technique: { bar: "#8A8F96", label: "#A4A8AE" },
  regulate:  { bar: "#8A8F96", label: "#A4A8AE" },
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
  const generationInFlightRef = useRef(false);
  const { openUpgrade } = useFramePlus();
  const queryClient = useQueryClient();

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

  async function runGeneration() {
    try {
      await regen.mutateAsync();
    } catch (e) {
      if (e instanceof ApiError && e.kind === "upgrade_required") {
        openUpgrade("weekly_mission");
      }
    } finally {
      generationInFlightRef.current = false;
    }
  }

  async function requestGenerate() {
    if (generationInFlightRef.current || regen.isPending) return;
    generationInFlightRef.current = true;
    try {
      const status = await api.getAiConsent();
      if (!status.accepted) {
        queryClient.setQueryData(["ai-consent"], status);
        return;
      }
      await runGeneration();
    } catch (err) {
      if (err instanceof Error && err.name === "ApiError" && (err as any).kind === "consent") {
        queryClient.invalidateQueries({ queryKey: ["ai-consent"] });
        return;
      }
      generationInFlightRef.current = false;
    }
  }

  const doneCount = completions.size;
  const total = plan?.items.length ?? 0;

  return (
    <>
      <div className="space-y-5">
        {/* Athlete + regenerate row */}
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="section-title truncate">{fighter?.name ?? "Athlete"}</h2>
            <div className="label tnum mt-0.5">Week of {formatWeekRange(weekStart)}</div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setHelp(true)}
              className="icon-round !border-transparent !bg-transparent text-muted-foreground hover:text-foreground"
              aria-label="How the weekly mission works"
            >
              <HelpCircle className="w-5 h-5" strokeWidth={1.5} />
            </button>
            <button
              type="button"
              onClick={() => void requestGenerate()}
              disabled={regen.isPending || !!generationInFlightRef.current}
              className="btn-quiet"
            >
              {regen.isPending ? (
                <>
                  <span className="h-4 w-4 rounded-full border-2 border-white/15 border-t-[#B9A477] animate-spin motion-reduce:animate-none" aria-hidden />
                  Generating
                </>
              ) : (
                <>
                  <RefreshCcw className="w-4 h-4" strokeWidth={1.5} />
                  {plan ? "Regenerate" : "Generate"}
                </>
              )}
            </button>
          </div>
        </div>

        {/* Day strip: today is the selected cell */}
        <section aria-label="This week's days, today highlighted" className="grid grid-cols-7 gap-1.5">
          {DAY_LABELS.map((label, idx) => {
            const isToday = idx === todayIdx;
            const isPast = todayIdx >= 0 && idx < todayIdx;
            return (
              <div
                key={label}
                aria-current={isToday ? "date" : undefined}
                className={`text-center py-3 rounded-[12px] border text-[0.8125rem] font-medium ${
                  isToday
                    ? "bg-[#191C20] border-[#B9A477]/50 text-[#F4F4F1]"
                    : "bg-[#111316] border-white/[0.06] " + (isPast ? "text-[#8A8F96]" : "text-[#A4A8AE]")
                }`}
              >
                {label}
                {isToday && <span className="sr-only"> (today)</span>}
              </div>
            );
          })}
        </section>

        {regen.isError &&
          !(regen.error instanceof ApiError && regen.error.kind === "upgrade_required") && (
          <div role="alert" className="glass glass-red px-4 py-3 text-[0.9375rem] text-foreground/90">
            <span className="font-medium text-[#E5645A]">Could not generate the mission.</span>{" "}
            {(regen.error as Error).message || "Try again in a moment."}
          </div>
        )}

        {isPreview && plan && (
          <button
            type="button"
            onClick={() => openUpgrade("weekly_mission")}
            className="glass w-full text-left px-5 py-4 transition-colors hover:border-white/20"
          >
            <div className="flex items-center gap-2.5">
              <Lock className="w-4 h-4 flex-none text-[#B9A477]" strokeWidth={1.5} />
              <span className="text-[0.9375rem] font-medium text-[#D4C7A3]">Mission preview</span>
            </div>
            <p className="text-[0.9375rem] text-muted-foreground leading-[1.6] mt-1.5">
              Your first directive is open. FRAME+ unlocks the full week, every item with its rationale.
            </p>
          </button>
        )}

        {planner.isLoading ? (
          <div className="flex flex-col items-center gap-3 py-14 text-[0.9375rem] text-muted-foreground" role="status">
            <span className="h-5 w-5 rounded-full border-2 border-white/15 border-t-[#B9A477] animate-spin motion-reduce:animate-none" aria-hidden />
            Loading this week's mission
          </div>
        ) : planner.isError ? (
          <div role="alert" className="glass glass-red p-5 space-y-3">
            <div className="font-medium text-[#E5645A]">Could not load the mission</div>
            <p className="text-[0.9375rem] text-foreground/80 leading-[1.6]">Check your connection and try again.</p>
            <button type="button" onClick={() => void planner.refetch()} className="btn-quiet btn-quiet-red">
              <RefreshCcw className="w-4 h-4" strokeWidth={1.5} />
              Retry
            </button>
          </div>
        ) : !plan ? (
          <div className="glass p-5 space-y-3">
            <h3 className="section-title">No mission yet this week</h3>
            <p className="text-[1rem] text-muted-foreground leading-[1.6]">
              The mission reads your athlete model, recent calibrations and chat signals, then builds
              5 to 7 actions for the week. Each one is anchored to a real recorded signal.
            </p>
            <button type="button" onClick={() => void requestGenerate()} disabled={regen.isPending} className="btn-bronze w-full">
              Generate this week's mission
            </button>
          </div>
        ) : (
          <>
            {plan.rationale && (
              <div className="glass">
                <div className="px-5 py-4">
                  <div className="label !text-[#B9A477] mb-2">Mission directive</div>
                  <p className="text-[1.0625rem] text-foreground leading-[1.65]">{plan.rationale}</p>
                </div>
              </div>
            )}

            {total > 0 && (
              <div className="flex items-center gap-3">
                <div className="flex-1 bar-thin" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={doneCount} aria-label="Mission progress">
                  <span style={{ width: `${Math.round((doneCount / total) * 100)}%` }} />
                </div>
                <div className="flex-none label tnum">{doneCount} of {total} done</div>
              </div>
            )}

            <div className="space-y-8 pt-1">
              {CATEGORY_ORDER.map((cat) => {
                const items = grouped[cat];
                if (items.length === 0) return null;
                const col = CATEGORY_COLOR[cat];
                return (
                  <section key={cat} className="plan-section">
                    <div className="mb-3">
                      <h3 className="section-title !text-[1.0625rem]" style={{ color: cat === "fix" ? col.label : undefined }}>
                        {CATEGORY_LABEL[cat]}
                      </h3>
                      <div className="label mt-0.5">{CATEGORY_HINT[cat]}</div>
                    </div>
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

            <div className="flex items-center justify-between pt-4 border-t border-white/[0.06]">
              <div className="label tnum">
                Issued {new Date(plan.createdAt).toLocaleString(undefined, {
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </div>
              <div className="label">{plan.aiProvider}</div>
            </div>
          </>
        )}

        <MissionAnimations />
        {help && <HelpOverlay onClose={() => setHelp(false)} />}
      </div>
    </>
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

  if (item.locked) {
    // Free-tier preview stub: title + category only, tap opens the upgrade modal.
    return (
      <button
        type="button"
        onClick={onLockedTap}
        className="plan-item glass w-full text-left transition-colors hover:border-white/20"
        style={{ animationDelay: `${index * 0.05}s` }}
      >
        <div className="flex items-start gap-3.5 px-5 py-4">
          <Lock className="flex-none mt-0.5 w-[18px] h-[18px] text-muted-foreground" strokeWidth={1.5} />
          <div className="flex-1 min-w-0">
            <div className="text-[1rem] leading-snug font-medium text-foreground/80 mb-2">
              {item.title}
            </div>
            <span className="chip chip-gold">FRAME+ unlocks this</span>
          </div>
        </div>
      </button>
    );
  }

  return (
    <div
      className="plan-item glass transition-colors"
      style={{ animationDelay: `${index * 0.05}s` }}
    >
      <div className="flex items-start gap-3 px-4 py-4">
        {/* Toggle */}
        <button
          type="button"
          onClick={() => onToggle(!done)}
          disabled={disabled}
          aria-pressed={done}
          aria-label={done ? "Mark not done" : "Mark done"}
          className="flex-none -ml-1 -mt-2 w-11 h-11 flex items-center justify-center disabled:opacity-60"
        >
          <span
            className="w-[24px] h-[24px] rounded-[8px] border flex items-center justify-center transition-colors"
            style={{
              borderColor: done ? "#B9A477" : "rgba(255,255,255,0.28)",
              background: done ? "#B9A477" : "transparent",
              color: done ? "#0B0C0E" : "transparent",
            }}
          >
            <svg viewBox="0 0 20 20" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.8">
              <path d="M4 10.5 L8 14.5 L16 6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        </button>

        <div className="flex-1 min-w-0">
          <div
            className="text-[1rem] leading-snug font-medium mb-1.5"
            style={{
              color: done ? "#8A8F96" : "#F4F4F1",
              textDecoration: done ? "line-through" : "none",
            }}
          >
            {item.title}
          </div>

          <p
            className="text-[0.9375rem] leading-[1.6]"
            style={{ color: done ? "#8A8F96" : "#A4A8AE" }}
          >
            {item.detail}
          </p>

          <div
            className="flex items-center justify-between gap-3 mt-3 pt-3 border-t border-white/[0.06]"
            title={[
              item.sourceFactIds.length ? `facts: ${item.sourceFactIds.join(", ")}` : "",
              item.sourceCalibrationKeys.length ? `calibrations: ${item.sourceCalibrationKeys.join(", ")}` : "",
            ].filter(Boolean).join(" · ")}
          >
            <span className="label min-w-0 truncate" style={cat === "fix" ? { color: col.label } : undefined}>
              {item.sourceLabel}
            </span>
            <span className="label tnum flex-none">{item.suggestedDays}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function MissionAnimations() {
  return (
    <style>{`
      @keyframes plan-in {
        from { opacity: 0; transform: translateY(6px); }
        to   { opacity: 1; transform: translateY(0); }
      }
      .plan-section, .plan-item { animation: plan-in 0.3s cubic-bezier(0.2, 0, 0, 1) both; }
      @media (prefers-reduced-motion: reduce) {
        .plan-section, .plan-item { animation: none; }
      }
    `}</style>
  );
}

function HelpOverlay({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 bg-[#08090B]/80 backdrop-blur-md flex items-end sm:items-center justify-center p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="How the mission works"
    >
      <div
        className="overlay-surface relative max-w-md w-full p-6 space-y-4 rounded-[20px]"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute top-2 right-2 w-11 h-11 flex items-center justify-center rounded-[12px] text-muted-foreground hover:text-foreground hover:bg-white/[0.05] transition-colors"
        >
          <X className="w-5 h-5" strokeWidth={1.5} />
        </button>
        <h2 className="section-title pr-10">How the mission works</h2>
        <div className="space-y-3 text-[1rem] text-foreground/90 leading-[1.6]">
          <p>
            One mission per week. 5 to 7 actions for the next 7 days, grouped into Primary weakness,
            Structural objective, Daily execution, Technical drilling and Recovery. Empty sections
            say so. The system never invents items to fill them.
          </p>
          <p>
            Every item is drawn from a real recorded signal: a fact in your athlete model, or a
            calibration answer. The source line under each item names where it came from. The
            suggested-days label is a best guess from your recorded training frequency, not a
            prescription.
          </p>
          <p>
            Marking an item done writes a low-confidence pattern into your model so the next plan
            knows what you actually executed. Un-marking reverses it.
          </p>
          <p className="text-muted-foreground">
            No streaks, no points. The plan is a mirror, not a game.
          </p>
        </div>
      </div>
    </div>
  );
}
