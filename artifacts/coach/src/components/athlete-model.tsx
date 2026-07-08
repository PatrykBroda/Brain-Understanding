import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { useFighter } from "@/hooks/use-fighter";
import { useMemory } from "@/hooks/use-memory";
import { AthleteStatePanel } from "@/components/athlete-state-panel";
import { sportLabel } from "@/lib/fighter-options";
import { getArchetype, computeCoachingMode } from "@workspace/archetypes";
import { api, type FactCategory } from "@/lib/api";

const CATEGORY_LABELS: Record<FactCategory, string> = {
  weakness: "Weaknesses",
  strength: "Strengths",
  technical_knowledge: "Technical knowledge",
  pattern: "Recurring patterns",
  preference: "Coaching preferences",
  goal: "Active goals",
  event: "Recent events",
  context: "Life context",
};

const CATEGORY_ORDER: FactCategory[] = [
  "weakness",
  "strength",
  "technical_knowledge",
  "pattern",
  "preference",
  "goal",
  "event",
  "context",
];

// Fighter-specific DNA dimensions. Each aggregates any observation whose
// topic/content matches its keywords (a fact can feed several) plus a category
// hint. Confidence bands — how well FRAME understands each area — never a
// 1-100 attribute score.
const RADAR_DIMS: {
  label: string;
  keywords: string[];
  categories?: FactCategory[];
}[] = [
  {
    label: "Striking",
    keywords: [
      "strik", "punch", "kick", "elbow", "knee", "jab", "cross", "hook",
      "box", "muay", "stance", "footwork", "combination", "range", "distance",
    ],
  },
  {
    label: "Grappling",
    keywords: [
      "grappl", "guard", "mount", "takedown", "wrestl", "submission", "choke",
      "armbar", "sweep", "pass", "clinch", "control", "ground", "bjj", "judo",
      "position", "escape", "scramble", "pin",
    ],
  },
  {
    label: "Competition",
    keywords: [
      "comp", "tournament", "match", "fight", "spar", "opponent", "weigh",
      "cut", "event", "prep", "medal", "bracket",
    ],
    categories: ["goal", "event"],
  },
  {
    label: "Recovery",
    keywords: [
      "recover", "rest", "sleep", "fatigue", "gas", "cardio", "conditioning",
      "breath", "injur", "sore", "heal", "tired", "energy",
    ],
  },
  {
    label: "Decision Making",
    keywords: [
      "decision", "choice", "react", "read", "anticipat", "tactical", "pace",
      "timing", "adapt", "plan", "patient", "hesitat", "commit", "impos",
    ],
    categories: ["pattern"],
  },
  {
    label: "Mental Game",
    keywords: [
      "mental", "mind", "confidence", "focus", "calm", "compos", "anxiet",
      "fear", "tilt", "emotion", "motivat", "doubt", "frustrat", "nervous",
      "pressure",
    ],
    categories: ["preference"],
  },
];

// How many confidence points = "fully mapped" for a set of categories
const TARGET_PER_CATEGORY = 15; // 3 facts × confidence 5
const RADAR_TARGET = 12; // confidence points that fill one DNA dimension

function daysBetween(a: Date, b: Date) {
  return Math.max(0, Math.floor((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24)));
}

// "Updated 8 minutes ago" heartbeat — makes the model feel alive.
function formatHeartbeat(dateStr: string): string {
  const mins = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
  if (mins < 1) return "moments ago";
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? "" : "s"} ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  return `${months} month${months === 1 ? "" : "s"} ago`;
}

// First short clause of a longer signature string — the identity read.
function leadClause(text: string): string {
  const m = text.match(/^[^.!?]+[.!?]?/);
  return (m ? m[0] : text).replace(/[.!?]+$/, "");
}

// ─── SVG Radar Chart ────────────────────────────────────────────────────────

