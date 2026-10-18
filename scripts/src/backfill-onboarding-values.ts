// One-off, idempotent backfill: rewrite existing fighters' art / primary_sport /
// level / training_frequency to the canonical set ("3-4" -> "3-4x / week",
// "BJJ / Grappling" -> "BJJ", ...). The API already normalises every NEW write,
// so this only tidies rows written by older builds. Optional: nothing depends on it.
//
//   DATABASE_URL=postgres://... pnpm --filter @workspace/scripts run backfill-onboarding-values            # dry run (default): prints what WOULD change
//   DATABASE_URL=postgres://... pnpm --filter @workspace/scripts run backfill-onboarding-values -- --apply # writes
//
// Safe to re-run: a row already canonical is never touched, and values the
// normaliser does not recognise (e.g. "MMA (Wrestling-heavy)") are left as is.
import { eq } from "drizzle-orm";
import { db, pool, fightersTable } from "@workspace/db";
import { normaliseFighterAnswers } from "@workspace/onboarding";

const FIELDS = ["art", "primarySport", "level", "trainingFrequency"] as const;

async function main() {
  const apply = process.argv.includes("--apply");
  const rows = await db
    .select({
      id: fightersTable.id,
      art: fightersTable.art,
      primarySport: fightersTable.primarySport,
      level: fightersTable.level,
      trainingFrequency: fightersTable.trainingFrequency,
    })
    .from(fightersTable);

  const tally = new Map<string, number>();
  const updates: { id: number; set: Partial<Record<(typeof FIELDS)[number], string>> }[] = [];
  for (const row of rows) {
    const next = normaliseFighterAnswers({
      art: row.art,
      primarySport: row.primarySport,
      level: row.level,
      trainingFrequency: row.trainingFrequency,
    });
    const set: Partial<Record<(typeof FIELDS)[number], string>> = {};
    for (const f of FIELDS) {
      if (next[f] !== undefined && next[f] !== row[f]) {
        set[f] = next[f];
        const k = `${f}: ${JSON.stringify(row[f])} -> ${JSON.stringify(next[f])}`;
        tally.set(k, (tally.get(k) ?? 0) + 1);
      }
    }
    if (Object.keys(set).length > 0) updates.push({ id: row.id, set });
  }

  console.log(`${rows.length} fighters, ${updates.length} need changes.`);
  for (const [k, n] of [...tally].sort()) console.log(`  ${String(n).padStart(4)}  ${k}`);

  if (!apply) {
    console.log("\nDry run: nothing written. Re-run with --apply to write these changes.");
    return;
  }
  await db.transaction(async (tx) => {
    for (const u of updates) await tx.update(fightersTable).set(u.set).where(eq(fightersTable.id, u.id));
  });
  console.log(`\nApplied to ${updates.length} fighters.`);
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
