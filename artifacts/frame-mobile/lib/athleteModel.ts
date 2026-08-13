// Athlete-model derivations — ported verbatim from the web so the mobile
// Passport shows the SAME numbers, stages, copy and thresholds as the site.
// Sources of truth:
//   - lib/archetypes/src/index.ts        (ARCHETYPES, computeCoachingMode)
//   - lib/ontology/src/index.ts          (ontologyDomainOf, computeModelMaturity, MODEL_STAGES)
//   - artifacts/coach/src/components/athlete-model.tsx  (coverage / radar / integrity)
//   - artifacts/coach/src/hooks/use-frame-state.ts      (deriveFrameState)
// The mobile app does not depend on the @workspace/* packages, so the logic is
// copied here 1:1 rather than imported. Do not diverge without changing the web.

// ─── Fact shape (superset of what /memory returns on mobile) ─────────────────
// The server returns the full athlete_facts row; the app's inline Fact type was
// just underspecified. These optional fields are present at runtime.
export interface ModelFact {
  id: number;
  category: string;
  content: string;
  confidence: number;
  status: string;
  source?: string;
  topic?: string | null;
  subcategory?: string | null;
  evidenceCount?: number | null;
  sources?: readonly { type: string }[] | null;
  updatedAt?: string;
  createdAt?: string;
}

// ─── Category labels + order (matches web athlete-model.tsx) ──────────────────
export const CATEGORY_LABELS: Record<string, string> = {
  weakness: "Weaknesses",
  strength: "Strengths",
  technical_knowledge: "Technical knowledge",
  pattern: "Recurring patterns",
  preference: "Coaching preferences",
  goal: "Active goals",
  event: "Recent events",
  context: "Life context",
};

export const CATEGORY_ORDER: string[] = [
  "weakness",
  "strength",
  "technical_knowledge",
  "pattern",
  "preference",
  "goal",
  "event",
  "context",
];

// ─── Archetypes (ported from @workspace/archetypes) ──────────────────────────
export type Archetype = {
  key: string;
  name: string;
  essence: string;
  pressureSignature: string;
  gift: string;
  shadow: string;
};

const ARCHETYPES: readonly Archetype[] = [
  {
    key: "wolf",
    name: "Wolf",
    essence: "relentless pressure, chains attacks, never lets the pace drop",
    pressureSignature:
      "You hunt harder. Pressure makes you press — you close distance and chain until something gives.",
    gift: "Relentless pace. You break wills by never letting the exchange settle.",
    shadow: "When the chase stops working you keep chasing — and gas, or run onto a counter.",
  },
  {
    key: "falcon",
    name: "Falcon",
    essence: "precise and fast, strikes from sharp angles, hunts openings",
    pressureSignature:
      "You sharpen. Under pressure you go quiet and wait for the angle, then take it clean.",
    gift: "Precision timing. You hit the one window most people never see.",
    shadow: "Waiting too long for the perfect shot — you let winnable exchanges pass by.",
  },
  {
    key: "bear",
    name: "Bear",
    essence: "heavy and immovable, smothering top pressure, grinds people down",
    pressureSignature:
      "You get heavier. Pressure makes you settle weight and smother — you slow the whole fight to your pace.",
    gift: "Crushing top control. You make every second cost them something.",
    shadow:
      "Stalling on control instead of finishing — and getting flat when the pace forces you to move.",
  },
  {
    key: "cobra",
    name: "Cobra",
    essence: "patient and baiting, sits still then explodes into the finish",
    pressureSignature:
      "You go still. Pressure makes you bait — you give a target, wait, and detonate on the reaction.",
    gift: "Trap timing. The strike lands before they know it started.",
    shadow:
      "Sitting in the trap too long — passivity reads as hesitation when the bait never gets taken.",
  },
  {
    key: "panther",
    name: "Panther",
    essence: "silent, fluid, deceptive — ambushes and slips frames",
    pressureSignature:
      "You disappear and reappear. Pressure makes you flow off-line and ambush from the blind side.",
    gift: "Deceptive movement. They commit to where you were, not where you are.",
    shadow: "Movement for its own sake — slipping when you should plant and finish.",
  },
  {
    key: "ox",
    name: "Ox",
    essence: "endurance and forward walk, outlasts and breaks the will",
    pressureSignature:
      "You walk forward. Pressure makes you turn it into a war of attrition you intend to win late.",
    gift: "Bottomless engine. You're still coming in round three when they're done.",
    shadow: "Trading on toughness instead of skill — eating damage you didn't need to take.",
  },
  {
    key: "shark",
    name: "Shark",
    essence: "constant forward pressure, smells fatigue and swarms it",
    pressureSignature:
      "You smell blood. The moment they tire you swarm — pressure flips you from patient to all-out.",
    gift: "Finishing instinct. You sense the fade and end it before it recovers.",
    shadow: "Over-committing to the kill — swarming early onto someone who isn't actually hurt.",
  },
  {
    key: "eagle",
    name: "Eagle",
    essence: "vision and control, manages range and distance, sees two moves ahead",
    pressureSignature:
      "You rise above it. Pressure makes you manage range and read the pattern instead of reacting to it.",
    gift: "Fight IQ. You're already two exchanges ahead of the position.",
    shadow: "Managing the fight from distance so long you never impose — control without threat.",
  },
  {
    key: "mantis",
    name: "Mantis",
    essence: "technical trap-setter, builds frames and angles, springs the snare",
    pressureSignature:
      "You build structure. Pressure makes you frame, angle, and engineer the snare one piece at a time.",
    gift: "Technical traps. Everything is a setup for the thing three steps later.",
    shadow:
      "Over-engineering — building a perfect structure while the simple finish was right there.",
  },
  {
    key: "ram",
    name: "Ram",
    essence: "head-on collision, pure will, walks through the storm",
    pressureSignature:
      "You lower your head. Pressure makes you collide — straight line, full commitment, through the middle.",
    gift: "Pure will. You walk through what stops other people.",
    shadow: "Meeting force with force when angling would win — running headfirst into the counter.",
  },
];

