import { getAuth } from "@clerk/express";
import type { Request, Response, NextFunction } from "express";
import { db, fightersTable, usersTable, type Fighter } from "@workspace/db";
import { eq } from "drizzle-orm";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      clerkUserId?: string;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const auth = getAuth(req);
  const claimUserId =
    (auth?.sessionClaims as { userId?: string } | null | undefined)?.userId;
  const userId = claimUserId ?? auth?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  req.clerkUserId = userId;
  next();
}

async function ensureUser(clerkUserId: string): Promise<void> {
  await db.insert(usersTable).values({ clerkUserId }).onConflictDoNothing();
}

export async function getUserFighter(req: Request): Promise<Fighter | null> {
  const cid = req.clerkUserId;
  if (!cid) return null;
  await ensureUser(cid);
  const [fighter] = await db
    .select()
    .from(fightersTable)
    .where(eq(fightersTable.userId, cid))
    .limit(1);
  return fighter ?? null;
}
