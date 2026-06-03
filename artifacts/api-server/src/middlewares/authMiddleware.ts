import { getAuth, verifyToken } from "@clerk/express";
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

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
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
    const cookiePairs = cookie
      .split(/;\s*/)
      .map((c) => c.split("="))
      .filter((p) => p[0]);
    const cookieNames = cookiePairs.map((p) => p[0]);
    const hasDbJwt = cookieNames.includes("__clerk_db_jwt");
    const decodeJwt = (raw: string): unknown => {
      try {
        const parts = decodeURIComponent(raw).split(".");
        if (parts.length !== 3 || !parts[1]) return { notJwt: true, len: raw.length };
        const p = JSON.parse(
          Buffer.from(parts[1], "base64url").toString("utf8"),
        ) as Record<string, unknown>;
        return { iss: p["iss"] ?? null, sub: p["sub"] ?? null, exp: p["exp"] ?? null, iat: p["iat"] ?? null };
      } catch (e) {
        return { decodeError: e instanceof Error ? e.message : String(e) };
      }
    };
    const sessionRaw = cookiePairs
      .filter((p) => p[0] === "__session")
      .map((p) => p[1] ?? "");
    const sessionCookies = sessionRaw.map((raw) => decodeJwt(raw));
    const verifyResults: unknown[] = [];
    for (const raw of sessionRaw) {
      const token = decodeURIComponent(raw);
      try {
        const payload = await verifyToken(token, {
          secretKey: process.env["CLERK_SECRET_KEY"] ?? "",
          authorizedParties: undefined,
        });
        verifyResults.push({ ok: true, sub: payload.sub, sid: payload.sid, exp: payload.exp });
      } catch (e) {
        verifyResults.push({
          ok: false,
          name: e instanceof Error ? e.name : typeof e,
          reason: (e as { reason?: unknown })?.reason ?? null,
          message: e instanceof Error ? e.message : String(e),
        });
      }
    }
    const tokenClaims = {
      sessionCount: sessionCookies.length,
      sessions: sessionCookies,
      verifyResults,
      hasDbJwt,
      cookieNames,
      nowEpoch: Math.floor(Date.now() / 1000),
    };
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
