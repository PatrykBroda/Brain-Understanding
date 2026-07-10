// FRAME Athlete Model ontology — the fixed domain tree every structured
// observation maps into. One source of truth for server (tagging + prompt
// grouping), web, and mobile (display + radar dimensions).
//
// Keys are stable identifiers stored in athlete_facts.subcategory as
// "<domain>.<facet>" (e.g. "striking.exits"). Never rename a key — add new
// ones instead; stored facts reference them forever.

export interface OntologyFacet {
  key: string; // full stable key, e.g. "striking.exits"
  label: string; // human label, e.g. "Exits"
}

export interface OntologyDomain {
  key: string; // e.g. "striking"
  label: string; // e.g. "Striking"
  facets: readonly OntologyFacet[];
}

function domain(key: string, label: string, facets: readonly (readonly [string, string])[]): OntologyDomain {
  return {
    key,
    label,
    facets: facets.map(([facet, facetLabel]) => ({ key: `${key}.${facet}`, label: facetLabel })),
  };
}

export const ONTOLOGY = [
  domain("identity", "Identity", [
    ["stance", "Preferred stance"],
    ["style", "Style"],
    ["archetype", "Archetype"],
  ]),
  domain("striking", "Striking", [
    ["distance", "Distance management"],
    ["guard_discipline", "Guard discipline"],
    ["combinations", "Combinations"],
    ["exits", "Exits"],
    ["entries", "Entries"],
  ]),
  domain("grappling", "Grappling", [
    ["takedown_entries", "Takedown entries"],
    ["scrambles", "Scramble behaviour"],
    ["top_control", "Top control"],
    ["bottom_escapes", "Bottom escapes"],
    ["guard", "Guard work"],
    ["submissions", "Submissions"],
  ]),
  domain("decision_making", "Decision making", [
    ["pace", "Pace"],
    ["shot_selection", "Shot selection"],
    ["adaptability", "Adaptability"],
  ]),
  domain("competition", "Competition", [
    ["fight_week", "Fight week habits"],
    ["pressure_response", "Pressure response"],
    ["warm_up", "Warm-up routine"],
  ]),
  domain("recovery", "Recovery", [
    ["sleep", "Sleep"],
    ["fatigue", "Fatigue"],
    ["habits", "Recovery behaviours"],
  ]),
  domain("mindset", "Mindset", [
    ["confidence", "Confidence"],
    ["emotional_regulation", "Emotional regulation"],
    ["self_talk", "Self-talk"],
  ]),
] as const satisfies readonly OntologyDomain[];

export type OntologyDomainKey = (typeof ONTOLOGY)[number]["key"];

/** Every valid "<domain>.<facet>" key, flattened. */
export const ONTOLOGY_KEYS: readonly string[] = ONTOLOGY.flatMap((d) => d.facets.map((f) => f.key));

const FACET_BY_KEY = new Map<string, { domain: OntologyDomain; facet: OntologyFacet }>(
  ONTOLOGY.flatMap((d) => d.facets.map((f) => [f.key, { domain: d, facet: f }] as const)),
);

export function isOntologyKey(key: string): boolean {
  return FACET_BY_KEY.has(key);
}

/** "striking.exits" → { domainLabel: "Striking", facetLabel: "Exits" } — null for unknown/legacy keys. */
export function ontologyLabels(key: string | null | undefined): { domainLabel: string; facetLabel: string } | null {
  if (!key) return null;
  const hit = FACET_BY_KEY.get(key);
  if (!hit) return null;
  return { domainLabel: hit.domain.label, facetLabel: hit.facet.label };
}

/** Domain part of a subcategory key ("striking.exits" → "striking"), null if not a valid key. */
export function ontologyDomainOf(key: string | null | undefined): OntologyDomainKey | null {
  if (!key) return null;
  const hit = FACET_BY_KEY.get(key);
  return hit ? (hit.domain.key as OntologyDomainKey) : null;
}

