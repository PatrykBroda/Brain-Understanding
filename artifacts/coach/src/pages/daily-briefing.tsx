import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { usePlanner } from "@/hooks/use-planner";
import { useActiveCompetition } from "@/hooks/use-competition";
import type { PlanCategory } from "@/lib/api";

const PHRASES: readonly string[][] = [
  ["THE SYSTEM", "YOU BUILD", "IS THE SYSTEM", "THAT TESTS YOU."],
  ["PRESSURE", "DOESN'T BUILD", "CHARACTER.", "IT REVEALS IT."],
  ["MOST MISTAKES", "ARE NERVOUS SYSTEM", "MISTAKES."],
  ["STRUCTURE", "SURVIVES", "CHAOS."],
  ["EVERY SESSION", "IS A DATA POINT.", "COLLECT THEM."],
  ["THE BODY", "REMEMBERS", "WHAT THE MIND", "SKIPS."],
  ["COMPOSURE", "IS A SKILL.", "TRAIN IT."],
];

const CATEGORY_LABEL: Record<PlanCategory, string> = {
  fix: "Primary weakness",
  goal_step: "Structural objective",
  train: "Daily execution",
  technique: "Technical drilling",
  regulate: "Recovery protocol",
};

const CATEGORY_ORDER: PlanCategory[] = [
  "fix",
  "goal_step",
  "train",
  "technique",
  "regulate",
];

function todayLabel() {
  return new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).toUpperCase();
}

export default function DailyBriefingPage() {
  const [, setLocation] = useLocation();
  const [leaving, setLeaving] = useState(false);
  const planner = usePlanner();
  const competition = useActiveCompetition();

  const enter = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (leaving) return;
    setLeaving(true);
    window.setTimeout(() => setLocation("/"), 350);
  };

  useEffect(() => {
    const t = window.setTimeout(() => enter(), 5000);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dayOfYear = Math.floor(
    (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86_400_000,
  );
  const phrase = PHRASES[dayOfYear % PHRASES.length]!;

  const pressure = competition.data?.pressure ?? null;

  const plan = planner.data?.plan ?? null;
  const completions = new Set(planner.data?.completions ?? []);
  const focusItems = plan
    ? CATEGORY_ORDER.flatMap((cat) =>
        (plan.items ?? []).filter((i) => i.category === cat),
      ).slice(0, 3)
    : [];
  const totalItems = plan?.items?.length ?? 0;
  const doneCount =
    plan?.items?.filter((i) => completions.has(i.key)).length ?? 0;

  return (
    <div
      className={`relative flex flex-col h-[100dvh] text-foreground overflow-hidden transition-opacity duration-[350ms] select-none ${
        leaving ? "opacity-0" : "opacity-100"
      }`}
      style={{ background: "#000" }}
      onClick={() => enter()}
    >
      {/* Heavy vignette */}
      <div
        className="absolute inset-0 pointer-events-none z-0"
        style={{
          background:
            "radial-gradient(ellipse 110% 80% at 50% 50%, transparent 35%, rgba(0,0,0,0.65) 90%, #000 100%)",
        }}
      />
      {/* Film grain */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none opacity-[0.06] mix-blend-overlay z-0"
        aria-hidden
      >
        <filter id="db-grain">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.85"
            numOctaves="2"
            stitchTiles="stitch"
          />
          <feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.5 0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#db-grain)" />
      </svg>

      {/* Header */}
      <header
        className="relative z-10 flex items-center justify-between px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-3 border-b"
        style={{ borderColor: "hsla(35,45%,55%,0.18)" }}
      >
        <span className="font-mono text-[10px] tracking-[0.38em] uppercase text-foreground/50">
          Today's Briefing
        </span>
        <span className="font-mono text-[9px] tracking-[0.22em] uppercase text-foreground/35">
          {todayLabel()}
        </span>
      </header>

      {/* Body */}
      <main className="relative z-10 flex-1 min-h-0 overflow-y-auto flex flex-col gap-6 px-6 py-7">
        {/* Phrase */}
        <h1
          className="font-light uppercase leading-[1.2] tracking-[0.05em] text-foreground/90"
          style={{
            fontFamily: "'Oswald', 'Inter', sans-serif",
            fontSize: "clamp(1.6rem, 7vw, 2.6rem)",
          }}
        >
          {phrase.map((line) => (
            <span key={line} className="block">
              {line}
            </span>
          ))}
        </h1>

        {/* Separator */}
        <div
          className="w-8 h-px"
          style={{ background: "hsla(35,65%,55%,0.55)" }}
        />

        {/* Competition countdown */}
        {pressure && (
          <div className="flex flex-col gap-1">
            <div
              className="font-mono text-[9px] uppercase tracking-[0.38em]"
              style={{ color: "hsla(0,65%,55%,0.85)" }}
            >
              Competition
            </div>
            <div className="font-mono text-2xl text-foreground/90 tabular-nums">
              {pressure.daysToEvent}{" "}
              <span className="text-sm text-foreground/55">
                {pressure.daysToEvent === 1 ? "day" : "days"} to go
              </span>
            </div>
            <div className="font-mono text-[10px] text-foreground/45 uppercase tracking-[0.2em]">
              {pressure.competition.eventName}
            </div>
          </div>
        )}

        {/* Today's focus */}
        {focusItems.length > 0 && (
          <div className="flex flex-col gap-3">
            <div className="font-mono text-[9px] uppercase tracking-[0.38em] text-foreground/45">
              Today's Focus
            </div>
            <ul className="flex flex-col gap-2.5">
              {focusItems.map((item) => (
                <li key={item.key} className="flex items-start gap-3">
                  <span
                    className="mt-[3px] w-1 h-1 rounded-full flex-shrink-0"
                    style={{ background: "hsla(35,65%,55%,0.7)" }}
                  />
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[0.88rem] text-foreground/85 leading-snug">
                      {item.title}
                    </span>
                    <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-foreground/35">
                      {CATEGORY_LABEL[item.category]}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Task progress */}
        {totalItems > 0 && (
          <div
            className="font-mono text-[10px] uppercase tracking-[0.3em]"
            style={{ color: "hsla(35,45%,55%,0.65)" }}
          >
            {doneCount} / {totalItems} tasks complete this week
          </div>
        )}
      </main>

      {/* Footer */}
      <footer
        className="relative z-10 flex flex-col items-center gap-3 px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-4 border-t"
        style={{ borderColor: "hsla(35,45%,55%,0.12)" }}
      >
        <button
          type="button"
          onClick={(e) => enter(e)}
          className="font-mono text-[10px] uppercase tracking-[0.55em] font-light text-foreground/55 hover:text-foreground/90 transition-colors outline-none focus-visible:ring-1 focus-visible:ring-primary/60 focus-visible:rounded-sm px-3 py-2 cursor-pointer"
        >
          Enter
        </button>
        <div
          className="font-mono text-[9px] tracking-[0.3em] uppercase"
          style={{ color: "hsla(35,65%,55%,0.7)", letterSpacing: "0.42em", paddingLeft: "0.42em" }}
        >
          Frame
        </div>
      </footer>
    </div>
  );
}
