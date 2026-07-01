import { db, athleteFactsTable, type AthleteFact, type FactCategory } from "@workspace/db";
import { and, desc, eq } from "drizzle-orm";

export async function getActiveFacts(fighterId: number): Promise<AthleteFact[]> {
  return db
    .select()
    .from(athleteFactsTable)
    .where(and(eq(athleteFactsTable.fighterId, fighterId), eq(athleteFactsTable.status, "active")))
    .orderBy(desc(athleteFactsTable.updatedAt))
    .limit(200);
}

export async function addFact(
  fighterId: number,
  input: {
    category: FactCategory;
    topic: string;
    content: string;
    confidence: number;
    source: string;
  },
): Promise<AthleteFact> {
  const [row] = await db
    .insert(athleteFactsTable)
    .values({
      fighterId,
      category: input.category,
      topic: input.topic.trim().slice(0, 120),
      content: input.content.trim().slice(0, 600),
      confidence: clamp(input.confidence, 1, 5),
      source: input.source,
    })
    .returning();
  return row!;
}

export async function supersedeFact(
  fighterId: number,
  id: number,
  replacement: {
    content: string;
    confidence: number;
    reason: string;
    source: string;
  },
): Promise<AthleteFact | null> {
  const [existing] = await db
    .select()
    .from(athleteFactsTable)
    .where(and(eq(athleteFactsTable.id, id), eq(athleteFactsTable.fighterId, fighterId)))
    .limit(1);
  if (!existing) return null;

  const [newFact] = await db
    .insert(athleteFactsTable)
    .values({
      fighterId,
      category: existing.category,
      topic: existing.topic,
      content: replacement.content.trim().slice(0, 600),
      confidence: clamp(replacement.confidence, 1, 5),
      source: replacement.source,
    })
    .returning();
  await db
    .update(athleteFactsTable)
    .set({ status: "superseded", supersededById: newFact!.id, resolvedReason: replacement.reason.slice(0, 240) })
    .where(eq(athleteFactsTable.id, existing.id));
  return newFact!;
}

// Athlete-facing accuracy check: the user confirms / softens / rejects an
// observation FRAME recorded. "yes" raises confidence (real signal that the
// read is right), "mostly" leaves the value but refreshes recency, "no"
// resolves the fact as inaccurate. No fabrication — confidence only moves on
// an explicit athlete signal.
export async function applyConfirmation(
  fighterId: number,
  id: number,
  response: "yes" | "mostly" | "no",
): Promise<AthleteFact | null> {
  const [existing] = await db
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
  if (!existing) return null;

  if (response === "no") {
    await db
      .update(athleteFactsTable)
      .set({ status: "resolved", resolvedReason: "athlete marked observation inaccurate" })
      .where(eq(athleteFactsTable.id, existing.id));
    return null;
  }

  const nextConfidence =
    response === "yes" ? clamp(existing.confidence + 1, 1, 5) : existing.confidence;
  const [updated] = await db
    .update(athleteFactsTable)
    .set({ confidence: nextConfidence, source: "athlete_confirmed" })
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