// ─── Adaptive intelligence — model maturity stages ───────────────────────────
//
// The coach's relationship maturity is DERIVED deterministically from the real
// evidence in the athlete model — never from session counts, streaks, or time.
// One source of truth for the server prompt (stage directive) and the client
// (stage label on the Athlete Model). Completeness measures FRAME's coverage
// of the athlete (how much of the model is mapped), not the athlete themself.

export type ModelStageKey =
  | "observer"
  | "pattern_recognition"
  | "personal_coach"
  | "performance_partner";

export interface ModelStage {
  key: ModelStageKey;
  label: string;
  /** What this stage means, athlete-facing one-liner. */
  meaning: string;
  /** Prompt directive — how the coach should speak at this maturity. */
  directive: string;
}

export const MODEL_STAGES: readonly ModelStage[] = [
  {
    key: "observer",
    label: "Observer",
    meaning: "FRAME is still watching — reads are hypotheses, not conclusions.",
    directive:
      "You are early in this athlete's model. Ask more than you assert. Every read you offer is a hypothesis — hedge it, name what it's based on, and invite correction. Gauge knowledge aggressively before instructing. Never imply you know this athlete's game yet.",
  },
  {
    key: "pattern_recognition",
    label: "Pattern recognition",
    meaning: "Recurring patterns are surfacing across sessions.",
    directive:
      "Enough observations have accumulated to name recurring patterns. When you see one, say it explicitly and cite where it has shown up (chat, footage, calibration). Still verify before building a prescription on any single-sighting read.",
  },
  {
    key: "personal_coach",
    label: "Personal coach",
    meaning: "The model is deep enough for earned specificity.",
    directive:
      "The model is substantial: speak with earned specificity. Connect today's work to recorded weaknesses and goals by name. Prescribe with confidence where a read is corroborated across multiple sightings; hedge explicitly where it rests on one.",
  },
  {
    key: "performance_partner",
    label: "Performance partner",
    meaning: "Deep cross-referenced model — anticipatory coaching.",
    directive:
      "The model is deep and cross-referenced. Be anticipatory: connect reads across domains, reference the athlete's own history back to them, and challenge them with their own data. The standard rises with the model — but fabrication rules are unchanged: cite recorded evidence or name the gap.",
  },
];

const STAGE_BY_KEY = new Map(MODEL_STAGES.map((s) => [s.key, s]));

export function getModelStage(key: ModelStageKey): ModelStage {
  return STAGE_BY_KEY.get(key)!;
}

/** Minimal structural view of an athlete_facts row — works for server rows and client DTOs. */
export interface MaturityFactInput {
  category: string;
  confidence: number;
  evidenceCount?: number | null;
  sources?: readonly { type: string }[] | null;
}

export interface ModelMaturity {
  stage: ModelStage;
  /** 0-100 — how much of the athlete model is mapped, from real evidence only. */
  completeness: number;
  factCount: number;
  distinctCategories: number;
  /** Facts corroborated by more than one sighting. */
  corroborated: number;
  /** Facts whose evidence spans more than one source type (chat + footage, etc). */
  crossSource: number;
}

// Marker source types never count as independent evidence (mirrors the server's
// evidence engine — athlete_stated/athlete_confirmed adjust confidence, not count).
const MATURITY_MARKER_TYPES = new Set(["athlete_stated", "athlete_confirmed"]);

/**
 * Pure + deterministic: same facts in, same stage out. Operates only on ACTIVE
 * facts (caller filters). No time decay, no session counts, no randomness.
 */
export function computeModelMaturity(facts: readonly MaturityFactInput[]): ModelMaturity {
  const factCount = facts.length;
  const distinctCategories = new Set(facts.map((f) => f.category)).size;
  let corroborated = 0;
  let crossSource = 0;
  for (const f of facts) {
    if ((f.evidenceCount ?? 1) > 1) corroborated++;
    const types = new Set(
      (f.sources ?? []).map((s) => s.type).filter((t) => !MATURITY_MARKER_TYPES.has(t)),
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

  // Coverage blend — each component capped, weights sum to 100.
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
    stage: getModelStage(key),
    completeness,
    factCount,
    distinctCategories,
    corroborated,
    crossSource,
  };
}