function RadarChart({ dims }: { dims: { label: string; value: number }[] }) {
  const n = dims.length;
  const cx = 95, cy = 95, r = 62;
  const angles = dims.map((_, i) => (2 * Math.PI * i) / n - Math.PI / 2);

  const pt = (level: number, i: number) => ({
    x: cx + r * level * Math.cos(angles[i]),
    y: cy + r * level * Math.sin(angles[i]),
  });

  const gridLevels = [0.25, 0.5, 0.75, 1.0];

  const filledPoints = dims.map((d, i) => pt(Math.max(0.04, d.value), i));
  const filledPath =
    filledPoints.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ") + " Z";

  return (
    <svg viewBox="0 0 190 190" className="w-full max-w-[200px] mx-auto block">
      {/* Grid polygons */}
      {gridLevels.map((level) => {
        const pts = angles
          .map((_, i) => {
            const p = pt(level, i);
            return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
          })
          .join(" ");
        return (
          <polygon
            key={level}
            points={pts}
            fill="none"
            stroke="hsla(0,0%,100%,0.07)"
            strokeWidth="1"
          />
        );
      })}

      {/* Axis lines */}
      {angles.map((_, i) => {
        const end = pt(1, i);
        return (
          <line
            key={i}
            x1={cx}
            y1={cy}
            x2={end.x.toFixed(1)}
            y2={end.y.toFixed(1)}
            stroke="hsla(0,0%,100%,0.07)"
            strokeWidth="1"
          />
        );
      })}

      {/* Filled confidence polygon */}
      <path
        d={filledPath}
        fill="hsla(32,54%,50%,0.12)"
        stroke="hsla(32,54%,50%,0.55)"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />

      {/* Data points */}
      {filledPoints.map((p, i) => (
        <circle key={i} cx={p.x.toFixed(1)} cy={p.y.toFixed(1)} r="2.5" fill="hsl(32,54%,50%)" />
      ))}

      {/* Labels */}
      {dims.map((d, i) => {
        const lp = pt(1.38, i);
        return (
          <text
            key={i}
            x={lp.x.toFixed(1)}
            y={lp.y.toFixed(1)}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize="7"
            fontFamily="monospace"
            fill="hsla(0,0%,100%,0.45)"
            style={{ textTransform: "uppercase", letterSpacing: 1 }}
          >
            {d.label}
          </text>
        );
      })}
    </svg>
  );
}

// ─── Segmented confidence bar ─────────────────────────────────────────────────

function ConfidenceBar({ pct, segments = 20 }: { pct: number; segments?: number }) {
  const filled = Math.round((pct / 100) * segments);
  return (
    <div className="flex gap-[2px]">
      {Array.from({ length: segments }).map((_, i) => (
        <div
          key={i}
          className="h-[3px] flex-1 transition-colors duration-700"
          style={{
            background:
              i < filled
                ? `hsl(32,54%,${50 - (i / segments) * 8}%)`
                : "hsla(0,0%,100%,0.08)",
          }}
        />
      ))}
    </div>
  );
}

// ─── Editorial section header (overline + title, optional aside) ──────────────

function SectionHead({
  overline,
  title,
  aside,
}: {
  overline: string;
  title: string;
  aside?: React.ReactNode;
}) {
  return (
    <div className="flex items-end justify-between gap-4">
      <div>
        <div className="font-mono text-[9px] uppercase tracking-[0.5em] text-foreground/45 mb-2">
          {overline}
        </div>
        <div className="font-sans font-extralight uppercase text-[0.95rem] tracking-[0.32em] text-foreground/90 leading-none">
          {title}
        </div>
      </div>
      {aside ? <div className="flex-none pb-0.5">{aside}</div> : null}
    </div>
  );
}

// ─── Hairline divider with amber node ────────────────────────────────────────

