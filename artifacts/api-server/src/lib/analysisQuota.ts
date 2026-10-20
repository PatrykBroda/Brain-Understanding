import { db, videoAnalysesTable } from "@workspace/db";
import { and, count, eq } from "drizzle-orm";
import { freeAnalysisAllowance, type FreeAnalysisAllowance } from "./analysisAccess";

/** Saved self analyses for a fighter — the lifetime count the free allowance is measured against. */
export async function countSelfAnalyses(fighterId: number): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(videoAnalysesTable)
    .where(and(eq(videoAnalysesTable.fighterId, fighterId), eq(videoAnalysesTable.subject, "self")));
  return Number(row?.n ?? 0);
}

export async function getFreeAllowance(fighterId: number): Promise<FreeAnalysisAllowance> {
  return freeAnalysisAllowance(await countSelfAnalyses(fighterId));
}
