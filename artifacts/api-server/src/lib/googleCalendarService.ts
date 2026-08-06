import { calendar, auth, type calendar_v3 } from "@googleapis/calendar";
import { and, eq, isNull, lt } from "drizzle-orm";
import {
  db,
  googleCalendarConnectionsTable,
  googleOauthStatesTable,
  trainingSessionsTable,
  SESSION_TYPES,
  type SessionType,
  type GoogleCalendarConnection,
} from "@workspace/db";
import { decrypt, encrypt, signState, verifyState } from "./googleCrypto";

// Per-user Google Calendar link + two-way sync. Tokens live encrypted in
// google_calendar_connections keyed by userId — never returned to a client.
// Identity for the public callback travels in a signed `state` (see googleCrypto).

// Use the OAuth2 client bundled with @googleapis/calendar (via googleapis-common)
// so its types match calendar({ auth }) exactly — importing a second copy of
// google-auth-library caused a private-property type clash.
type OAuth2Client = InstanceType<typeof auth.OAuth2>;
type Credentials = Parameters<OAuth2Client["setCredentials"]>[0];

const SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/calendar.events",
];

export class GoogleAuthRevokedError extends Error {
  constructor(message = "google authorization revoked — re-link required") {
    super(message);
    this.name = "GoogleAuthRevokedError";
  }
}

export class GoogleNotConfiguredError extends Error {
  constructor(message = "Google Calendar is not configured on the server") {
    super(message);
    this.name = "GoogleNotConfiguredError";
  }
}

// All three secrets must be present for the flow to work at all. The server still
// boots without them; routes surface a clear 503 instead of crashing.
export function isConfigured(): boolean {
  return !!(
    process.env["GOOGLE_OAUTH_CLIENT_ID"] &&
    process.env["GOOGLE_OAUTH_CLIENT_SECRET"] &&
    process.env["APP_ENCRYPTION_KEY"] &&
    process.env["SESSION_SECRET"]
  );
}

// Built from an env allowlist, NEVER request headers. Must exactly match a URI
// registered on the Google OAuth client (register both dev and prod).
export function redirectUri(): string {
  const override = process.env["GOOGLE_OAUTH_REDIRECT_URI"];
  if (override) return override;
  const host = (process.env["REPLIT_DOMAINS"] ?? process.env["REPLIT_DEV_DOMAIN"] ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)[0];
  if (!host) throw new Error("cannot derive redirect URI: no REPLIT_DOMAINS set");
  return `https://${host}/api/google/oauth/callback`;
}

function makeClient(): OAuth2Client {
  const id = process.env["GOOGLE_OAUTH_CLIENT_ID"];
  const secret = process.env["GOOGLE_OAUTH_CLIENT_SECRET"];
  if (!id || !secret) throw new GoogleNotConfiguredError();
  return new auth.OAuth2(id, secret, redirectUri());
}

function isInvalidGrant(err: unknown): boolean {
  const e = err as { message?: string; response?: { data?: { error?: string } } };
  return (
    e?.response?.data?.error === "invalid_grant" ||
    /invalid_grant/i.test(String(e?.message ?? ""))
  );
}

// ── OAuth handshake ─────────────────────────────────────────────────────────

// Mint + persist a single-use signed state, return the Google consent URL.
export async function beginLink(userId: string): Promise<string> {
  const { state, expiresAt } = signState(userId);
  // Opportunistic prune of expired nonces so the table stays tiny.
  await db.delete(googleOauthStatesTable).where(lt(googleOauthStatesTable.expiresAt, new Date()));
  await db.insert(googleOauthStatesTable).values({ state, userId, expiresAt });
  return makeClient().generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES,
    state,
    include_granted_scopes: true,
  });
}

// Verify signature + single-use nonce; returns the userId or null.
export async function consumeState(state: string): Promise<string | null> {
  const payload = verifyState(state);
  if (!payload) return null;
  const [row] = await db
    .delete(googleOauthStatesTable)
    .where(eq(googleOauthStatesTable.state, state))
    .returning();
  if (!row) return null; // unknown or already used
  if (row.expiresAt.getTime() < Date.now()) return null;
  return payload.u;
}