const ARCHETYPE_BY_KEY = new Map<string, Archetype>(ARCHETYPES.map((a) => [a.key, a]));

export function getArchetype(key: string | null | undefined): Archetype | null {
  if (!key) return null;
  return ARCHETYPE_BY_KEY.get(key) ?? null;
}

// ─── Coaching mode (ported from @workspace/archetypes) ───────────────────────
export type CoachingModeKey = "explorer" | "builder" | "competitor" | "performer";

export type CoachingMode = {
  key: CoachingModeKey;
  label: string;
  focus: string;
  needs: string;
};

const COACHING_MODES: Record<CoachingModeKey, CoachingMode> = {
  explorer: {
    key: "explorer",
    label: "Explorer",
    focus: "Curiosity + literacy",
    needs: "Education, clear reasons, earned encouragement — not hard friction yet.",
  },
  builder: {
    key: "builder",
    label: "Builder",
    focus: "Structure + consistency",
    needs: "Repeatable systems and accountability to the plan, not novelty.",
  },
  competitor: {
    key: "competitor",
    label: "Competitor",
    focus: "Accountability + pressure",
    needs: "Pressure that mirrors the event — sharpen, hold the standard, no new doubt.",
  },
  performer: {
    key: "performer",
    label: "Performer",
    focus: "Refinement + edges",
    needs: "The subtle correction and the edge case — make them earn the depth.",
  },
};

function experienceTier(level: string): "advanced" | "intermediate" | "beginner" {
  const l = level.toLowerCase();
  if (/black|brown|advanced|elite|\bpro\b|professional|expert/.test(l)) return "advanced";
  if (/purple|blue|intermediate|competitor/.test(l)) return "intermediate";
  return "beginner";
}

export function computeCoachingMode(input: {
  hasActiveCompetition: boolean;
  level: string;
  modelSize: number;
}): CoachingMode {
  if (input.hasActiveCompetition) return COACHING_MODES.competitor;
  const tier = experienceTier(input.level);
  if (tier === "advanced") return COACHING_MODES.performer;
  if (tier === "intermediate" || input.modelSize >= 8) return COACHING_MODES.builder;
  return COACHING_MODES.explorer;
}

