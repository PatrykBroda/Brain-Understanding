import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useClerk, useUser } from "@clerk/react";
import { useFighter } from "@/hooks/use-fighter";
import { useMemory } from "@/hooks/use-memory";
import { BottomNav } from "@/components/bottom-nav";
import { Belt } from "@/components/belt";
import { ProfileEdit } from "@/components/profile-edit";
import { AthleteStatePanel } from "@/components/athlete-state-panel";
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
const FRAME_UNLOCK_PCT = 25; // % at which Fight Readiness unlocks

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
    const isReadinessUnlocked = frameConfidence >= FRAME_UNLOCK_PCT;

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

    // ── Readiness band (living model, not a one-time unlock) ──────────
    let readinessBand = "Low";
    if (frameConfidence >= 60) readinessBand = "High";
    else if (frameConfidence >= 42) readinessBand = "Medium";

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
      isReadinessUnlocked,
      lowestCategories,
      frameNotes,
      evolutionTimeline,
      radarData,
      lastUpdated,
      hypotheses,
      emergingPattern,
      readinessBand,
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
              {/* ─── 0. COMBAT IDENTITY HERO ─────────────────────────── */}
              {(() => {
                const arch = fighter.spiritAnimal ? getArchetype(fighter.spiritAnimal) : null;
                return (
                  <div className="profile-id-card" style={{ border: "1px solid hsla(32,54%,46%,0.35)" }}>
                    <div className="flex gap-0">
                      <div
                        className="flex-none flex items-center justify-center"
                        style={{
                          width: 110,
                          minHeight: 110,
                          borderRight: "1px solid hsla(32,54%,46%,0.2)",
                          background: "hsla(0,0%,0%,0.35)",
                        }}
                      >
                        {fighter.spiritAnimal ? (
                          <img
                            src={`${basePath}/spirit/${fighter.spiritAnimal}.png`}
                            alt={fighter.spiritAnimal}
                            className="w-[72px] h-[72px] object-contain"
                            style={{ opacity: 0.88 }}
                            draggable={false}
                          />
                        ) : (
                          <span className="font-mono text-2xl uppercase tracking-widest text-primary/60">
                            {fighter.name.charAt(0)}
                          </span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0 px-4 py-4 flex flex-col justify-center">
                        <div className="font-mono text-[8px] uppercase tracking-[0.55em] text-muted-foreground/50 mb-2">
                          Combat identity
                        </div>
                        <div className="font-mono text-2xl uppercase tracking-[0.12em] text-foreground/95 leading-none mb-2 truncate">
                          {fighter.name}
                        </div>
                        {fighter.spiritAnimal && (
                          <div
                            className="font-mono text-[11px] uppercase tracking-[0.4em] mb-2.5"
                            style={{ color: "hsl(32,54%,50%)" }}
                          >
                            {fighter.spiritAnimal}
                          </div>
                        )}
                        <div className="space-y-0.5">
                          <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground/65">
                            {fighter.primarySport ? sportLabel(fighter.primarySport) : fighter.art}
                          </div>
                          <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground/45">
                            {fighter.trainingFrequency}
                            {fighter.gym ? ` · ${fighter.gym}` : ""}
                          </div>
                        </div>
                      </div>
                    </div>

                    {fighter.spiritAnimalTagline && (
                      <div
                        className="px-4 py-3"
                        style={{ borderTop: "1px solid hsla(32,54%,46%,0.14)" }}
                      >
                        <p className="text-[12px] italic text-foreground/55 leading-relaxed">
                          {fighter.spiritAnimalTagline}
                        </p>
                      </div>
                    )}

                    {arch && (
                      <div style={{ borderTop: "1px solid hsla(32,54%,46%,0.2)" }}>
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

              {/* ─── 1. FRAME CONFIDENCE ──────────────────────────────── */}
              <div className="border border-white/[0.08] overflow-hidden">
                <div className="px-4 pt-4 pb-3">
                  <div className="flex items-baseline justify-between mb-3">
                    <div className="font-mono text-[10px] uppercase tracking-[0.35em] text-primary/85">
                      Understanding your game
                    </div>
                    {memoryQuery.isFetching && (
                      <div className="font-mono text-[8px] uppercase tracking-widest text-muted-foreground/50">
                        Syncing
                      </div>
                    )}
                  </div>

                  <div className="flex items-baseline gap-3 mb-1.5">
                    <div className="font-mono text-3xl text-foreground/95 tabular-nums leading-none">
                      {computed.frameConfidence}
                      <span className="text-lg text-foreground/60">%</span>
                    </div>
                    <div className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground/60 leading-snug">
                      Model confidence
                    </div>
                  </div>

                  {computed.lastUpdated && (
                    <div className="font-mono text-[9px] tracking-wide text-muted-foreground/45 mb-3">
                      Updated {formatHeartbeat(computed.lastUpdated)}
                    </div>
                  )}

                  <ConfidenceBar pct={computed.frameConfidence} segments={20} />

                  {changeInfo && (
                    <div
                      className="mt-3 px-3 py-2.5"
                      style={{
                        border: "1px solid hsla(32,54%,46%,0.28)",
                        background: "hsla(32,54%,46%,0.05)",
                      }}
                    >
                      <div className="flex items-baseline justify-between">
                        <span className="font-mono text-[8px] uppercase tracking-[0.4em] text-primary/75">
                          Model updated
                        </span>
                        <span
                          className="font-mono text-[11px] tabular-nums"
                          style={{ color: "hsl(32,54%,55%)" }}
                        >
                          +{changeInfo.delta}%
                        </span>
                      </div>
                      {changeInfo.note && (
                        <p className="text-[11px] text-foreground/70 leading-relaxed mt-1.5">
                          New understanding — {changeInfo.note}
                        </p>
                      )}
                    </div>
                  )}

                  <p className="font-mono text-[10px] text-muted-foreground/55 leading-relaxed mt-2.5">
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
                    className="px-4 pb-4"
                    style={{ borderTop: "1px solid hsla(0,0%,100%,0.05)" }}
                  >
                    <div className="font-mono text-[8px] uppercase tracking-[0.4em] text-muted-foreground/45 mb-2 pt-3">
                      Lowest confidence
                    </div>
                    <ul className="space-y-1">
                      {computed.lowestCategories.map((c) => (
                        <li
                          key={c}
                          className="flex items-center gap-2"
                        >
                          <span className="w-1 h-1 rounded-full bg-muted-foreground/30 flex-none" />
                          <span className="font-mono text-[10px] text-foreground/65">
                            {CATEGORY_LABELS[c]}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div style={{ borderTop: "1px solid hsla(0,0%,100%,0.06)" }}>
                  <Link
                    href="/chat"
                    className="flex items-center justify-between px-4 py-3 hover:bg-white/[0.02] transition-colors group"
                  >
                    <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-primary/70 group-hover:text-primary transition-colors">
                      Continue Calibration
                    </span>
                    <span className="font-mono text-[9px] text-muted-foreground/45">→</span>
                  </Link>
                </div>
              </div>

              {/* ─── EMERGING PATTERN ────────────────────────────────── */}
              {computed.emergingPattern && (
                <div
                  className="border px-4 py-3.5"
                  style={{
                    borderColor: "hsla(32,54%,46%,0.22)",
                    background:
                      "linear-gradient(180deg, hsla(32,54%,46%,0.05), transparent 70%)",
                  }}
                >
                  <div className="font-mono text-[8px] uppercase tracking-[0.5em] text-primary/70 mb-1.5">
                    Emerging pattern
                  </div>
                  <p className="text-[13px] text-foreground/85 leading-relaxed">
                    {computed.emergingPattern.content}
                  </p>
                </div>
              )}

              {/* ─── 2. FRAME NOTES ──────────────────────────────────── */}
              {computed.frameNotes.length > 0 && (
                <div className="border border-white/[0.08]">
                  <div className="flex items-center justify-between px-4 pt-3.5 pb-1">
                    <div className="font-mono text-[10px] uppercase tracking-[0.35em] text-primary/85">
                      FRAME Notes
                    </div>
                    <div className="font-mono text-[8px] uppercase tracking-[0.25em] text-muted-foreground/45">
                      What FRAME sees
                    </div>
                  </div>
                  <div className="divide-y" style={{ borderColor: "hsla(0,0%,100%,0.05)" }}>
                    {computed.frameNotes.map((f) => (
                      <div key={f.id} className="px-4 py-3.5">
                        <div className="flex items-center justify-between gap-3 mb-1.5">
                          <div className="font-mono text-[8px] uppercase tracking-[0.4em] text-muted-foreground/50">
                            {CATEGORY_LABELS_SHORT[f.category]}
                            {f.topic ? ` · ${f.topic}` : ""}
                          </div>
                          <div className="font-mono text-[8px] uppercase tracking-widest text-muted-foreground/35">
                            Confidence {f.confidence}/5
                          </div>
                        </div>
                        <p className="text-[12px] text-foreground/80 leading-relaxed">
                          {f.content}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {facts.length === 0 && (
                <div className="border border-border/40 px-4 py-5">
                  <div className="font-mono text-[10px] uppercase tracking-[0.35em] text-primary/85 mb-2">
                    FRAME Notes
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    The model sharpens with use. As you talk to the coach, FRAME records durable
                    observations and surfaces them here — what's leaking, what's solid, where
                    confidence is still forming.
                  </p>
                </div>
              )}

              {/* ─── FRAME HYPOTHESES (uncertainty) ──────────────────── */}
              {computed.hypotheses.length > 0 && (
                <div className="border border-white/[0.08]">
                  <div className="flex items-center justify-between px-4 pt-3.5 pb-1">
                    <div className="font-mono text-[10px] uppercase tracking-[0.35em] text-primary/85">
                      FRAME Hypotheses
                    </div>
                    <div className="font-mono text-[8px] uppercase tracking-[0.25em] text-muted-foreground/45">
                      Still testing
                    </div>
                  </div>
                  <div className="px-4 pt-2 pb-2">
                    <p className="font-mono text-[9px] text-muted-foreground/50 leading-relaxed mb-2.5">
                      Low-confidence reads FRAME is still testing — it may confirm or drop
                      these as it sees more.
                    </p>
                    <ul className="space-y-2">
                      {computed.hypotheses.map((f) => (
                        <li key={f.id} className="flex items-start gap-2.5">
                          <span className="flex-none mt-1.5 w-1 h-1 rounded-full bg-muted-foreground/35" />
                          <span className="text-[12px] text-foreground/75 leading-relaxed">
                            {f.content}
                          </span>
                        </li>
                      ))}
                    </ul>
                    <div className="font-mono text-[8px] uppercase tracking-[0.3em] text-muted-foreground/40 mt-3">
                      Confidence: Low
                    </div>
                  </div>
                </div>
              )}

              {/* ─── MODEL ACCURACY (confirm / reject) ───────────────── */}
              {confirmCandidate && (
                <div
                  className="border"
                  style={{ borderColor: "hsla(32,54%,46%,0.28)" }}
                >
                  <div className="flex items-center justify-between px-4 pt-3.5 pb-1">
                    <div className="font-mono text-[10px] uppercase tracking-[0.35em] text-primary/85">
                      Model Accuracy
                    </div>
                    <div className="font-mono text-[8px] uppercase tracking-[0.25em] text-muted-foreground/45">
                      Help FRAME
                    </div>
                  </div>
                  <div className="px-4 pt-2 pb-4">
                    <div className="font-mono text-[8px] uppercase tracking-[0.45em] text-muted-foreground/45 mb-1.5">
                      FRAME observation
                    </div>
                    <p className="text-[13px] text-foreground/85 leading-relaxed mb-3">
                      {confirmCandidate.content}
                    </p>
                    <div className="font-mono text-[9px] text-muted-foreground/55 mb-2.5">
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
                          className="border border-white/[0.1] hover:border-primary/50 hover:text-primary text-foreground/75 transition-colors py-2 font-mono text-[9px] uppercase tracking-[0.2em] disabled:opacity-40"
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    <p className="font-mono text-[8px] text-muted-foreground/40 leading-relaxed mt-2.5">
                      Your answer trains the model. FRAME would rather be corrected than
                      confidently wrong.
                    </p>
                  </div>
                </div>
              )}

              {/* ─── 3. EVOLUTION TIMELINE ───────────────────────────── */}
              {computed.evolutionTimeline.length > 0 && (
                <div className="border border-white/[0.08]">
                  <div className="px-4 pt-3.5 pb-1">
                    <div className="font-mono text-[10px] uppercase tracking-[0.35em] text-primary/85">
                      Recent Calibration
                    </div>
                  </div>
                  <div className="px-4 pb-4 pt-2 space-y-2">
                    {computed.evolutionTimeline.map((ev, i) => (
                      <div key={i} className="flex items-start gap-3">
                        <span
                          className="flex-none mt-1 w-3 h-3 flex items-center justify-center"
                          style={{ color: "hsl(32,54%,50%)" }}
                        >
                          ✓
                        </span>
                        <div className="min-w-0 flex-1">
                          <span className="font-mono text-[10px] text-foreground/75">
                            {ev.label}
                            {ev.topic ? ` — ${ev.topic}` : ""} updated
                          </span>
                        </div>
                        <div className="flex-none font-mono text-[9px] text-muted-foreground/40 whitespace-nowrap">
                          {formatRelative(ev.date)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ─── 4. FIGHT READINESS (confidence-gated) ───────────── */}
              {computed.isReadinessUnlocked ? (
                <div className="space-y-2">
                  <div
                    className="border px-4 py-2.5 flex items-baseline justify-between gap-3"
                    style={{ borderColor: "hsla(32,54%,46%,0.22)" }}
                  >
                    <span className="font-mono text-[8px] uppercase tracking-[0.4em] text-primary/70">
                      Available · Confidence: {computed.readinessBand}
                    </span>
                    <span className="font-mono text-[9px] text-muted-foreground/45 text-right">
                      Reason: model at {computed.frameConfidence}%
                    </span>
                  </div>
                  <AthleteStatePanel fighter={fighter} facts={facts} />
                </div>
              ) : (
                <div className="border border-white/[0.08]">
                  <div className="flex items-center justify-between px-4 pt-3.5 pb-1">
                    <div className="font-mono text-[10px] uppercase tracking-[0.35em] text-primary/85">
                      Fight Readiness
                    </div>
                    <div className="font-mono text-[8px] uppercase tracking-[0.25em] text-muted-foreground/45">
                      Unavailable
                    </div>
                  </div>
                  <div className="px-4 pb-5 pt-3">
                    <p className="font-mono text-[11px] text-foreground/55 leading-relaxed mb-3">
                      FRAME requires a higher confidence in your athlete model before it can
                      make reliable fight-readiness reads.
                    </p>
                    <div className="flex items-center gap-3">
                      <ConfidenceBar pct={computed.frameConfidence} segments={12} />
                    </div>
                    <div className="flex items-baseline justify-between mt-2">
                      <span className="font-mono text-[9px] text-foreground/50 tabular-nums">
                        {computed.frameConfidence}% current
                      </span>
                      <span className="font-mono text-[9px] text-muted-foreground/40 tabular-nums">
                        {FRAME_UNLOCK_PCT}% required
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* ─── 5. ATHLETE DNA ──────────────────────────────────── */}
              <div className="border border-white/[0.08]">
                <div className="flex items-center justify-between px-4 pt-3.5 pb-1">
                  <div className="font-mono text-[10px] uppercase tracking-[0.35em] text-primary/85">
                    Athlete DNA
                  </div>
                  <div className="font-mono text-[8px] uppercase tracking-[0.25em] text-muted-foreground/45">
                    Model coverage
                  </div>
                </div>
                <div className="px-4 pt-2 pb-4">
                  <RadarChart dims={computed.radarData} />
                  <p className="font-mono text-[9px] text-muted-foreground/40 leading-relaxed text-center mt-1">
                    Confidence bands — how well FRAME understands each dimension.
                    Not scored 1–100.
                  </p>
                </div>
              </div>

              {/* ─── CONFIDENCE TIMELINE ─────────────────────────────── */}
              {computed.growthTrail.length >= 2 && (
                <div className="border border-white/[0.08]">
                  <div className="flex items-center justify-between px-4 pt-3.5 pb-1">
                    <div className="font-mono text-[10px] uppercase tracking-[0.35em] text-primary/85">
                      Confidence Timeline
                    </div>
                    <div className="font-mono text-[8px] uppercase tracking-[0.25em] text-muted-foreground/45">
                      Model growth
                    </div>
                  </div>
                  <div className="px-4 pt-3 pb-4">
                    <div className="flex items-end justify-between gap-2 h-20">
                      {computed.growthTrail.map((pt, i) => (
                        <div
                          key={i}
                          className="flex-1 flex flex-col items-center justify-end gap-1.5 h-full"
                        >
                          <span className="font-mono text-[8px] text-foreground/55 tabular-nums">
                            {pt.pct}
                          </span>
                          <div
                            className="w-full"
                            style={{
                              height: `${Math.max(4, pt.pct)}%`,
                              background:
                                i === computed.growthTrail.length - 1
                                  ? "hsl(32,54%,50%)"
                                  : "hsla(32,54%,46%,0.3)",
                            }}
                          />
                          <span className="font-mono text-[7px] uppercase tracking-widest text-muted-foreground/40">
                            {pt.label}
                          </span>
                        </div>
                      ))}
                    </div>
                    <p className="font-mono text-[8px] text-muted-foreground/40 leading-relaxed mt-3">
                      Reconstructed from when FRAME first recorded each observation —
                      an approximation of how its model of you has grown, not a stored history.
                    </p>
                  </div>
                </div>
              )}

              {/* ─── ATHLETE IDENTITY ─────────────────────────────────── */}
              {(computed.topStrength || computed.topWeakness || computed.topPattern) && (
                <div className="border border-white/[0.08]">
                  <div className="px-4 pt-3.5 pb-1">
                    <div className="font-mono text-[10px] uppercase tracking-[0.35em] text-primary/85">
                      Athlete Identity
                    </div>
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
                </div>
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
                href="/competition"
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
              <div className="h-px bg-border/40" />

              <section>
                <div className="flex items-baseline justify-between mb-5">
                  <div>
                    <div className="font-mono text-[10px] uppercase tracking-[0.35em] text-muted-foreground mb-1">
                      Full model
                    </div>
                    <div className="font-mono text-sm uppercase tracking-widest text-foreground/95">
                      {facts.length} observation{facts.length === 1 ? "" : "s"}
                    </div>
                  </div>
                </div>

                {facts.length > 0 && (
                  <div className="space-y-1.5 mb-6">
                    {CATEGORY_ORDER.filter((c) => (grouped[c]?.length ?? 0) > 0).map((c) => {
                      const count = grouped[c]?.length ?? 0;
                      const pct = Math.round(computed.categoryCoverage[c] * 100);
                      return (
                        <div key={c} className="flex items-center gap-3">
                          <div className="flex-none w-32 font-mono text-[9px] uppercase tracking-widest text-muted-foreground truncate">
                            {CATEGORY_LABELS[c]}
                          </div>
                          <div className="flex-1 relative h-[3px] bg-border/40 overflow-hidden">
                            <div
                              className="absolute top-0 left-0 h-full bg-primary/70"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <div className="flex-none font-mono text-[9px] uppercase tracking-widest text-foreground/80 w-5 text-right">
                            {count}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {facts.length === 0 ? (
                  <div className="text-sm text-muted-foreground leading-relaxed border border-border/40 p-4">
                    The model sharpens with use. As you talk to the coach, FRAME records durable
                    observations and feeds them back into how you're coached.
                  </div>
                ) : (
                  <div className="space-y-7">
                    {CATEGORY_ORDER.filter((c) => (grouped[c]?.length ?? 0) > 0).map((c) => (
                      <div key={c}>
                        <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-primary/85 mb-3">
                          {CATEGORY_LABELS[c]}
                        </div>
                        <div className="space-y-2.5">
                          {grouped[c]!.map((f) => (
                            <div key={f.id} className="border-l-2 border-border/60 pl-3 py-1">
                              <div className="flex items-baseline justify-between gap-3 mb-0.5">
                                <div className="font-mono text-[10px] uppercase tracking-widest text-foreground/80 truncate">
                                  {f.topic}
                                </div>
                                <div className="flex-none font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
                                  conf {f.confidence}/5
                                </div>
                              </div>
                              <div className="text-sm text-foreground/90 leading-snug">
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
      @media (prefers-reduced-motion: reduce) {
        .profile-id-card { animation: none; }
      }
    `}</style>
  );
}
