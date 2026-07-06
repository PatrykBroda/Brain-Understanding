import { Router, type IRouter } from "express";
import { z } from "zod/v4";
import { and, eq } from "drizzle-orm";
import { db, competitionsTable, SESSION_TYPES } from "@workspace/db";
import { getUserFighter } from "../middlewares/authMiddleware";
import { upsertCalendarSessions } from "../lib/trainingSessionService";
import {
  beginLink,
  completeLink,
  consumeState,
  disconnect,
  exportManualSessions,
  getStatus,
  importPreview,
  isConfigured,
  GoogleAuthRevokedError,
} from "../lib/googleCalendarService";

// ── Public router: the OAuth callback (Google has no Clerk session) ──────────
// Mounted BEFORE requireAuth. Identity is recovered from the signed state, not a
// cookie, so this works identically for web and mobile linking.
export const googlePublicRouter: IRouter = Router();

function page(title: string, body: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><title>${title}</title><style>
    :root{color-scheme:dark}
    body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0a0a0a;color:#e5e5e5;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
    .card{max-width:28rem;padding:2rem;text-align:center}
    h1{font-size:1.05rem;font-weight:600;letter-spacing:.02em;margin:0 0 .75rem}
    p{margin:.35rem 0;color:#a3a3a3;font-size:.9rem;line-height:1.5}
    .em{color:#e5e5e5}
  </style></head><body><div class="card">${body}</div>
  <script>setTimeout(function(){try{window.close()}catch(e){}},1500)</script>
  </body></html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

googlePublicRouter.get("/google/oauth/callback", async (req, res) => {
  const send = (title: string, body: string, status = 200): void => {
    res.status(status).type("html").send(page(title, body));
  };

  const error = typeof req.query["error"] === "string" ? req.query["error"] : null;
  if (error) {
    send("FRAME", "<h1>Linking cancelled</h1><p>You can close this window and return to FRAME.</p>");
    return;
  }
  const code = typeof req.query["code"] === "string" ? req.query["code"] : null;
  const state = typeof req.query["state"] === "string" ? req.query["state"] : null;
  if (!code || !state) {
    send("FRAME", "<h1>Link failed</h1><p>Missing authorization details. Return to FRAME and try again.</p>", 400);
    return;
  }
  if (!isConfigured()) {
    send("FRAME", "<h1>Not configured</h1><p>Google Calendar is not set up on this server.</p>", 503);
    return;
  }

  try {
    const clerkUserId = await consumeState(state);
    if (!clerkUserId) {
      send("FRAME", "<h1>Link expired</h1><p>That request expired or was already used. Return to FRAME and try again.</p>", 400);
      return;
    }
    const email = await completeLink(clerkUserId, code);
    const who = email
      ? `<p>Linked as <span class="em">${escapeHtml(email)}</span>.</p>`
      : "<p>Your Google Calendar is linked.</p>";
    send("FRAME", `<h1>Calendar linked</h1>${who}<p>Return to FRAME — you can close this window.</p>`);
  } catch (err) {
    req.log.error({ err }, "google oauth callback failed");
    send("FRAME", "<h1>Link failed</h1><p>Something went wrong linking your calendar. Return to FRAME and try again.</p>", 500);
  }
});

// ── Authed router: everything else ──────────────────────────────────────────
export const googleRouter: IRouter = Router();

// Kick off linking. Returns the Google consent URL for the client to open.
googleRouter.post("/google/oauth/start", async (req, res) => {
  if (!isConfigured()) {
    res.status(503).json({ error: "not_configured" });
    return;
  }
  const clerkUserId = req.clerkUserId!;
  const url = await beginLink(clerkUserId);
  res.json({ url });
});

// Client-safe link status (never returns tokens). Always 200 so clients can poll.
googleRouter.get("/google/status", async (req, res) => {
  if (!isConfigured()) {
    res.json({ configured: false, connected: false, googleEmail: null, lastSyncedAt: null });
    return;
  }
  const status = await getStatus(req.clerkUserId!);
  res.json({ configured: true, ...status });
});

googleRouter.delete("/google/connection", async (req, res) => {
  if (!isConfigured()) {
    res.status(503).json({ error: "not_configured" });
    return;
  }
  await disconnect(req.clerkUserId!);
  res.json({ ok: true });
});

async function ownedCamp(
  campId: number,
  fighterId: number,
): Promise<{ id: number; eventDate: Date } | null> {
  const [row] = await db
    .select({ id: competitionsTable.id, eventDate: competitionsTable.eventDate })
    .from(competitionsTable)
    .where(and(eq(competitionsTable.id, campId), eq(competitionsTable.fighterId, fighterId)))
    .limit(1);
  return row ?? null;
}

function syncWindow(eventDate: Date): { timeMin: Date; timeMax: Date } {
  const now = new Date();
  const timeMin = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  // Include the whole event day.
  const timeMax = new Date(eventDate.getTime() + 24 * 60 * 60 * 1000);
  return { timeMin, timeMax };
}

const previewSchema = z.object({
  campId: z.number().int().positive(),
  timeZone: z.string().min(1).max(64),
});

// Fetch Google events in the camp window and return a preview the user confirms.
googleRouter.post("/google/sync/preview", async (req, res) => {
  if (!isConfigured()) {
    res.status(503).json({ error: "not_configured" });
    return;
  }
  const fighter = await getUserFighter(req);
  if (!fighter) {
    res.status(400).json({ error: "no fighter" });
    return;
  }
  const parsed = previewSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid request", details: parsed.error.flatten() });
    return;
  }
  const camp = await ownedCamp(parsed.data.campId, fighter.id);
  if (!camp) {
    res.status(404).json({ error: "camp not found" });
    return;
  }
  const { timeMin, timeMax } = syncWindow(camp.eventDate);
  try {
    const items = await importPreview(req.clerkUserId!, timeMin, timeMax, parsed.data.timeZone);
    res.json({ items });
  } catch (err) {
    if (err instanceof GoogleAuthRevokedError) {
      res.status(409).json({ error: "revoked" });
      return;
    }
    req.log.error({ err }, "google sync preview failed");
    res.status(502).json({ error: "google request failed" });
  }
});

const importItemSchema = z.object({
  externalEventId: z.string().min(1),
  sessionType: z.enum(SESSION_TYPES),
  sessionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  durationMin: z.number().int().positive().max(1440).nullable().optional(),
  objective: z.string().max(500).optional(),
});

const applySchema = z.object({
  campId: z.number().int().positive(),
  timeZone: z.string().min(1).max(64),
  importItems: z.array(importItemSchema).max(500).default([]),
  exportSessions: z.boolean().default(false),
});

// Apply the confirmed two-way sync: import approved events + optionally export
// manual sessions. Idempotent via the (campId, externalEventId) upsert.
googleRouter.post("/google/sync/apply", async (req, res) => {
  if (!isConfigured()) {
    res.status(503).json({ error: "not_configured" });
    return;
  }
  const fighter = await getUserFighter(req);
  if (!fighter) {
    res.status(400).json({ error: "no fighter" });
    return;
  }
  const parsed = applySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid request", details: parsed.error.flatten() });
    return;
  }
  const camp = await ownedCamp(parsed.data.campId, fighter.id);
  if (!camp) {
    res.status(404).json({ error: "camp not found" });
    return;
  }

  try {
    let imported = 0;
    if (parsed.data.importItems.length > 0) {
      imported = await upsertCalendarSessions(
        camp.id,
        fighter.id,
        parsed.data.importItems.map((i) => ({
          externalEventId: i.externalEventId,
          sessionType: i.sessionType,
          sessionDate: i.sessionDate,
          startTime: i.startTime ?? null,
          durationMin: i.durationMin ?? null,
          objective: i.objective ?? "",
        })),
      );
    }
    let exported = 0;
    if (parsed.data.exportSessions) {
      exported = await exportManualSessions(
        req.clerkUserId!,
        camp.id,
        fighter.id,
        parsed.data.timeZone,
      );
    }
    res.json({ imported, exported });
  } catch (err) {
    if (err instanceof GoogleAuthRevokedError) {
      res.status(409).json({ error: "revoked" });
      return;
    }
    req.log.error({ err }, "google sync apply failed");
    res.status(502).json({ error: "google request failed" });
  }
});

export default googleRouter;