// ─── Ontology domain map (ported from @workspace/ontology) ───────────────────
const ONTOLOGY_DOMAINS: { key: string; facets: string[] }[] = [
  { key: "identity", facets: ["stance", "style", "archetype"] },
  {
    key: "striking",
    facets: ["distance", "guard_discipline", "combinations", "exits", "entries"],
  },
  {
    key: "grappling",
    facets: ["takedown_entries", "scrambles", "top_control", "bottom_escapes", "guard", "submissions"],
  },
  { key: "decision_making", facets: ["pace", "shot_selection", "adaptability"] },
  { key: "competition", facets: ["fight_week", "pressure_response", "warm_up"] },
  { key: "recovery", facets: ["sleep", "fatigue", "habits"] },
  { key: "mindset", facets: ["confidence", "emotional_regulation", "self_talk"] },
];

const DOMAIN_BY_FACET_KEY = new Map<string, string>();
for (const d of ONTOLOGY_DOMAINS) {
  for (const f of d.facets) DOMAIN_BY_FACET_KEY.set(`${d.key}.${f}`, d.key);
}

export function ontologyDomainOf(key: string | null | undefined): string | null {
  if (!key) return null;
  return DOMAIN_BY_FACET_KEY.get(key) ?? null;
}

// ─── Model maturity / stages (ported from @workspace/ontology) ───────────────
export type ModelStageKey =
  | "observer"
  | "pattern_recognition"
  | "personal_coach"
  | "performance_partner";

export interface ModelStage {
  key: ModelStageKey;
  label: string;
  meaning: string;
}

export const MODEL_STAGES: readonly ModelStage[] = [
  {
    key: "observer",
    label: "Observer",
    meaning: "FRAME is still watching — reads are hypotheses, not conclusions.",
  },
  {
    key: "pattern_recognition",
    label: "Pattern recognition",
    meaning: "Recurring patterns are surfacing across sessions.",
  },
  {
    key: "personal_coach",
    label: "Personal coach",
    meaning: "The model is deep enough for earned specificity.",
  },
  {
    key: "performance_partner",
    label: "Performance partner",
    meaning: "Deep cross-referenced model — anticipatory coaching.",
  },
];

const STAGE_BY_KEY = new Map(MODEL_STAGES.map((s) => [s.key, s]));

export interface ModelMaturity {
  stage: ModelStage;
  completeness: number;
  factCount: number;
  distinctCategories: number;
  corroborated: number;
  crossSource: number;
}

const MATURITY_MARKER_TYPES = new Set(["athlete_stated", "athlete_confirmed"]);

export function computeModelMaturity(facts: readonly ModelFact[]): ModelMaturity {
  const factCount = facts.length;
  const distinctCategories = new Set(facts.map((f) => f.category)).size;
  let corroborated = 0;
  let crossSource = 0;
  for (const f of facts) {
    if ((f.evidenceCount ?? 1) > 1) corroborated++;
    const types = new Set(
      (f.sources ?? [])
        .map((s) => s.type)
        .filter((t) => !MATURITY_MARKER_TYPES.has(t)),
    );
    if (types.size > 1) crossSource++;
  }

  let key: ModelStageKey = "observer";
  if (factCount >= 25 && distinctCategories >= 6 && corroborated >= 8 && crossSource >= 3) {
    key = "performance_partner";
  } else if (factCount >= 12 && distinctCategories >= 5 && corroborated >= 3) {
    key = "personal_coach";
  } else if (factCount >= 5 && distinctCategories >= 3) {
    key = "pattern_recognition";
  }

  const completeness = Math.min(
    100,
    Math.round(
      Math.min(1, factCount / 30) * 40 +
        Math.min(1, distinctCategories / 8) * 25 +
        Math.min(1, corroborated / 10) * 25 +
        Math.min(1, crossSource / 5) * 10,
    ),
  );

  return {
    stage: STAGE_BY_KEY.get(key)!,
    completeness,
    factCount,
    distinctCategories,
    corroborated,
    crossSource,
  };
}

