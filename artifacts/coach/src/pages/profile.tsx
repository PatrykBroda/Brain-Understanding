import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useClerk, useUser } from "@clerk/react";
import { useFighter } from "@/hooks/use-fighter";
import { useMemory } from "@/hooks/use-memory";
import { BottomNav } from "@/components/bottom-nav";
import { Belt } from "@/components/belt";
import { ProfileEdit } from "@/components/profile-edit";
import { AthleteStatePanel } from "@/components/athlete-state-panel";
import { FighterCard } from "@/components/fighter-card";
import { sportLabel } from "@/lib/fighter-options";
import { getArchetype, computeCoachingMode } from "@workspace/archetypes";
import { Link } from "wouter";
import { ChevronLeft, LogOut, Pencil } from "lucide-react";
import { api, type FactCategory } from "@/lib/api";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

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

const CATEGORY_LABELS_SHORT: Record<FactCategory, string> = {
  weakness: "Gaps",
  strength: "Strengths",
  technical_knowledge: "Structure",
  pattern: "Patterns",
  preference: "Preferences",
  goal: "Goals",
  event: "Events",
  context: "Context",
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

function formatRelative(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const days = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
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

const MONTH_ABBR = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

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

// ─── Divider rule ────────────────────────────────────────────────────────────

function FrameDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 py-1">
      <div className="h-px flex-1 bg-white/[0.06]" />
      <div className="font-mono text-[8px] uppercase tracking-[0.55em] text-muted-foreground/40">
        {label}
      </div>
      <div className="h-px flex-1 bg-white/[0.06]" />
    </div>
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

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ProfilePage() {
  const { data: fighterData } = useFighter();
  const fighter = fighterData?.fighter ?? null;
  const memoryQuery = useMemory(true);
  const facts = memoryQuery.data?.facts ?? [];
  const { signOut } = useClerk();
  const { user } = useUser();
  const [isEditing, setIsEditing] = useState(false);

  const convQuery = useQuery({
    queryKey: ["conversation", "active"],
    queryFn: api.getActiveConversation,
  });
  const messages = convQuery.data?.messages ?? [];

  const grouped: Partial<Record<FactCategory, typeof facts>> = {};
  for (const f of facts) {
    (grouped[f.category] ??= []).push(f);
  }

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

    // ── FRAME NOTES: top facts from pattern / weakness / strength ──────
    const frameNotes = facts
      .filter(
        (f) =>
          f.category === "pattern" ||
          f.category === "weakness" ||
          f.category === "strength",
      )
      .sort((a, b) => b.confidence - a.confidence || (b.updatedAt < a.updatedAt ? -1 : 1))
      .slice(0, 3);

    // ── Evolution timeline: 4 most recently updated facts ─────────────
    const evolutionTimeline = [...facts]
      .sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      )
      .slice(0, 4)
      .map((f) => ({
        label: CATEGORY_LABELS_SHORT[f.category],
        topic: f.topic,
        date: f.updatedAt,
      }));

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

    // ── FRAME Hypotheses: low-confidence reads FRAME is still testing ─
    const hypotheses = [...facts]
      .filter((f) => f.confidence <= 2)
      .sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      )
      .slice(0, 3);

    // ── Emerging pattern: single most-recent pattern observation ──────
    const emergingPattern =
      [...(grouped.pattern ?? [])].sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      )[0] ?? null;

    // ── Model growth: reconstruct confidence at each month-end from when
    //    observations were first recorded. Approximate (uses current
    //    confidence values) but grounded in real createdAt timestamps.
    const modelGrowth: { label: string; pct: number }[] = [];
    if (facts.length > 0) {
      const earliest = facts.reduce(
        (min, f) =>
          new Date(f.createdAt) < min ? new Date(f.createdAt) : min,
        new Date(facts[0].createdAt),
      );
      const now = new Date();
      const cursor = new Date(
        Date.UTC(earliest.getUTCFullYear(), earliest.getUTCMonth(), 1),
      );
      let steps = 0;
      while (cursor <= now && steps < 24) {
        const monthEnd = new Date(
          Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1),
        );
        const cutoff = monthEnd <= now ? monthEnd : now;
        let covSum = 0;
        for (const c of CATEGORY_ORDER) {
          const s = facts
            .filter(
              (f) => f.category === c && new Date(f.createdAt) <= cutoff,
            )
            .reduce((acc, f) => acc + f.confidence, 0);
          covSum += Math.min(1, s / TARGET_PER_CATEGORY);
        }
        modelGrowth.push({
          label: MONTH_ABBR[cursor.getUTCMonth()],
          pct: Math.round((covSum / CATEGORY_ORDER.length) * 100),
        });
        cursor.setUTCMonth(cursor.getUTCMonth() + 1);
        steps++;
      }
    }
    const growthTrail = modelGrowth.slice(-5);

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
      categoryCoverage,
      frameConfidence,
      lowestCategories,
      frameNotes,
      evolutionTimeline,
      radarData,
      lastUpdated,
      hypotheses,
      emergingPattern,
      growthTrail,
      topStrength,
      topWeakness,
      topPattern,
      userTurns,
      sinceDays,
      integritySegments,
      integrityLabel,
      coachingMode,
    };
  }, [facts, messages, fighter, grouped]);

  const queryClient = useQueryClient();

  // ── "What changed?" — client-remembered confidence baseline per fighter ──
  const [changeInfo, setChangeInfo] = useState<{ delta: number; note: string } | null>(null);
  useEffect(() => {
    if (!fighter || facts.length === 0) return;
    const key = `frame:lastConfidence:${fighter.id}`;
    const prevRaw = localStorage.getItem(key);
    const prev = prevRaw == null ? null : Number(prevRaw);
    const current = computed.frameConfidence;
    if (prev != null && Number.isFinite(prev) && current > prev) {
      const recent = [...facts].sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      )[0];
      setChangeInfo({ delta: current - prev, note: recent?.content ?? "" });
    } else {
      setChangeInfo(null);
    }
    localStorage.setItem(key, String(current));
  }, [fighter, facts, computed.frameConfidence]);

  // ── Model Accuracy — reviewed fact ids remembered client-side ──
  const [reviewedIds, setReviewedIds] = useState<Set<number>>(new Set());
  useEffect(() => {
    if (!fighter) return;
    try {
      const raw = localStorage.getItem(`frame:reviewedFacts:${fighter.id}`);
      setReviewedIds(new Set(raw ? (JSON.parse(raw) as number[]) : []));
    } catch {
      setReviewedIds(new Set());
    }
  }, [fighter]);

  const confirmMutation = useMutation({
    mutationFn: ({ id, response }: { id: number; response: "yes" | "mostly" | "no" }) =>
      api.confirmFact(id, response),
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["memory"] });
      setReviewedIds((prev) => {
        const next = new Set(prev);
        next.add(id);
        if (fighter) {
          localStorage.setItem(
            `frame:reviewedFacts:${fighter.id}`,
            JSON.stringify([...next]),
          );
        }
        return next;
      });
    },
  });

  const confirmCandidate = useMemo(() => {
    if (!fighter) return null;
    return (
      [...facts]
        .filter((f) => f.confidence >= 2 && f.confidence <= 3 && !reviewedIds.has(f.id))
        .sort(
          (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
        )[0] ?? null
    );
  }, [facts, reviewedIds, fighter]);

  function handleConfirm(id: number, response: "yes" | "mostly" | "no") {
    confirmMutation.mutate({ id, response });
  }

  return (
    <div className="flex flex-col h-[100dvh] bg-background text-foreground">
      <header className="flex-none flex items-center justify-between px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-3 border-b border-border/40">
        <Link
          href="/"
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft className="w-5 h-5" strokeWidth={1.5} />
        </Link>
        <div className="text-center">
          <div className="font-mono text-[9px] uppercase tracking-[0.35em] text-muted-foreground">
            Athlete
          </div>
          <div className="font-mono text-sm uppercase tracking-[0.3em] text-foreground/95 mt-0.5">
            Model
          </div>
        </div>
        {fighter && !isEditing ? (
          <button
            type="button"
            onClick={() => setIsEditing(true)}
            className="text-muted-foreground hover:text-primary transition-colors"
            aria-label="Edit profile"
          >
            <Pencil className="w-4 h-4" strokeWidth={1.5} />
          </button>
        ) : (
          <div className="w-5" />
        )}
      </header>

      <main className="flex-1 overflow-y-auto">
        <div className="max-w-md mx-auto px-5 py-6 space-y-5 pb-10">
          {fighter && isEditing ? (
            <ProfileEdit fighter={fighter} onClose={() => setIsEditing(false)} />
          ) : fighter ? (
            <>
              {/* ─── 0. FIGHTER CARD ─────────────────────────────────── */}
              <FighterCard fighter={fighter} />

              {/* ─── 0b. ARCHETYPE ───────────────────────────────────── */}
              {(() => {
                const arch = fighter.spiritAnimal ? getArchetype(fighter.spiritAnimal) : null;
                if (!arch && !fighter.spiritAnimalTagline) return null;
                return (
                  <div style={{ border: "1px solid hsla(32,54%,46%,0.28)" }}>
                    {fighter.spiritAnimalTagline && (
                      <div
                        className="px-4 py-3"
                        style={{
                          borderBottom: arch ? "1px solid hsla(32,54%,46%,0.14)" : undefined,
                        }}
                      >
                        <p className="text-[12px] italic text-foreground/55 leading-relaxed">
                          {fighter.spiritAnimalTagline}
                        </p>
                      </div>
                    )}
                    {arch && (
                      <div>
                        <div
                          className="flex items-center gap-3 px-4 py-3"
                          style={{ borderBottom: "1px solid hsla(0,0%,100%,0.05)" }}
                        >
                          <div className="h-px flex-1" style={{ background: "hsla(32,54%,46%,0.25)" }} />
                          <div
                            className="font-mono text-[8px] uppercase tracking-[0.55em]"
                            style={{ color: "hsl(32,54%,50%)" }}
                          >
                            {arch.name} Archetype
                          </div>
                          <div className="h-px flex-1" style={{ background: "hsla(32,54%,46%,0.25)" }} />
                        </div>
                        <div className="divide-y" style={{ borderColor: "hsla(0,0%,100%,0.04)" }}>
                          <ArchRow label="Under pressure" text={arch.pressureSignature} />
                          <ArchRow label="Gift" text={arch.gift} />
                          <ArchRow label="Shadow" text={arch.shadow} />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* ─── 1. MODEL CONFIDENCE ──────────────────────────────── */}
              <Panel className="frame-reveal">
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
                      {changeInfo.note && (
                        <p className="text-[0.8rem] text-foreground/70 leading-relaxed mt-2">
                          New understanding — {changeInfo.note}
                        </p>
                      )}
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

              {/* ─── EMERGING PATTERN ────────────────────────────────── */}
              {computed.emergingPattern && (
                <Panel accent className="px-5 py-4">
                  <div className="flex items-center gap-2.5 mb-2">
                    <span className="w-1 h-1 rounded-full bg-primary flex-none" />
                    <div className="font-mono text-[9px] uppercase tracking-[0.5em] text-primary/75">
                      Emerging pattern
                    </div>
                  </div>
                  <p className="text-[0.95rem] text-foreground/85 leading-relaxed">
                    {computed.emergingPattern.content}
                  </p>
                </Panel>
              )}

              {/* ─── 2. FRAME NOTES ──────────────────────────────────── */}
              {computed.frameNotes.length > 0 && (
                <Panel>
                  <div className="px-5 pt-5 pb-3">
                    <SectionHead overline="What FRAME sees" title="Frame notes" />
                  </div>
                  <div className="divide-y" style={{ borderColor: "hsla(0,0%,100%,0.05)" }}>
                    {computed.frameNotes.map((f) => (
                      <div key={f.id} className="px-5 py-4">
                        <div className="flex items-center justify-between gap-3 mb-2">
                          <div
                            className="font-mono text-[9px] uppercase tracking-[0.4em] text-foreground/45 truncate"
                            title={f.source || undefined}
                          >
                            {CATEGORY_LABELS_SHORT[f.category]}
                            {f.topic ? ` · ${f.topic}` : ""}
                          </div>
                          <FactConfidence value={f.confidence} />
                        </div>
                        <p className="text-[0.95rem] text-foreground/80 leading-relaxed">
                          {f.content}
                        </p>
                      </div>
                    ))}
                  </div>
                </Panel>
              )}

              {facts.length === 0 && (
                <Panel className="px-5 py-6">
                  <div className="font-mono text-[9px] uppercase tracking-[0.5em] text-primary/75 mb-3">
                    Frame notes
                  </div>
                  <p className="text-[0.95rem] text-foreground/55 leading-relaxed">
                    The model sharpens with use. As you talk to the coach, FRAME records durable
                    observations and surfaces them here — what's leaking, what's solid, where
                    confidence is still forming.
                  </p>
                </Panel>
              )}

              {/* ─── FRAME HYPOTHESES (uncertainty) ──────────────────── */}
              {computed.hypotheses.length > 0 && (
                <Panel>
                  <div className="px-5 pt-5 pb-3">
                    <SectionHead overline="Still testing" title="Frame hypotheses" />
                  </div>
                  <div className="px-5 pb-5">
                    <p className="text-[0.8rem] text-foreground/50 leading-relaxed mb-4">
                      Low-confidence reads FRAME is still testing — it may confirm or drop
                      these as it sees more.
                    </p>
                    <ul className="space-y-3">
                      {computed.hypotheses.map((f) => (
                        <li key={f.id} className="flex items-start gap-3">
                          <span
                            className="flex-none mt-[7px] w-1 h-1 rounded-full"
                            style={{ background: "hsla(35,55%,55%,0.4)" }}
                          />
                          <span
                            className="text-[0.95rem] text-foreground/75 leading-relaxed"
                            title={
                              f.source
                                ? `${f.source} · confidence ${f.confidence}/5`
                                : `Confidence ${f.confidence}/5`
                            }
                          >
                            {f.content}
                          </span>
                        </li>
                      ))}
                    </ul>
                    <div className="font-mono text-[9px] uppercase tracking-[0.4em] text-foreground/35 mt-4">
                      Confidence · low
                    </div>
                  </div>
                </Panel>
              )}

              {/* ─── MODEL ACCURACY (confirm / reject) ───────────────── */}
              {confirmCandidate && (
                <Panel accent>
                  <div className="px-5 pt-5 pb-3">
                    <SectionHead overline="Help FRAME" title="Model accuracy" />
                  </div>
                  <div className="px-5 pb-5">
                    <div className="font-mono text-[9px] uppercase tracking-[0.45em] text-foreground/40 mb-2">
                      FRAME observation
                    </div>
                    <p
                      className="text-[0.95rem] text-foreground/85 leading-relaxed mb-4"
                      title={
                        confirmCandidate.source
                          ? `${confirmCandidate.source} · confidence ${confirmCandidate.confidence}/5`
                          : `Confidence ${confirmCandidate.confidence}/5`
                      }
                    >
                      {confirmCandidate.content}
                    </p>
                    <div className="font-mono text-[9px] uppercase tracking-[0.35em] text-foreground/55 mb-3">
                      Is that accurate?
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {(
                        [
                          ["yes", "Yes"],
                          ["mostly", "Mostly"],
                          ["no", "Not really"],
                        ] as const
                      ).map(([value, label]) => (
                        <button
                          key={value}
                          type="button"
                          disabled={confirmMutation.isPending}
                          onClick={() => handleConfirm(confirmCandidate.id, value)}
                          className="border border-white/[0.1] hover:border-primary/50 hover:text-primary text-foreground/75 transition-colors py-2.5 font-mono text-[9px] uppercase tracking-[0.25em] disabled:opacity-40"
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    <p className="text-[0.75rem] text-foreground/40 leading-relaxed mt-3">
                      Your answer trains the model. FRAME would rather be corrected than
                      confidently wrong.
                    </p>
                  </div>
                </Panel>
              )}

              {/* ─── 3. EVOLUTION TIMELINE ───────────────────────────── */}
              {computed.evolutionTimeline.length > 0 && (
                <Panel>
                  <div className="px-5 pt-5 pb-3">
                    <SectionHead overline="Latest signal" title="Recent calibration" />
                  </div>
                  <div className="px-5 pb-5 pt-1 space-y-3.5">
                    {computed.evolutionTimeline.map((ev, i) => (
                      <div key={i} className="flex items-center gap-3">
                        <span
                          className="flex-none w-1.5 h-1.5 rounded-full"
                          style={{
                            background: "hsl(35,58%,55%)",
                            boxShadow: "0 0 8px hsla(35,58%,55%,0.5)",
                          }}
                          aria-hidden
                        />
                        <div className="min-w-0 flex-1">
                          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-foreground/70">
                            {ev.label}
                            {ev.topic ? ` — ${ev.topic}` : ""} updated
                          </span>
                        </div>
                        <div className="flex-none font-mono text-[9px] uppercase tracking-[0.2em] text-foreground/40 whitespace-nowrap">
                          {formatRelative(ev.date)}
                        </div>
                      </div>
                    ))}
                  </div>
                </Panel>
              )}

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

              {/* ─── CONFIDENCE TIMELINE ─────────────────────────────── */}
              {computed.growthTrail.length >= 2 && (
                <Panel>
                  <div className="px-5 pt-5 pb-3">
                    <SectionHead overline="Model growth" title="Confidence timeline" />
                  </div>
                  <div className="px-5 pt-3 pb-5">
                    <div className="flex items-end justify-between gap-2 h-24">
                      {computed.growthTrail.map((pt, i) => {
                        const last = i === computed.growthTrail.length - 1;
                        return (
                          <div
                            key={i}
                            className="flex-1 flex flex-col items-center justify-end gap-1.5 h-full"
                          >
                            <span
                              className={`font-mono text-[9px] tabular-nums ${last ? "text-primary/90" : "text-foreground/45"}`}
                            >
                              {pt.pct}
                            </span>
                            <div
                              className="w-full transition-[height] duration-700"
                              style={{
                                height: `${Math.max(4, pt.pct)}%`,
                                background: last
                                  ? "hsl(35,58%,55%)"
                                  : "hsla(35,55%,52%,0.28)",
                              }}
                            />
                            <span className="font-mono text-[8px] uppercase tracking-[0.3em] text-foreground/35">
                              {pt.label}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                    <p className="text-[0.75rem] text-foreground/40 leading-relaxed mt-4">
                      Reconstructed from when FRAME first recorded each observation —
                      an approximation of how its model of you has grown, not a stored history.
                    </p>
                  </div>
                </Panel>
              )}

              {/* ─── ATHLETE IDENTITY ─────────────────────────────────── */}
              {(computed.topStrength || computed.topWeakness || computed.topPattern) && (
                <Panel>
                  <div className="px-5 pt-5 pb-3">
                    <SectionHead overline="Derived read" title="Athlete identity" />
                  </div>
                  <div className="divide-y" style={{ borderColor: "hsla(0,0%,100%,0.05)" }}>
                    <IdentityRow
                      label="Current style"
                      value={`${fighter.primarySport ? sportLabel(fighter.primarySport) : fighter.art ?? "—"} · ${fighter.level}`}
                    />
                    {(() => {
                      const arch = fighter.spiritAnimal
                        ? getArchetype(fighter.spiritAnimal)
                        : null;
                      if (!arch) return null;
                      return (
                        <>
                          <IdentityRow label="Primary archetype" value={arch.name} />
                          <IdentityRow
                            label="Pressure response"
                            value={leadClause(arch.pressureSignature)}
                          />
                        </>
                      );
                    })()}
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

              {/* ─── FRAME RANK ───────────────────────────────────────── */}
              <div
                className="relative border border-white/[0.08] overflow-hidden"
                style={{
                  background: "linear-gradient(180deg, hsla(40,45%,55%,0.04), transparent 55%)",
                }}
              >
                <div className="flex items-center justify-between px-4 pt-3.5 pb-1">
                  <div className="font-mono text-[10px] uppercase tracking-[0.35em] text-primary/85">
                    Frame rank
                  </div>
                  <div className="font-mono text-[8px] uppercase tracking-[0.25em] text-muted-foreground/70">
                    Calibration ladder
                  </div>
                </div>
                <div className="px-4 pb-4 pt-3">
                  <Belt level={fighter.level} />
                </div>
                <div className="grid grid-cols-3 border-t border-white/[0.06] divide-x divide-white/[0.06]">
                  <RankMeta label="Integrity" value={computed.integrityLabel} />
                  <RankMeta label="Cadence" value={fighter.trainingFrequency} />
                  <RankMeta label="Days in frame" value={String(computed.sinceDays)} />
                </div>
                <div className="px-4 py-4">
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
              </div>

              <Link
                href="/camp"
                className="flex items-center justify-between border border-white/[0.08] px-4 py-3 hover:border-[hsl(var(--red-accent))]/50 transition-colors group"
              >
                <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-foreground/70 group-hover:text-[hsl(var(--red-accent))] transition-colors">
                  Competition mode
                </span>
                <span className="font-mono text-[9px] uppercase tracking-[0.25em] text-foreground/40">
                  Schedule / countdown
                </span>
              </Link>

              {/* ─── FULL ATHLETE MODEL (fact list) ───────────────────── */}
              <NodeDivider className="pt-1" />

              <section className="frame-reveal">
                <div className="flex items-end justify-between gap-4 mb-6">
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

                {facts.length > 0 && (
                  <Panel className="mb-7">
                    <div className="px-5 pt-4 pb-2">
                      <div className="font-mono text-[9px] uppercase tracking-[0.5em] text-foreground/40">
                        Category coverage
                      </div>
                    </div>
                    <div className="px-5 pb-5 pt-1 space-y-3">
                      {CATEGORY_ORDER.filter((c) => (grouped[c]?.length ?? 0) > 0).map((c) => {
                        const count = grouped[c]?.length ?? 0;
                        const pct = Math.round(computed.categoryCoverage[c] * 100);
                        return (
                          <div key={c} className="flex items-center gap-3">
                            <div className="flex-none w-28 font-mono text-[9px] uppercase tracking-[0.25em] text-foreground/55 truncate">
                              {CATEGORY_LABELS[c]}
                            </div>
                            <div className="flex-1 relative h-[3px] bg-white/[0.06] overflow-hidden">
                              <div
                                className="absolute top-0 left-0 h-full transition-[width] duration-700"
                                style={{ width: `${pct}%`, background: "hsl(35,58%,55%)" }}
                              />
                            </div>
                            <div className="flex-none font-mono text-[9px] tabular-nums text-foreground/70 w-5 text-right">
                              {count}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </Panel>
                )}

                {facts.length === 0 ? (
                  <Panel className="px-5 py-6">
                    <p className="text-[0.95rem] text-foreground/55 leading-relaxed">
                      The model sharpens with use. As you talk to the coach, FRAME records durable
                      observations and feeds them back into how you're coached.
                    </p>
                  </Panel>
                ) : (
                  <div className="space-y-8">
                    {CATEGORY_ORDER.filter((c) => (grouped[c]?.length ?? 0) > 0).map((c) => (
                      <div key={c}>
                        <div className="flex items-center gap-3 mb-4">
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
                        <div className="space-y-3">
                          {grouped[c]!.map((f) => (
                            <div
                              key={f.id}
                              className="pl-4 py-1.5"
                              style={{ borderLeft: "1px solid hsla(35,55%,55%,0.25)" }}
                            >
                              <div className="flex items-baseline justify-between gap-3 mb-1.5">
                                <div
                                  className="font-mono text-[10px] uppercase tracking-[0.25em] text-foreground/75 truncate"
                                  title={f.source || undefined}
                                >
                                  {f.topic}
                                </div>
                                <FactConfidence value={f.confidence} />
                              </div>
                              <div className="text-[0.95rem] text-foreground/85 leading-relaxed">
                                {f.content}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </>
          ) : (
            <div className="text-sm text-muted-foreground py-10 text-center">
              No athlete model yet.
            </div>
          )}

          <div className="h-px bg-border/60 mt-2" />

          <section className="space-y-3">
            <div className="font-mono text-[10px] uppercase tracking-[0.35em] text-muted-foreground">
              Account
            </div>
            {user?.primaryEmailAddress?.emailAddress && (
              <div className="font-mono text-[11px] text-foreground/70 tracking-wide">
                {user.primaryEmailAddress.emailAddress}
              </div>
            )}
            <button
              type="button"
              onClick={() => signOut({ redirectUrl: basePath || "/" })}
              className="w-full flex items-center justify-center gap-2 border border-border/60 hover:border-primary/40 hover:text-primary text-foreground/75 transition-colors py-3 font-mono text-[10px] uppercase tracking-[0.3em]"
            >
              <LogOut className="w-3.5 h-3.5" strokeWidth={1.5} />
              Sign out
            </button>
          </section>
        </div>
      </main>

      <BottomNav />
      <ProfileAnimations />
    </div>
  );
}

// ─── Small components ─────────────────────────────────────────────────────────

function RankMeta({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-3 py-2.5 text-center">
      <div className="font-mono text-[8px] uppercase tracking-[0.25em] text-muted-foreground/80 mb-1">
        {label}
      </div>
      <div className="font-mono text-[10px] uppercase tracking-widest text-foreground/95 leading-tight">
        {value}
      </div>
    </div>
  );
}

function ArchRow({ label, text }: { label: string; text: string }) {
  return (
    <div className="px-4 py-3.5">
      <div
        className="font-mono text-[8px] uppercase tracking-[0.55em] mb-1.5"
        style={{ color: "hsl(32,54%,50%)" }}
      >
        {label}
      </div>
      <p className="text-[12px] text-foreground/75 leading-relaxed">{text}</p>
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

function ProfileAnimations() {
  return (
    <style>{`
      @keyframes profile-id-in {
        from { opacity: 0; transform: translateY(10px); }
        to   { opacity: 1; transform: translateY(0); }
      }
      .profile-id-card {
        animation: profile-id-in 0.55s cubic-bezier(0.22, 0.61, 0.36, 1) 0.05s both;
      }
      @keyframes frame-reveal-in {
        from { opacity: 0; transform: translateY(12px) scale(0.99); }
        to   { opacity: 1; transform: translateY(0) scale(1); }
      }
      .frame-reveal {
        animation: frame-reveal-in 0.6s cubic-bezier(0.22, 0.61, 0.36, 1) both;
      }
      @media (prefers-reduced-motion: reduce) {
        .profile-id-card,
        .frame-reveal { animation: none; }
      }
    `}</style>
  );
}
