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