function NodeDivider({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-3 ${className}`} aria-hidden>
      <div
        className="flex-1 h-px"
        style={{ background: "linear-gradient(to right, transparent, hsla(35,55%,55%,0.18))" }}
      />
      <div className="w-1 h-1 rounded-full" style={{ background: "hsla(35,55%,55%,0.3)" }} />
      <div
        className="flex-1 h-px"
        style={{ background: "linear-gradient(to left, transparent, hsla(35,55%,55%,0.18))" }}
      />
    </div>
  );
}

// ─── Dossier panel shell — transparent, hairline, subtle inner highlight ─────

function Panel({
  children,
  accent = false,
  className = "",
}: {
  children: React.ReactNode;
  accent?: boolean;
  className?: string;
}) {
  return (
    <div
      className={`relative overflow-hidden border ${accent ? "border-primary/25" : "border-white/[0.06]"} ${className}`}
      style={{
        background: accent
          ? "linear-gradient(180deg, hsla(35,55%,52%,0.055), transparent 62%)"
          : "linear-gradient(180deg, hsla(0,0%,100%,0.018), transparent 58%)",
        boxShadow: "inset 0 1px 0 hsla(0,0%,100%,0.04)",
      }}
    >
      {children}
    </div>
  );
}

// ─── Fact confidence — pips + label, real 1–5 confidence only ────────────────

function FactConfidence({ value }: { value: number }) {
  const v = Math.max(0, Math.min(5, value));
  return (
    <div className="flex items-center gap-1.5 flex-none" title={`Confidence ${v}/5`}>
      <div className="flex gap-[3px]">
        {[1, 2, 3, 4, 5].map((i) => (
          <span
            key={i}
            className="w-[3px] h-[9px]"
            style={{ background: i <= v ? "hsl(35,58%,55%)" : "hsla(0,0%,100%,0.1)" }}
          />
        ))}
      </div>
      <span className="font-mono text-[9px] uppercase tracking-[0.25em] text-foreground/40 tabular-nums">
        {v}/5
      </span>
    </div>
  );
}

function IdentityRow({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="px-4 py-3 flex items-start justify-between gap-4">
      <div className="font-mono text-[9px] uppercase tracking-[0.3em] text-muted-foreground/60 pt-0.5 flex-none w-28">
        {label}
      </div>
      <div className="min-w-0 text-right">
        <div className="font-mono text-[11px] uppercase tracking-[0.1em] text-foreground/90 leading-snug">
          {value}
        </div>
        {sub && (
          <div className="font-mono text-[9px] tracking-wide text-muted-foreground/45 mt-0.5 normal-case">
            {sub}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Athlete model — the full FRAME dossier, mounted on Analyse ─────────────
// Everything FRAME knows: model confidence, observations, hypotheses, patterns,
// coverage graphs, calibration history. Moved here from Profile so Profile can
// stay a passport ("who am I") and Analyse holds the data ("everything").

export function AthleteModel({ variant = "desktop" }: { variant?: "mobile" | "desktop" }) {
  const { data: fighterData } = useFighter();
  const fighter = fighterData?.fighter ?? null;
  const memoryQuery = useMemory(true);
  const facts = memoryQuery.data?.facts ?? [];

  const convQuery = useQuery({
    queryKey: ["conversation", "active"],
    queryFn: api.getActiveConversation,
    enabled: !!fighter,
  });
  const messages = convQuery.data?.messages ?? [];

  const grouped = useMemo(() => {
    const g: Partial<Record<FactCategory, typeof facts>> = {};
    for (const f of facts) {
      (g[f.category] ??= []).push(f);
    }
    return g;
  }, [facts]);

  const computed = useMemo(() => {
    // ── Per-category confidence coverage (0-1) ─────────────────────────
    const categoryCoverage: Record<FactCategory, number> = {} as Record<FactCategory, number>;
    for (const c of CATEGORY_ORDER) {
      const catFacts = grouped[c] ?? [];
      const sum = catFacts.reduce((s, f) => s + f.confidence, 0);
      categoryCoverage[c] = Math.min(1, sum / TARGET_PER_CATEGORY);
    }

    // ── FRAME Confidence % ─────────────────────────────────────────────
    // Average coverage across all 8 categories × 100. Honest: only rises
    // as FRAME records more high-confidence observations in each domain.
    const avgCoverage =
      CATEGORY_ORDER.reduce((s, c) => s + categoryCoverage[c], 0) / CATEGORY_ORDER.length;
    const frameConfidence = Math.round(avgCoverage * 100);

    // ── Lowest-confidence categories ──────────────────────────────────
    const lowestCategories = [...CATEGORY_ORDER]
      .sort((a, b) => categoryCoverage[a] - categoryCoverage[b])
      .slice(0, 3);

    // ── Radar data (6 fighter-specific dims via keyword buckets) ──────
    const radarData = RADAR_DIMS.map((dim) => {
      let sum = 0;
      for (const f of facts) {
        const hay = `${f.topic} ${f.content}`.toLowerCase();
        const kwHit = dim.keywords.some((k) => hay.includes(k));
        const catHit = dim.categories?.includes(f.category) ?? false;
        if (kwHit || catHit) sum += f.confidence;
      }
      return { label: dim.label, value: Math.min(1, sum / RADAR_TARGET) };
    });

    // ── Heartbeat: most recent observation touch ──────────────────────
    const lastUpdated = facts.length
      ? facts.reduce(
          (max, f) => (f.updatedAt > max ? f.updatedAt : max),
          facts[0].updatedAt,
        )
      : null;

    // ── Athlete identity derivations ──────────────────────────────────
    const topStrength = (grouped.strength ?? []).sort(
      (a, b) => b.confidence - a.confidence,
    )[0];
    const topWeakness = (grouped.weakness ?? []).sort(
      (a, b) => b.confidence - a.confidence,
    )[0];
    const topPattern = (grouped.pattern ?? []).sort(
      (a, b) => b.confidence - a.confidence,
    )[0];

    // ── Frame integrity ───────────────────────────────────────────────
    const userTurns = messages.filter((m) => m.role === "user").length;
    const sinceDays = fighter
      ? daysBetween(new Date(fighter.createdAt), new Date())
      : 0;
    const integrityRaw = Math.min(1, facts.length / 24 + Math.min(userTurns / 30, 0.4));
    const integritySegments = Math.max(facts.length === 0 ? 0 : 1, Math.round(integrityRaw * 5));
    let integrityLabel = "Dormant";
    if (integritySegments >= 5) integrityLabel = "Tempered";
    else if (integritySegments === 4) integrityLabel = "Solid";
    else if (integritySegments === 3) integrityLabel = "Holding";
    else if (integritySegments === 2) integrityLabel = "Taking shape";
    else if (integritySegments === 1) integrityLabel = "Forming";

    const coachingMode = computeCoachingMode({
      hasActiveCompetition: false,
      level: fighter?.level ?? "beginner",
      modelSize: facts.length,
    });

    return {
      frameConfidence,
      lowestCategories,
      radarData,
      lastUpdated,
      topStrength,
      topWeakness,
      topPattern,
      sinceDays,
      integritySegments,
      integrityLabel,
      coachingMode,
    };
  }, [facts, messages, fighter, grouped]);

  // ── "What changed?" — client-remembered confidence baseline per fighter ──
  const [changeInfo, setChangeInfo] = useState<{ delta: number } | null>(null);
  useEffect(() => {
    if (!fighter || facts.length === 0) return;
    // Analyse mounts a mobile AND a desktop instance simultaneously (hidden via
    // CSS). Only the instance visible at the current viewport may consume the
    // confidence-delta baseline, or the hidden one eats the "Model updated"
    // panel before the visible one can show it.
    const isDesktopViewport = window.matchMedia("(min-width: 768px)").matches;
    if ((variant === "desktop") !== isDesktopViewport) return;
    const key = `frame:lastConfidence:${fighter.id}`;
    const prevRaw = localStorage.getItem(key);
    const prev = prevRaw == null ? null : Number(prevRaw);
    const current = computed.frameConfidence;
    if (prev != null && Number.isFinite(prev) && current > prev) {
      setChangeInfo({ delta: current - prev });
    } else {
      setChangeInfo(null);
    }
    localStorage.setItem(key, String(current));
  }, [fighter, facts, computed.frameConfidence, variant]);

  if (!fighter) return null;

  const arch = fighter.spiritAnimal ? getArchetype(fighter.spiritAnimal) : null;

  return (
    <div className="space-y-5">
      <NodeDivider />

      <div>
        <div className="font-mono text-[9px] uppercase tracking-[0.5em] text-foreground/45 mb-2">
          Athlete model
        </div>
        <div className="font-sans font-extralight uppercase text-xl tracking-[0.3em] text-foreground/90 leading-none">
          What FRAME knows
        </div>
      </div>

      {/* ─── 1. MODEL CONFIDENCE ──────────────────────────────── */}
      <Panel className="model-reveal">
        <div className="px-5 pt-5 pb-4">
          <SectionHead
            overline="Dossier · Model confidence"
            title="Understanding your game"
            aside={
              memoryQuery.isFetching ? (
                <span className="font-mono text-[9px] uppercase tracking-[0.4em] text-primary/60">
                  Syncing
                </span>
              ) : null
            }
          />

          <div className="flex items-baseline gap-4 mt-6 mb-2">
            <div className="font-sans font-extralight text-[3.25rem] text-foreground/95 tabular-nums leading-[0.85]">
              {computed.frameConfidence}
              <span className="text-2xl text-primary/70">%</span>
            </div>
            <div className="font-mono text-[9px] uppercase tracking-[0.45em] text-foreground/50 leading-relaxed pb-1">
              Model
              <br />
              confidence
            </div>
          </div>

          {computed.lastUpdated && (
            <div className="font-mono text-[9px] tracking-[0.15em] text-foreground/40 mb-4">
              Updated {formatHeartbeat(computed.lastUpdated)}
            </div>
          )}

          <ConfidenceBar pct={computed.frameConfidence} segments={20} />

          {changeInfo && (
            <div
              className="mt-4 px-3.5 py-3"
              style={{
                border: "1px solid hsla(35,55%,52%,0.28)",
                background: "linear-gradient(180deg, hsla(35,55%,52%,0.07), transparent 90%)",
              }}
            >
              <div className="flex items-baseline justify-between">
                <span className="font-mono text-[9px] uppercase tracking-[0.45em] text-primary/75">
                  Model updated
                </span>
                <span className="font-sans font-extralight text-base tabular-nums text-primary">
                  +{changeInfo.delta}%
                </span>
              </div>
            </div>
          )}

          <p className="text-[0.8rem] text-foreground/50 leading-relaxed mt-4">
            {computed.frameConfidence < 10
              ? "FRAME is still learning how you move under pressure. This percentage is how complete its model of you is."
              : computed.frameConfidence < 25
                ? "This percentage is how complete FRAME's model of you is. Still calibrating how you perform, adapt, and recover."
                : computed.frameConfidence < 60
                  ? "FRAME has a working model of you. It deepens with every session."
                  : "FRAME has a strong read on your game. Keep feeding it signal."}
          </p>
        </div>

        {computed.lowestCategories.length > 0 && (
          <div
            className="px-5 pt-4 pb-5"
            style={{ borderTop: "1px solid hsla(0,0%,100%,0.05)" }}
          >
            <div className="font-mono text-[9px] uppercase tracking-[0.5em] text-foreground/40 mb-3">
              Lowest confidence
            </div>
            <ul className="space-y-2">
              {computed.lowestCategories.map((c) => (
                <li key={c} className="flex items-center gap-2.5">
                  <span className="w-1 h-1 rounded-full bg-primary/40 flex-none" />
                  <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-foreground/65">
                    {CATEGORY_LABELS[c]}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <Link
          href="/chat"
          className="flex items-center justify-between px-5 py-3.5 hover:bg-white/[0.02] transition-colors group"
          style={{ borderTop: "1px solid hsla(0,0%,100%,0.06)" }}
        >
          <span className="font-mono text-[10px] uppercase tracking-[0.4em] text-primary/70 group-hover:text-primary transition-colors">
            Continue Calibration
          </span>
          <span className="font-mono text-[11px] text-foreground/40 group-hover:text-primary transition-colors">
            →
          </span>
        </Link>
      </Panel>

      {/* ─── 4. ATHLETE STATE ────────────────────────────────── */}
      <AthleteStatePanel fighter={fighter} facts={facts} />

      {/* ─── 5. ATHLETE DNA ──────────────────────────────────── */}
      <Panel>
        <div className="px-5 pt-5 pb-3">
          <SectionHead overline="Model coverage" title="Athlete DNA" />
        </div>
        <div className="px-4 pt-3 pb-5">
          <RadarChart dims={computed.radarData} />
          <p className="text-[0.75rem] text-foreground/40 leading-relaxed text-center mt-2">
            Confidence bands — how well FRAME understands each dimension.
            Not scored 1–100.
          </p>
        </div>
      </Panel>

      {/* ─── ATHLETE IDENTITY ─────────────────────────────────── */}
      {(computed.topStrength || computed.topWeakness || computed.topPattern || arch) && (
        <Panel>
          <div className="px-5 pt-5 pb-3">
            <SectionHead overline="Derived read" title="Athlete identity" />
          </div>
          <div className="divide-y" style={{ borderColor: "hsla(0,0%,100%,0.05)" }}>
            <IdentityRow
              label="Current style"
              value={`${fighter.primarySport ? sportLabel(fighter.primarySport) : fighter.art ?? "—"} · ${fighter.level}`}
            />
            {arch && (
              <>
                <IdentityRow label="Primary archetype" value={arch.name} />
                <IdentityRow
                  label="Pressure response"
                  value={leadClause(arch.pressureSignature)}
                />
                <IdentityRow label="Gift" value={leadClause(arch.gift)} />
                <IdentityRow label="Shadow" value={leadClause(arch.shadow)} />
              </>
            )}
            <IdentityRow
              label="Coaching mode"
              value={computed.coachingMode.label}
              sub={computed.coachingMode.focus}
            />
            {computed.topStrength && (
              <IdentityRow
                label="Observed strength"
                value={computed.topStrength.topic || computed.topStrength.content}
                sub={`conf ${computed.topStrength.confidence}/5`}
              />
            )}
            {computed.topWeakness && (
              <IdentityRow
                label="Observed blind spot"
                value={computed.topWeakness.topic || computed.topWeakness.content}
                sub={`conf ${computed.topWeakness.confidence}/5`}
              />
            )}
            {computed.topPattern && (
              <IdentityRow
                label="Decision pattern"
                value={computed.topPattern.topic || computed.topPattern.content}
                sub={`conf ${computed.topPattern.confidence}/5`}
              />
            )}
          </div>
        </Panel>
      )}

      {/* ─── FRAME INTEGRITY ──────────────────────────────────── */}
      <Panel>
        <div className="grid grid-cols-3 divide-x divide-white/[0.06]">
          <div className="px-3 py-2.5 text-center">
            <div className="font-mono text-[8px] uppercase tracking-[0.25em] text-muted-foreground/80 mb-1">
              Integrity
            </div>
            <div className="font-mono text-[10px] uppercase tracking-widest text-foreground/95 leading-tight">
              {computed.integrityLabel}
            </div>
          </div>
          <div className="px-3 py-2.5 text-center">
            <div className="font-mono text-[8px] uppercase tracking-[0.25em] text-muted-foreground/80 mb-1">
              Cadence
            </div>
            <div className="font-mono text-[10px] uppercase tracking-widest text-foreground/95 leading-tight">
              {fighter.trainingFrequency}
            </div>
          </div>
          <div className="px-3 py-2.5 text-center">
            <div className="font-mono text-[8px] uppercase tracking-[0.25em] text-muted-foreground/80 mb-1">
              Days in frame
            </div>
            <div className="font-mono text-[10px] uppercase tracking-widest text-foreground/95 leading-tight">
              {computed.sinceDays}
            </div>
          </div>
        </div>
        <div className="px-4 py-4 border-t border-white/[0.06]">
          <div className="flex gap-1">
            {[0, 1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className={`h-1 flex-1 transition-colors duration-700 ${
                  i < computed.integritySegments ? "bg-primary" : "bg-border/60"
                }`}
              />
            ))}
          </div>
          <div className="text-[10px] text-muted-foreground/80 leading-relaxed mt-2">
            Frame integrity — how much of your structure survives when pressure spikes.
            Composure under fragmentation, not a fitness score.
          </div>
        </div>
      </Panel>

      {/* ─── FULL ATHLETE MODEL (fact list) ───────────────────── */}
      <section className="model-reveal">
        <div className="flex items-end justify-between gap-4 mb-6 pt-2">
          <div>
            <div className="font-mono text-[9px] uppercase tracking-[0.5em] text-foreground/45 mb-2">
              Full model
            </div>
            <div className="font-sans font-extralight uppercase text-xl tracking-[0.3em] text-foreground/90 leading-none">
              {facts.length} observation{facts.length === 1 ? "" : "s"}
            </div>
          </div>
          <Link
            href="/history"
            className="flex-none font-mono text-[10px] uppercase tracking-[0.4em] text-foreground/45 hover:text-primary transition-colors"
          >
            View history →
          </Link>
        </div>

        {facts.length === 0 ? (
          <Panel className="px-5 py-6">
            <p className="text-[0.95rem] text-foreground/55 leading-relaxed">
              The model sharpens with use. As you talk to the coach, FRAME records durable
              observations and feeds them back into how you're coached.
            </p>
          </Panel>
        ) : (
          <div className="space-y-7">
            {CATEGORY_ORDER.filter((c) => (grouped[c]?.length ?? 0) > 0).map((c) => (
              <div key={c}>
                <div className="flex items-center gap-3 mb-3">
                  <div className="flex-none font-sans font-extralight uppercase text-[0.9rem] tracking-[0.3em] text-primary/90 leading-none">
                    {CATEGORY_LABELS[c]}
                  </div>
                  <div
                    className="flex-1 h-px"
                    style={{ background: "linear-gradient(to right, hsla(35,55%,55%,0.22), transparent)" }}
                  />
                  <div className="flex-none font-mono text-[9px] tabular-nums text-foreground/40">
                    {grouped[c]!.length}
                  </div>
                </div>
                <div className="space-y-2">
                  {grouped[c]!.map((f) => (
                    <div
                      key={f.id}
                      className="pl-4 py-1 flex items-baseline justify-between gap-3"
                      style={{ borderLeft: "1px solid hsla(35,55%,55%,0.25)" }}
                    >
                      <div
                        className="min-w-0 font-mono text-[10px] uppercase tracking-[0.25em] text-foreground/75 truncate"
                        title={f.topic || undefined}
                      >
                        {f.topic || f.content}
                      </div>
                      <FactConfidence value={f.confidence} />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <style>{`
        @keyframes model-reveal-in {
          from { opacity: 0; transform: translateY(12px) scale(0.99); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        .model-reveal {
          animation: model-reveal-in 0.6s cubic-bezier(0.22, 0.61, 0.36, 1) both;
        }
        @media (prefers-reduced-motion: reduce) {
          .model-reveal { animation: none; }
        }
      `}</style>
    </div>
  );
}