// ─── Radar dimensions (ported from athlete-model.tsx) ────────────────────────
const RADAR_DIMS: {
  label: string;
  domains: string[];
  keywords: string[];
  categories?: string[];
}[] = [
  {
    label: "Striking",
    domains: ["striking"],
    keywords: [
      "strik", "punch", "kick", "elbow", "knee", "jab", "cross", "hook",
      "box", "muay", "stance", "footwork", "combination", "range", "distance",
    ],
  },
  {
    label: "Grappling",
    domains: ["grappling"],
    keywords: [
      "grappl", "guard", "mount", "takedown", "wrestl", "submission", "choke",
      "armbar", "sweep", "pass", "clinch", "control", "ground", "bjj", "judo",
      "position", "escape", "scramble", "pin",
    ],
  },
  {
    label: "Competition",
    domains: ["competition"],
    keywords: [
      "comp", "tournament", "match", "fight", "spar", "opponent", "weigh",
      "cut", "event", "prep", "medal", "bracket",
    ],
    categories: ["goal", "event"],
  },
  {
    label: "Recovery",
    domains: ["recovery"],
    keywords: [
      "recover", "rest", "sleep", "fatigue", "gas", "cardio", "conditioning",
      "breath", "injur", "sore", "heal", "tired", "energy",
    ],
  },
  {
    label: "Decision Making",
    domains: ["decision_making"],
    keywords: [
      "decision", "choice", "react", "read", "anticipat", "tactical", "pace",
      "timing", "adapt", "plan", "patient", "hesitat", "commit", "impos",
    ],
    categories: ["pattern"],
  },
  {
    label: "Mental Game",
    domains: ["mindset", "identity"],
    keywords: [
      "mental", "mind", "confidence", "focus", "calm", "compos", "anxiet",
      "fear", "tilt", "emotion", "motivat", "doubt", "frustrat", "nervous",
      "pressure",
    ],
    categories: ["preference"],
  },
];

const TARGET_PER_CATEGORY = 15; // 3 facts × confidence 5
const RADAR_TARGET = 12; // confidence points that fill one DNA dimension

// ─── Small helpers (ported from athlete-model.tsx) ───────────────────────────
export function daysBetween(a: Date, b: Date) {
  return Math.max(0, Math.floor((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24)));
}

export function formatHeartbeat(dateStr: string): string {
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

export function leadClause(text: string): string {
  const m = text.match(/^[^.!?]+[.!?]?/);
  return (m ? m[0] : text).replace(/[.!?]+$/, "");
}

// Model-confidence copy — thresholds + strings verbatim from the web.
export function confidenceCopy(frameConfidence: number): string {
  if (frameConfidence < 10)
    return "FRAME is still learning how you move under pressure. This percentage is how complete its model of you is.";
  if (frameConfidence < 25)
    return "This percentage is how complete FRAME's model of you is. Still calibrating how you perform, adapt, and recover.";
  if (frameConfidence < 60)
    return "FRAME has a working model of you. It deepens with every session.";
  return "FRAME has a strong read on your game. Keep feeding it signal.";
}

// ─── Full athlete-model computation (ported from athlete-model.tsx) ──────────
export interface AthleteModelComputed {
  frameConfidence: number;
  lowestCategories: string[];
  radarData: { label: string; value: number }[];
  lastUpdated: string | null;
  topStrength: ModelFact | undefined;
  topWeakness: ModelFact | undefined;
  topPattern: ModelFact | undefined;
  sinceDays: number;
  integritySegments: number;
  integrityLabel: string;
  coachingMode: CoachingMode;
  maturity: ModelMaturity;
}

export function computeAthleteModel(params: {
  facts: ModelFact[];
  fighterLevel: string | null | undefined;
  fighterCreatedAt: string | null | undefined;
  hasActiveCompetition: boolean;
  // Chat history is not fetched on mobile Profile — the web blends user turns
  // into integrity. Default 0 so integrity degrades to the facts-only term.
  userTurns?: number;
}): AthleteModelComputed {
  const { facts, fighterLevel, fighterCreatedAt, hasActiveCompetition, userTurns = 0 } = params;

  const grouped: Record<string, ModelFact[]> = {};
  for (const f of facts) {
    (grouped[f.category] ??= []).push(f);
  }

  // Per-category confidence coverage (0-1)
  const categoryCoverage: Record<string, number> = {};
  for (const c of CATEGORY_ORDER) {
    const catFacts = grouped[c] ?? [];
    const sum = catFacts.reduce((s, f) => s + f.confidence, 0);
    categoryCoverage[c] = Math.min(1, sum / TARGET_PER_CATEGORY);
  }

  const avgCoverage =
    CATEGORY_ORDER.reduce((s, c) => s + categoryCoverage[c], 0) / CATEGORY_ORDER.length;
  const frameConfidence = Math.round(avgCoverage * 100);

  const lowestCategories = [...CATEGORY_ORDER]
    .sort((a, b) => categoryCoverage[a] - categoryCoverage[b])
    .slice(0, 3);

  const radarData = RADAR_DIMS.map((dim) => {
    let sum = 0;
    for (const f of facts) {
      const domain = ontologyDomainOf(f.subcategory);
      if (domain) {
        if (dim.domains.includes(domain)) sum += f.confidence;
        continue;
      }
      const hay = `${f.topic ?? ""} ${f.content}`.toLowerCase();
      const kwHit = dim.keywords.some((k) => hay.includes(k));
      const catHit = dim.categories?.includes(f.category) ?? false;
      if (kwHit || catHit) sum += f.confidence;
    }
    return { label: dim.label, value: Math.min(1, sum / RADAR_TARGET) };
  });

  const lastUpdated = facts.length
    ? facts.reduce<string | null>((max, f) => {
        const u = f.updatedAt ?? f.createdAt ?? null;
        if (!u) return max;
        return !max || u > max ? u : max;
      }, null)
    : null;

  const topStrength = (grouped.strength ?? []).sort((a, b) => b.confidence - a.confidence)[0];
  const topWeakness = (grouped.weakness ?? []).sort((a, b) => b.confidence - a.confidence)[0];
  const topPattern = (grouped.pattern ?? []).sort((a, b) => b.confidence - a.confidence)[0];

  const sinceDays = fighterCreatedAt
    ? daysBetween(new Date(fighterCreatedAt), new Date())
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
    hasActiveCompetition,
    level: fighterLevel ?? "beginner",
    modelSize: facts.length,
  });

  const maturity = computeModelMaturity(facts);

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
    maturity,
  };
}

