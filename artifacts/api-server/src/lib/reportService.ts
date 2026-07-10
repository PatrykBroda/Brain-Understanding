import {
  db,
  videoAnalysesTable,
  modelSnapshotsTable,
  type Fighter,
  type AthleteFact,
  type FactSource,
} from "@workspace/db";
import { and, eq, gte, lt, desc } from "drizzle-orm";
import {
  computeModelMaturity,
  ontologyDomainOf,
  ONTOLOGY,
  type OntologyDomainKey,
} from "@workspace/ontology";
import { getArchetype } from "@workspace/archetypes";
import { getActiveFacts, factSources } from "./factsService";

// ─── The honest weekly report shape ──────────────────────────────────────────
// Every field is derived deterministically from real recorded evidence. No AI
// number is ever emitted here; the AI does not participate in this computation.

export interface WeeklyReportLearnedItem {
  id: number;
  category: string;
  domainLabel: string | null;
  topic: string;
  content: string;
  evidenceCount: number;
}

export interface WeeklyReportDomainBand {
  key: string;
  label: string;
  /** 0-100 — how much evidence FRAME holds in this area (coverage of understanding). */
  coverage: number;
  factCount: number;
}

export interface WeeklyReport {
  weekStart: string; // YYYY-MM-DD (ISO Monday, UTC)
  weekEnd: string; // YYYY-MM-DD (Sunday)
  weekLabel: string; // e.g. "6–12 Jul"
  generatedAt: string;

  /** Model completeness 0-100 (computeModelMaturity) — coverage of the athlete. */
  confidence: number;
  /** Points changed vs the prior stored snapshot; null when no baseline exists yet. */
  confidenceDelta: number | null;
  /** ISO Monday of the snapshot the delta compares against; null on the baseline week. */
  priorWeekStart: string | null;
  /** Human range label for the baseline week, so the card names the real baseline. */
  priorWeekLabel: string | null;
  /** True only when the baseline is the immediately preceding ISO week. */
  priorIsLastWeek: boolean;
  stage: { key: string; label: string; meaning: string };

  learned: {
    confirmed: WeeklyReportLearnedItem[]; // existing observations strengthened this week
    observed: WeeklyReportLearnedItem[]; // new, already-corroborated observations
    hypotheses: WeeklyReportLearnedItem[]; // new, single-sighting reads (not yet confirmed)
  };

  /** Independent sightings recorded this week across the living model. */
  evidenceThisWeek: number;
  /** New facts created this week. */
  observationsThisWeek: number;
  /** Existing facts strengthened this week. */
  confirmationsThisWeek: number;

  /** Area that gained the most evidence this week. Honest: "reinforced", not "improved %". */
  mostReinforced: {
    topic: string;
    domainLabel: string | null;
    evidenceCount: number;
    sightingsThisWeek: number;
    sourceBreakdown: { type: string; count: number }[];
  } | null;

  /** The clearest thing to work on next — highest-confidence recorded weakness. */
  biggestOpportunity: {
    topic: string;
    content: string;
    domainLabel: string | null;
  } | null;

  domains: WeeklyReportDomainBand[];
  analysesThisWeek: number;

  archetype: { key: string; name: string; gift: string; shadow: string } | null;

  totalFacts: number;
  /** False when nothing real happened this week — the card shows an honest empty state. */
  hasActivity: boolean;
}

// ─── Date helpers (ISO week, UTC) ────────────────────────────────────────────

