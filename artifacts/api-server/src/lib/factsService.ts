import {
  db,
  athleteFactsTable,
  type AthleteFact,
  type FactCategory,
  type FactSource,
} from "@workspace/db";
import { isOntologyKey } from "@workspace/ontology";
import { and, desc, eq } from "drizzle-orm";

// ─── Evidence model ───────────────────────────────────────────────────────────
// An observation's confidence is NEVER set by an AI. It is derived
// deterministically from its evidence trail (the `sources` array):
//   - regular evidence entries (chat / video / calibration / planner / …)
//     count as sightings; more independent sightings = more confidence
//   - cross-source corroboration (video AND chat) adds confidence
//   - "athlete_stated" marks the athlete said it about themselves (recorded
//     at creation time — a categorical judgment, not a number)
//   - "athlete_confirmed" marks an explicit athlete "yes" on the accuracy check
// Confidence 1-2 = emerging/hypothesis, 3+ = confirmed. The scale stays 1-5 so
// every existing consumer (prompt injection, planner, both UIs) is untouched.

/** Source types that are markers, not independent sightings. */
const MARKER_TYPES = new Set(["athlete_stated", "athlete_confirmed"]);

export interface SourceInput {
  type: string; // "chat" | "video" | "calibration" | "planner" | future writers
  ref?: string; // e.g. "video:42", "planner:item:x" — stable pointer to the sighting
}

/**
 * The evidence trail for a fact. Legacy rows (written before the Knowledge
 * Loop) have `sources: []` — fall back to interpreting the legacy single
 * `source` string as one sighting so old facts participate in merging.
 */
export function factSources(fact: Pick<AthleteFact, "sources" | "source" | "createdAt">): FactSource[] {
  if (Array.isArray(fact.sources) && fact.sources.length > 0) return fact.sources;
  const legacy = (fact.source || "chat").trim();
  const type = legacy.split(":")[0] || "chat";
  return [{ type, ref: legacy === type ? "" : legacy, at: fact.createdAt.toISOString() }];
}

/** Deterministic confidence from an evidence trail. Pure — unit-tested. */
export function deriveConfidence(sources: FactSource[]): number {
  const regular = sources.filter((s) => !MARKER_TYPES.has(s.type));
  const evidenceCount = Math.max(1, regular.length);
  const distinctTypes = Math.max(1, new Set(regular.map((s) => s.type)).size);
  const stated = sources.some((s) => s.type === "athlete_stated") ? 1 : 0;
  const confirmed = sources.some((s) => s.type === "athlete_confirmed") ? 1 : 0;
  const raw = 1 + Math.min(2, evidenceCount - 1) + (distinctTypes - 1) + stated + confirmed;
  return clamp(raw, 1, 5);
}

/** Independent sightings (markers excluded) — what "evidence count" means to the athlete. */
export function evidenceCountOf(sources: FactSource[]): number {
  return Math.max(1, sources.filter((s) => !MARKER_TYPES.has(s.type)).length);
}

function legacySourceString(input: SourceInput): string {
  return input.ref && input.ref.length > 0 ? input.ref : input.type;
}

function sourceEntry(input: SourceInput, at = new Date()): FactSource {
  return { type: input.type, ref: input.ref ?? "", at: at.toISOString() };
}

// ─── Queries ─────────────────────────────────────────────────────────────────

export async function getActiveFacts(fighterId: number): Promise<AthleteFact[]> {
  return db
    .select()
    .from(athleteFactsTable)
    .where(and(eq(athleteFactsTable.fighterId, fighterId), eq(athleteFactsTable.status, "active")))
    .orderBy(desc(athleteFactsTable.updatedAt))
    .limit(200);
}

async function getActiveFact(fighterId: number, id: number): Promise<AthleteFact | null> {
  const [row] = await db
    .select()
    .from(athleteFactsTable)
    .where(
      and(
        eq(athleteFactsTable.id, id),
        eq(athleteFactsTable.fighterId, fighterId),
        eq(athleteFactsTable.status, "active"),
      ),
    )
    .limit(1);
  return row ?? null;
}

/**
 * Deterministic merge target lookup: an active fact with the same normalized
 * topic (and category, when given). Used by writers to strengthen instead of
 * duplicating when the mapping is exact (calibration keys, repeated findings).
 */
export async function findActiveFactByTopic(
  fighterId: number,
  topic: string,
  category?: FactCategory,
): Promise<AthleteFact | null> {
  const wanted = normalizeTopic(topic);
  if (!wanted) return null;
  const facts = await getActiveFacts(fighterId);
  return (
    facts.find(
      (f) => normalizeTopic(f.topic) === wanted && (category === undefined || f.category === category),
    ) ?? null
  );
}

