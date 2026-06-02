import { getAuth } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import type { Request, Response, NextFunction } from "express";
import { db, fightersTable, usersTable, type Fighter } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getClerkProxyHost } from "./clerkProxyMiddleware";

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
    const cookie = req.headers.cookie ?? "";
    const host = getClerkProxyHost(req) ?? "";
    const envPk = process.env["CLERK_PUBLISHABLE_KEY"] ?? "";
    let derivedPk = "";
    try {
      derivedPk = publishableKeyFromHost(host, envPk) ?? "";
    } catch (e) {
      derivedPk = `ERR:${e instanceof Error ? e.message : String(e)}`;
    }
    const prefix = (s: string) => (s ? `${s.slice(0, 8)}…(${s.length})` : "<empty>");
    let tokenClaims: unknown = null;
    try {
      const sessionMatch = /(?:^|;\s*)__session=([^;]+)/.exec(cookie);
      const raw = sessionMatch?.[1] ? decodeURIComponent(sessionMatch[1]) : "";
      const parts = raw.split(".");
      if (parts.length === 3 && parts[1]) {
        const payload = JSON.parse(
          Buffer.from(parts[1], "base64url").toString("utf8"),
        ) as Record<string, unknown>;
        tokenClaims = {
          iss: payload["iss"] ?? null,
          sub: payload["sub"] ?? null,
          azp: payload["azp"] ?? null,
          exp: payload["exp"] ?? null,
          nbf: payload["nbf"] ?? null,
          iat: payload["iat"] ?? null,
          nowEpoch: Math.floor(Date.now() / 1000),
        };
      } else {
        tokenClaims = { note: `__session value not a JWT (parts=${parts.length}, len=${raw.length})` };
      }
    } catch (e) {
      tokenClaims = { decodeError: e instanceof Error ? e.message : String(e) };
    }
    req.log.warn(
      {
        authDebug: {
          hasCookieHeader: cookie.length > 0,
          hasSessionCookie: cookie.includes("__session"),
          hasClientCookie: cookie.includes("__client"),
          hasAuthHeader: Boolean(req.headers.authorization),
          host,
          forwardedHost: req.headers["x-forwarded-host"] ?? null,
          forwardedProto: req.headers["x-forwarded-proto"] ?? null,
          envPk: prefix(envPk),
          derivedPk: prefix(derivedPk),
          pkMatches: derivedPk === envPk,
          tokenClaims,
          auth: auth ? JSON.stringify(auth) : null,
        },
      },
      "requireAuth: rejected request (no userId)",
    );
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