function isoWeekStartUTC(d: Date): Date {
  const day = d.getUTCDay(); // 0=Sun … 6=Sat
  const sinceMonday = (day + 6) % 7;
  const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  monday.setUTCDate(monday.getUTCDate() - sinceMonday);
  return monday;
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function weekRangeLabel(start: Date, end: Date): string {
  const sm = MONTHS[start.getUTCMonth()];
  const em = MONTHS[end.getUTCMonth()];
  const sd = start.getUTCDate();
  const ed = end.getUTCDate();
  return sm === em ? `${sd}–${ed} ${em}` : `${sd} ${sm} – ${ed} ${em}`;
}

// ─── Evidence helpers ────────────────────────────────────────────────────────

const MARKER_TYPES = new Set(["athlete_stated", "athlete_confirmed"]);

function inWindowSources(fact: AthleteFact, windowStart: Date): FactSource[] {
  return factSources(fact).filter((s) => {
    const t = Date.parse(s.at);
    return Number.isFinite(t) && t >= windowStart.getTime() && !MARKER_TYPES.has(s.type);
  });
}

// Legacy facts without an ontology subcategory still get a domain via keywords,
// so the understanding bands reflect the whole model, not just tagged rows.
const DOMAIN_KEYWORDS: Record<OntologyDomainKey, RegExp> = {
  identity: /stance|southpaw|orthodox|\bstyle\b|identity|archetype/i,
  striking:
    /strik|punch|kick|\bjab\b|cross|hook|\bguard\b|distance|range|combinat|footwork|head movement|slip|parry|counter/i,
  grappling:
    /grappl|takedown|wrestl|clinch|scramble|guard pass|submission|choke|sweep|top control|escape|\bground\b|mount|back control|pin/i,
  decision_making: /decision|\bpace\b|shot selection|adapt|reading|timing|patience|tempo/i,
  competition: /competition|fight week|pressure|nerves|weigh|warm-?up|compete|opponent/i,
  recovery: /recovery|sleep|fatigue|\brest\b|soreness|injury|tired|overtrain/i,
  mindset: /mindset|confidence|emotion|self-?talk|\bfocus\b|anxiety|calm|composure|breath|frustrat/i,
};

function domainOf(fact: AthleteFact): OntologyDomainKey | null {
  const tagged = ontologyDomainOf(fact.subcategory);
  if (tagged) return tagged;
  const hay = `${fact.topic} ${fact.content}`;
  for (const domain of ONTOLOGY) {
    if (DOMAIN_KEYWORDS[domain.key as OntologyDomainKey].test(hay)) {
      return domain.key as OntologyDomainKey;
    }
  }
  return null;
}

const DOMAIN_LABEL = new Map<string, string>(ONTOLOGY.map((d) => [d.key, d.label]));
// Confidence points needed for a domain band to read as fully understood.
const DOMAIN_TARGET = 10;

function toLearnedItem(fact: AthleteFact): WeeklyReportLearnedItem {
  const domain = domainOf(fact);
  return {
    id: fact.id,
    category: fact.category,
    domainLabel: domain ? (DOMAIN_LABEL.get(domain) ?? null) : null,
    topic: fact.topic,
    content: fact.content,
    evidenceCount: fact.evidenceCount ?? 1,
  };
}

// ─── The builder ─────────────────────────────────────────────────────────────

export async function buildWeeklyReport(fighter: Fighter): Promise<WeeklyReport> {
  const now = new Date();
  const weekStart = isoWeekStartUTC(now);
  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);

  const facts = await getActiveFacts(fighter.id);

  // Maturity (completeness + stage) — the report's headline "FRAME confidence".
  const maturity = computeModelMaturity(
    facts.map((f) => ({
      category: f.category,
      confidence: f.confidence,
      evidenceCount: f.evidenceCount,
      sources: factSources(f),
    })),
  );

  // ── Bucket facts by what happened to them this week ──
  const confirmed: WeeklyReportLearnedItem[] = [];
  const observed: WeeklyReportLearnedItem[] = [];
  const hypotheses: WeeklyReportLearnedItem[] = [];

  let evidenceThisWeek = 0;
  let observationsThisWeek = 0;
  let confirmationsThisWeek = 0;

  let bestReinforced: { fact: AthleteFact; sightings: number } | null = null;

  for (const f of facts) {
    const windowSightings = inWindowSources(f, weekStart);
    const createdInWindow = f.createdAt.getTime() >= weekStart.getTime();
    evidenceThisWeek += windowSightings.length;

    if (windowSightings.length === 0 && !createdInWindow) continue; // untouched this week

    if (windowSightings.length > 0) {
      if (!bestReinforced || windowSightings.length > bestReinforced.sightings) {
        bestReinforced = { fact: f, sightings: windowSightings.length };
      }
    }

    if (createdInWindow) {
      observationsThisWeek++;
      // A new fact with corroboration already is "observed"; single-sighting is a hypothesis.
      if ((f.evidenceCount ?? 1) >= 2 || f.confidence >= 3) {
        observed.push(toLearnedItem(f));
      } else {
        hypotheses.push(toLearnedItem(f));
      }
    } else {
      // Existing fact that gained a sighting this week — strengthened.
      confirmationsThisWeek++;
      confirmed.push(toLearnedItem(f));
    }
  }

  const byEvidence = (a: WeeklyReportLearnedItem, b: WeeklyReportLearnedItem) =>
    b.evidenceCount - a.evidenceCount;
  confirmed.sort(byEvidence);
  observed.sort(byEvidence);
  hypotheses.sort(byEvidence);

  // ── Most reinforced area this week ──
  let mostReinforced: WeeklyReport["mostReinforced"] = null;
  if (bestReinforced) {
    const f = bestReinforced.fact;
    const all = factSources(f).filter((s) => !MARKER_TYPES.has(s.type));
    const counts = new Map<string, number>();
    for (const s of all) counts.set(s.type, (counts.get(s.type) ?? 0) + 1);
    const sourceBreakdown = [...counts.entries()]
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count);
    const domain = domainOf(f);
    mostReinforced = {
      topic: f.topic,
      domainLabel: domain ? (DOMAIN_LABEL.get(domain) ?? null) : null,
      evidenceCount: f.evidenceCount ?? 1,
      sightingsThisWeek: bestReinforced.sightings,
      sourceBreakdown,
    };
  }

  // ── Biggest opportunity: the highest-confidence recorded weakness ──
  const weaknesses = facts
    .filter((f) => f.category === "weakness")
    .sort((a, b) => b.confidence - a.confidence || (b.evidenceCount ?? 1) - (a.evidenceCount ?? 1));
  const topWeakness = weaknesses[0];
  const biggestOpportunity = topWeakness
    ? {
        topic: topWeakness.topic,
        content: topWeakness.content,
        domainLabel: (() => {
          const d = domainOf(topWeakness);
          return d ? (DOMAIN_LABEL.get(d) ?? null) : null;
        })(),
      }
    : null;

  // ── Per-domain understanding bands ──
  const domainAgg = new Map<OntologyDomainKey, { conf: number; count: number }>();
  for (const f of facts) {
    const d = domainOf(f);
    if (!d) continue;
    const cur = domainAgg.get(d) ?? { conf: 0, count: 0 };
    cur.conf += f.confidence;
    cur.count += 1;
    domainAgg.set(d, cur);
  }
  const domains: WeeklyReportDomainBand[] = [...domainAgg.entries()]
    .map(([key, agg]) => ({
      key,
      label: DOMAIN_LABEL.get(key) ?? key,
      coverage: Math.min(100, Math.round((agg.conf / DOMAIN_TARGET) * 100)),
      factCount: agg.count,
    }))
    .sort((a, b) => b.coverage - a.coverage)
    .slice(0, 5);

  // ── Analyses this week ──
  const analysisRows = await db
    .select({ id: videoAnalysesTable.id })
    .from(videoAnalysesTable)
    .where(
      and(
        eq(videoAnalysesTable.fighterId, fighter.id),
        gte(videoAnalysesTable.createdAt, weekStart),
      ),
    );
  const analysesThisWeek = analysisRows.length;

  // ── Snapshot upsert + honest delta (reproducible, server-owned) ──
  const weekStartYmd = ymd(weekStart);
  await db
    .insert(modelSnapshotsTable)
    .values({
      fighterId: fighter.id,
      weekStart: weekStartYmd,
      completeness: maturity.completeness,
      factCount: facts.length,
    })
    .onConflictDoUpdate({
      target: [modelSnapshotsTable.fighterId, modelSnapshotsTable.weekStart],
      set: {
        completeness: maturity.completeness,
        factCount: facts.length,
        updatedAt: new Date(),
      },
    });

  const [prior] = await db
    .select({
      completeness: modelSnapshotsTable.completeness,
      weekStart: modelSnapshotsTable.weekStart,
    })
    .from(modelSnapshotsTable)
    .where(
      and(
        eq(modelSnapshotsTable.fighterId, fighter.id),
        lt(modelSnapshotsTable.weekStart, weekStartYmd),
      ),
    )
    .orderBy(desc(modelSnapshotsTable.weekStart))
    .limit(1);
  const confidenceDelta = prior ? maturity.completeness - prior.completeness : null;

  // The baseline is only "last week" when the prior snapshot is the immediately
  // preceding ISO week. Snapshots are written on view, so after a gap the prior
  // row may be weeks old — the card must name the real baseline, not imply weekly.
  let priorWeekStart: string | null = null;
  let priorWeekLabel: string | null = null;
  let priorIsLastWeek = false;
  if (prior) {
    priorWeekStart = prior.weekStart;
    const lastWeek = new Date(weekStart);
    lastWeek.setUTCDate(lastWeek.getUTCDate() - 7);
    priorIsLastWeek = prior.weekStart === ymd(lastWeek);
    const ps = new Date(`${prior.weekStart}T00:00:00.000Z`);
    const pe = new Date(ps);
    pe.setUTCDate(pe.getUTCDate() + 6);
    priorWeekLabel = weekRangeLabel(ps, pe);
  }

  // ── Archetype (identity, no confidence number) ──
  const arch = fighter.spiritAnimal ? getArchetype(fighter.spiritAnimal) : null;
  const archetype = arch
    ? { key: arch.key, name: arch.name, gift: arch.gift, shadow: arch.shadow }
    : null;

  const hasActivity =
    observationsThisWeek > 0 ||
    confirmationsThisWeek > 0 ||
    evidenceThisWeek > 0 ||
    analysesThisWeek > 0;

  return {
    weekStart: weekStartYmd,
    weekEnd: ymd(weekEnd),
    weekLabel: weekRangeLabel(weekStart, weekEnd),
    generatedAt: now.toISOString(),
    confidence: maturity.completeness,
    confidenceDelta,
    priorWeekStart,
    priorWeekLabel,
    priorIsLastWeek,
    stage: {
      key: maturity.stage.key,
      label: maturity.stage.label,
      meaning: maturity.stage.meaning,
    },
    learned: {
      confirmed: confirmed.slice(0, 5),
      observed: observed.slice(0, 5),
      hypotheses: hypotheses.slice(0, 5),
    },
    evidenceThisWeek,
    observationsThisWeek,
    confirmationsThisWeek,
    mostReinforced,
    biggestOpportunity,
    domains,
    analysesThisWeek,
    archetype,
    totalFacts: facts.length,
    hasActivity,
  };
}