export function normalizeTopic(topic: string): string {
  return topic
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// ─── Writers ─────────────────────────────────────────────────────────────────

export async function addFact(
  fighterId: number,
  input: {
    category: FactCategory;
    topic: string;
    content: string;
    source: SourceInput;
    subcategory?: string | null;
    /** The athlete said this about themselves (vs. an inference). Categorical, not a number. */
    athleteStated?: boolean;
  },
): Promise<AthleteFact> {
  const now = new Date();
  const sources: FactSource[] = [sourceEntry(input.source, now)];
  if (input.athleteStated) sources.push({ type: "athlete_stated", ref: "", at: now.toISOString() });
  const subcategory =
    input.subcategory && isOntologyKey(input.subcategory) ? input.subcategory : null;
  const [row] = await db
    .insert(athleteFactsTable)
    .values({
      fighterId,
      category: input.category,
      topic: input.topic.trim().slice(0, 120),
      content: input.content.trim().slice(0, 600),
      confidence: deriveConfidence(sources),
      source: legacySourceString(input.source),
      sources,
      evidenceCount: evidenceCountOf(sources),
      subcategory,
    })
    .returning();
  return row!;
}

/**
 * Strengthen an existing observation with a new independent sighting.
 * Appends the source, bumps evidence, refreshes lastConfirmedAt, and
 * recomputes confidence from the full trail. Optionally refines the wording
 * (same observation, better words — history-free unlike supersede).
 * Returns the updated fact plus its prior confidence so callers can report
 * an honest delta.
 */
export async function confirmFact(
  fighterId: number,
  id: number,
  source: SourceInput,
  refinedContent?: string,
): Promise<{ fact: AthleteFact; previousConfidence: number } | null> {
  const existing = await getActiveFact(fighterId, id);
  if (!existing) return null;

  const now = new Date();
  const sources = [...factSources(existing), sourceEntry(source, now)];
  const patch: Partial<typeof athleteFactsTable.$inferInsert> = {
    sources,
    evidenceCount: evidenceCountOf(sources),
    confidence: deriveConfidence(sources),
    lastConfirmedAt: now,
    source: legacySourceString(source),
  };
  if (refinedContent && refinedContent.trim().length > 0) {
    patch.content = refinedContent.trim().slice(0, 600);
  }
  const [updated] = await db
    .update(athleteFactsTable)
    .set(patch)
    .where(eq(athleteFactsTable.id, existing.id))
    .returning();
  return updated ? { fact: updated, previousConfidence: existing.confidence } : null;
}

export async function supersedeFact(
  fighterId: number,
  id: number,
  replacement: {
    content: string;
    reason: string;
    source: SourceInput;
  },
): Promise<AthleteFact | null> {
  const existing = await getActiveFact(fighterId, id);
  if (!existing) return null;

  // The replacement is the SAME observation corrected — it inherits the
  // evidence trail (plus the new sighting) so confidence history isn't lost.
  const now = new Date();
  const sources = [...factSources(existing), sourceEntry(replacement.source, now)];
  const [newFact] = await db
    .insert(athleteFactsTable)
    .values({
      fighterId,
      category: existing.category,
      topic: existing.topic,
      content: replacement.content.trim().slice(0, 600),
      confidence: deriveConfidence(sources),
      source: legacySourceString(replacement.source),
      sources,
      evidenceCount: evidenceCountOf(sources),
      lastConfirmedAt: existing.lastConfirmedAt,
      subcategory: existing.subcategory,
    })
    .returning();
  await db
    .update(athleteFactsTable)
    .set({ status: "superseded", supersededById: newFact!.id, resolvedReason: replacement.reason.slice(0, 240) })
    .where(eq(athleteFactsTable.id, existing.id));
  return newFact!;
}

// Athlete-facing accuracy check: the user confirms / softens / rejects an
// observation FRAME recorded. "yes" appends an athlete_confirmed marker to the
// evidence trail (confidence recomputes upward), "mostly" refreshes recency
// only, "no" resolves the fact as inaccurate. No fabrication — confidence only
// moves on an explicit athlete signal.
export async function applyConfirmation(
  fighterId: number,
  id: number,
  response: "yes" | "mostly" | "no",
): Promise<AthleteFact | null> {
  const existing = await getActiveFact(fighterId, id);
  if (!existing) return null;

  if (response === "no") {
    await db
      .update(athleteFactsTable)
      .set({ status: "resolved", resolvedReason: "athlete marked observation inaccurate" })
      .where(eq(athleteFactsTable.id, existing.id));
    return null;
  }

  const now = new Date();
  if (response === "mostly") {
    const [updated] = await db
      .update(athleteFactsTable)
      .set({ lastConfirmedAt: now })
      .where(eq(athleteFactsTable.id, existing.id))
      .returning();
    return updated ?? null;
  }

  const sources = [...factSources(existing), { type: "athlete_confirmed", ref: "", at: now.toISOString() }];
  const [updated] = await db
    .update(athleteFactsTable)
    .set({
      sources,
      evidenceCount: evidenceCountOf(sources),
      confidence: deriveConfidence(sources),
      lastConfirmedAt: now,
      source: "athlete_confirmed",
    })
    .where(eq(athleteFactsTable.id, existing.id))
    .returning();
  return updated ?? null;
}

export async function resolveFact(fighterId: number, id: number, reason: string): Promise<boolean> {
  const result = await db
    .update(athleteFactsTable)
    .set({ status: "resolved", resolvedReason: reason.slice(0, 240) })
    .where(and(eq(athleteFactsTable.id, id), eq(athleteFactsTable.fighterId, fighterId)))
    .returning({ id: athleteFactsTable.id });
  return result.length > 0;
}

function clamp(n: number, lo: number, hi: number) {
  if (Number.isNaN(n)) return lo;
  return Math.max(lo, Math.min(hi, Math.round(n)));
}