// Exchange the auth code, extract the confirming email, persist encrypted tokens.
// Returns the linked Google email for the callback page.
export async function completeLink(userId: string, code: string): Promise<string> {
  const client = makeClient();
  const { tokens } = await client.getToken(code);

  let googleEmail = "";
  if (tokens.id_token) {
    try {
      const ticket = await client.verifyIdToken({
        idToken: tokens.id_token,
        audience: process.env["GOOGLE_OAUTH_CLIENT_ID"],
      });
      googleEmail = ticket.getPayload()?.email ?? "";
    } catch {
      // email is best-effort confirmation only
    }
  }

  const encAccess = tokens.access_token ? encrypt(tokens.access_token) : null;
  const encRefresh = tokens.refresh_token ? encrypt(tokens.refresh_token) : null;
  const expiryDate = tokens.expiry_date ? new Date(tokens.expiry_date) : null;
  const scope = tokens.scope ?? SCOPES.join(" ");

  // Preserve an existing refresh token if Google omitted one on re-consent, and
  // keep the previously-confirmed email if id_token verification came back empty
  // (re-consent often ships no id_token) so we never blank a good value.
  const existing = await getConnectionRow(userId);
  const finalRefresh = encRefresh ?? existing?.encRefreshToken ?? null;
  const finalEmail = googleEmail || existing?.googleEmail || "";

  await db
    .insert(googleCalendarConnectionsTable)
    .values({
      userId,
      googleEmail: finalEmail,
      encAccessToken: encAccess,
      encRefreshToken: finalRefresh,
      expiryDate,
      scope,
      calendarId: "primary",
    })
    .onConflictDoUpdate({
      target: googleCalendarConnectionsTable.userId,
      set: {
        googleEmail: finalEmail,
        encAccessToken: encAccess,
        encRefreshToken: finalRefresh,
        expiryDate,
        scope,
        updatedAt: new Date(),
      },
    });

  return finalEmail;
}

// ── Connection state ────────────────────────────────────────────────────────

async function getConnectionRow(
  userId: string,
): Promise<GoogleCalendarConnection | null> {
  const [row] = await db
    .select()
    .from(googleCalendarConnectionsTable)
    .where(eq(googleCalendarConnectionsTable.userId, userId))
    .limit(1);
  return row ?? null;
}

export type GoogleStatus = {
  connected: boolean;
  googleEmail: string | null;
  lastSyncedAt: string | null;
};

// Client-safe status — NEVER exposes tokens.
export async function getStatus(userId: string): Promise<GoogleStatus> {
  const row = await getConnectionRow(userId);
  if (!row) return { connected: false, googleEmail: null, lastSyncedAt: null };
  return {
    connected: true,
    googleEmail: row.googleEmail || null,
    lastSyncedAt: row.lastSyncedAt ? row.lastSyncedAt.toISOString() : null,
  };
}

export async function disconnect(userId: string): Promise<void> {
  const row = await getConnectionRow(userId);
  // Best-effort revoke at Google so our access is actually withdrawn.
  if (row?.encRefreshToken && isConfigured()) {
    try {
      const client = makeClient();
      await client.revokeToken(decrypt(row.encRefreshToken));
    } catch {
      // revoke is best-effort; deleting our copy is what matters
    }
  }
  await db
    .delete(googleCalendarConnectionsTable)
    .where(eq(googleCalendarConnectionsTable.userId, userId));
}

