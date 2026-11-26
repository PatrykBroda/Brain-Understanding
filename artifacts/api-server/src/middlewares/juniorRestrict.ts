import type { NextFunction, Request, Response } from "express";
import { eq } from "drizzle-orm";
import { db, juniorAccountsTable } from "@workspace/db";
import { juniorAiEnabledGlobally } from "../lib/junior/accountConfig";

/**
 * A junior account (users.is_junior) is a tightly fenced login. It may call ONLY:
 *   /junior/config and /junior/junior-me  (its own small view).
 * Everything else is 403: no gym search, no join requests, no parent/guardian endpoints (so it cannot change
 * its linked parent), no coach/AI/chat endpoints (so it cannot message anyone), no account deletion.
 * A paused junior is blocked even with a still-valid token.
 * AI coach / chat opens ONLY when the server flag JUNIOR_AI_CHAT_ENABLED is on AND the parent enabled it
 * for that junior. TODO(Harry): off until decided.
 */
export function restrictJuniorAccounts(req: Request, res: Response, next: NextFunction): void {
  if (!req.isJunior) return next();
  const p = req.path;
  void (async () => {
    const [j] = await db.select().from(juniorAccountsTable).where(eq(juniorAccountsTable.userId, req.userId!));
    if (!j) return res.status(403).json({ error: "Not available", code: "JUNIOR_ACCOUNT_UNAVAILABLE" });
    if (j.status === "paused") return res.status(403).json({ error: "This account is paused by your parent", code: "JUNIOR_ACCOUNT_PAUSED" });
    if (p === "/junior/config" || p === "/junior/junior-me") return next();
    if (juniorAiEnabledGlobally() && j.aiEnabled && j.chatEnabled && (p.startsWith("/conversation") || p.startsWith("/coach"))) return next();
    return res.status(403).json({ error: "Not available for junior accounts", code: "JUNIOR_ACCOUNT_RESTRICTED" });
  })().catch(next);
}