// ─── Frame state (ported from use-frame-state.ts) ────────────────────────────
export type FrameStateLabel =
  | "Dormant"
  | "Stable"
  | "Loaded"
  | "Recovering"
  | "Tight"
  | "Volatile"
  | "Composed"
  | "Overextended";

export interface FrameState {
  label: FrameStateLabel;
  source: string;
}

export function deriveFrameState(facts: ModelFact[], hasFighter: boolean): FrameState {
  if (!hasFighter) return { label: "Dormant", source: "no fighter loaded" };
  if (facts.length === 0) {
    return { label: "Dormant", source: "no recorded signal yet" };
  }

  const recent = facts.slice(0, 12);
  const blob = recent
    .map((f) => `${f.category} ${f.topic ?? ""} ${f.content}`.toLowerCase())
    .join(" | ");
  const match = (...patterns: RegExp[]) => patterns.some((re) => re.test(blob));

  if (match(/overtrain|burn(ed|t)?\s*out|exhaust|depleted|grinding too hard|too many sessions/)) {
    return { label: "Overextended", source: "fatigue/overload in recent facts" };
  }
  if (match(/aftershock|deload|recovery week|rest day|recovering from|injury|coming back|post-?comp/)) {
    return { label: "Recovering", source: "recovery/aftershock in recent facts" };
  }
  if (match(/volatil|emotional leakage|tilt|frustrat|lost composure|spiral|reactive|outburst/)) {
    return { label: "Volatile", source: "emotional drift in recent facts" };
  }
  if (match(/hesitat|freez|stall|second-guess|over-think|paralys|tentative|avoidance/)) {
    return { label: "Tight", source: "hesitation/avoidance in recent facts" };
  }
  if (
    match(
      /over-?intens|forcing|rushing|approach velocity|over-extended in exchange|too much pressure too early|spammy/,
    )
  ) {
    return { label: "Loaded", source: "over-intensity in recent facts" };
  }
  if (match(/composed|regulated well|stable under|held the frame|breath held|dense calm|locked in cleanly/)) {
    return { label: "Composed", source: "regulation win in recent facts" };
  }

  return { label: "Stable", source: "no specific signal — baseline" };
}