// Return an OAuth2 client with a fresh access token, refreshing + persisting as
// needed. Throws GoogleAuthRevokedError when the grant is gone.
async function authorizedClient(userId: string): Promise<{
  client: OAuth2Client;
  calendarId: string;
}> {
  const row = await getConnectionRow(userId);
  if (!row) throw new GoogleAuthRevokedError("no Google connection");
  const client = makeClient();
  const refresh = row.encRefreshToken ? decrypt(row.encRefreshToken) : null;
  const access = row.encAccessToken ? decrypt(row.encAccessToken) : null;

  const creds: Credentials = {};
  if (refresh) creds.refresh_token = refresh;
  if (access) creds.access_token = access;
  if (row.expiryDate) creds.expiry_date = row.expiryDate.getTime();
  client.setCredentials(creds);

  const stale =
    !access || !row.expiryDate || row.expiryDate.getTime() < Date.now() + 60_000;
  if (stale) {
    if (!refresh) throw new GoogleAuthRevokedError("no refresh token — re-link required");
    try {
      await client.getAccessToken(); // triggers refresh, mutates client.credentials
      const c = client.credentials;
      await db
        .update(googleCalendarConnectionsTable)
        .set({
          encAccessToken: c.access_token ? encrypt(c.access_token) : row.encAccessToken,
          expiryDate: c.expiry_date ? new Date(c.expiry_date) : row.expiryDate,
          updatedAt: new Date(),
        })
        .where(eq(googleCalendarConnectionsTable.userId, userId));
    } catch (err) {
      if (isInvalidGrant(err)) {
        await disconnect(userId);
        throw new GoogleAuthRevokedError();
      }
      throw err;
    }
  }
  return { client, calendarId: row.calendarId || "primary" };
}

// ── Pure mapping helpers (unit-tested) ──────────────────────────────────────

export function suggestSessionType(title: string): SessionType {
  const t = (title ?? "").toLowerCase();
  if (/\bspar/.test(t)) return "sparring";
  if (/wrestl|takedown|grappl/.test(t)) return "wrestling";
  if (/\bbjj\b|jiu|jitsu|\broll/.test(t)) return "bjj";
  if (/strik|box|muay|kick|\bpad/.test(t)) return "striking";
  if (/condition|strength|\blift|cardio|\bs&c\b|\brun/.test(t)) return "conditioning";
  if (/recover|\brest\b|massage|physio/.test(t)) return "recovery";
  if (/mobilit|stretch|yoga|\bflow\b/.test(t)) return "mobility";
  return "conditioning";
}

export function formatInTz(iso: string, tz: string): { date: string; time: string } {
  const d = new Date(iso);
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(d);
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
    let hour = get("hour");
    if (hour === "24") hour = "00";
    return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${hour}:${get("minute")}` };
  } catch {
    return { date: d.toISOString().slice(0, 10), time: d.toISOString().slice(11, 16) };
  }
}

export type ImportPreviewItem = {
  externalEventId: string;
  title: string;
  sessionDate: string;
  startTime: string | null;
  durationMin: number | null;
  suggestedType: SessionType;
};

export function eventToPreview(
  ev: calendar_v3.Schema$Event,
  fallbackTz: string,
): ImportPreviewItem | null {
  const id = ev.id;
  if (!id) return null;
  const title = ev.summary ?? "(untitled)";
  const start = ev.start ?? {};
  const end = ev.end ?? {};
  if (start.date) {
    return {
      externalEventId: id,
      title,
      sessionDate: start.date,
      startTime: null,
      durationMin: null,
      suggestedType: suggestSessionType(title),
    };
  }
  if (start.dateTime) {
    const tz = start.timeZone ?? fallbackTz;
    const { date, time } = formatInTz(start.dateTime, tz);
    let durationMin: number | null = null;
    if (end.dateTime) {
      const ms = Date.parse(end.dateTime) - Date.parse(start.dateTime);
      if (ms > 0) durationMin = Math.round(ms / 60000);
    }
    return {
      externalEventId: id,
      title,
      sessionDate: date,
      startTime: time,
      durationMin,
      suggestedType: suggestSessionType(title),
    };
  }
  return null;
}

function titleCase(s: string): string {
  return s.length ? s[0]!.toUpperCase() + s.slice(1) : s;
}

function addOneDay(dateStr: string): string {
  const [y, mo, d] = dateStr.split("-").map(Number);
  const t = Date.UTC(y!, mo! - 1, d!) + 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

function wallEnd(dateStr: string, time: string, addMin: number): string {
  const [y, mo, d] = dateStr.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  const base = Date.UTC(y!, mo! - 1, d!, h!, mi!) + addMin * 60_000;
  const e = new Date(base);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${e.getUTCFullYear()}-${p(e.getUTCMonth() + 1)}-${p(e.getUTCDate())}T${p(
    e.getUTCHours(),
  )}:${p(e.getUTCMinutes())}:00`;
}

