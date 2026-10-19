import type { Request, Response, NextFunction } from "express";
import { db, fightersTable, usersTable, type Fighter } from "@workspace/db";
import { eq } from "drizzle-orm";
import { verifyToken } from "../routes/auth";
import { ensureFighter } from "../lib/ensureFighter";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    req.log.warn({ url: req.url }, "requireAuth: no Bearer token");
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const token = header.slice(7);
  verifyToken(token)
    .then(async (payload) => {
      if (!payload) {
        req.log.warn({ url: req.url }, "requireAuth: invalid token");
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
      // Verify the user still exists in the DB.  A valid JWT for a deleted
      // account must not grant access — this is the global revocation check
      // since JWTs are otherwise not revocable.
      const [user] = await db
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(eq(usersTable.id, payload.userId))
        .limit(1);
      if (!user) {
        req.log.warn({ url: req.url, userId: payload.userId }, "requireAuth: user not found");
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
      req.userId = payload.userId;
      next();
    })
    .catch((err) => {
      req.log.error({ err }, "requireAuth: token verification threw");
      res.status(500).json({ error: "Internal error" });
    });
}

/**
 * The signed-in user's fighter. Every account has one (sign-up creates a blank stub), but accounts
 * made by older builds, or stalled before their first save, may not: the stub is created here on
 * first read, so callers never see null for a real user.
 */
export async function getUserFighter(req: Request): Promise<Fighter | null> {
  const uid = req.userId;
  if (!uid) return null;
  const [fighter] = await db
    .select()
    .from(fightersTable)
    .where(eq(fightersTable.userId, uid))
    .limit(1);
  if (fighter) return fighter;
  try {
    return await ensureFighter(uid);
  } catch (err) {
    req.log?.warn({ err }, "ensureFighter failed");
    return null;
  }
}