export type ExportableSession = {
  sessionType: string;
  sessionDate: string;
  startTime: string | null;
  durationMin: number | null;
  objective: string;
  notes: string;
  coach: string;
};

export function sessionToEvent(
  s: ExportableSession,
  tz: string,
): calendar_v3.Schema$Event {
  const summary = s.objective
    ? `${titleCase(s.sessionType)} — ${s.objective}`
    : titleCase(s.sessionType);
  const lines: string[] = [];
  if (s.objective) lines.push(s.objective);
  if (s.coach) lines.push(`Coach: ${s.coach}`);
  if (s.notes) lines.push(s.notes);
  lines.push("Scheduled in FRAME");
  const description = lines.join("\n");

  if (!s.startTime) {
    return {
      summary,
      description,
      start: { date: s.sessionDate },
      end: { date: addOneDay(s.sessionDate) },
    };
  }
  const dur = s.durationMin && s.durationMin > 0 ? s.durationMin : 60;
  return {
    summary,
    description,
    start: { dateTime: `${s.sessionDate}T${s.startTime}:00`, timeZone: tz },
    end: { dateTime: wallEnd(s.sessionDate, s.startTime, dur), timeZone: tz },
  };
}

// ── Orchestration (routes call these) ───────────────────────────────────────

export async function importPreview(
  userId: string,
  timeMin: Date,
  timeMax: Date,
  fallbackTz: string,
): Promise<ImportPreviewItem[]> {
  const { client, calendarId } = await authorizedClient(userId);
  const cal = calendar({ version: "v3", auth: client });
  const items: calendar_v3.Schema$Event[] = [];
  let pageToken: string | undefined;
  do {
    const resp = await cal.events.list({
      calendarId,
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      singleEvents: true,
      orderBy: "startTime",
      maxResults: 250,
      pageToken,
    });
    items.push(...(resp.data.items ?? []));
    pageToken = resp.data.nextPageToken ?? undefined;
  } while (pageToken);

  await touchSynced(userId);
  return items
    .map((e) => eventToPreview(e, fallbackTz))
    .filter((x): x is ImportPreviewItem => x !== null);
}

// Push manual, not-yet-exported sessions to Google and record their event ids so
// re-import upserts in place (loop-safe together with the setWhere guard).
export async function exportManualSessions(
  userId: string,
  campId: number,
  fighterId: number,
  tz: string,
): Promise<number> {
  const rows = await db
    .select()
    .from(trainingSessionsTable)
    .where(
      and(
        eq(trainingSessionsTable.campId, campId),
        eq(trainingSessionsTable.fighterId, fighterId),
        eq(trainingSessionsTable.source, "manual"),
        isNull(trainingSessionsTable.externalEventId),
      ),
    );
  if (rows.length === 0) return 0;

  const { client, calendarId } = await authorizedClient(userId);
  const cal = calendar({ version: "v3", auth: client });

  let exported = 0;
  for (const row of rows) {
    const resp = await cal.events.insert({
      calendarId,
      requestBody: sessionToEvent(
        {
          sessionType: row.sessionType,
          sessionDate: row.sessionDate,
          startTime: row.startTime,
          durationMin: row.durationMin,
          objective: row.objective,
          notes: row.notes,
          coach: row.coach,
        },
        tz,
      ),
    });
    const eventId = resp.data.id;
    if (eventId) {
      await db
        .update(trainingSessionsTable)
        .set({ externalEventId: eventId, updatedAt: new Date() })
        .where(eq(trainingSessionsTable.id, row.id));
      exported++;
    }
  }
  await touchSynced(userId);
  return exported;
}

async function touchSynced(userId: string): Promise<void> {
  await db
    .update(googleCalendarConnectionsTable)
    .set({ lastSyncedAt: new Date(), updatedAt: new Date() })
    .where(eq(googleCalendarConnectionsTable.userId, userId));
}

export { SESSION_TYPES };
