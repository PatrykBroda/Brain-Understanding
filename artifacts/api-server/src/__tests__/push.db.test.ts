/** Push token routes, preferences and the job's store/triggers against a REAL Postgres. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import express from "express";
import crypto from "node:crypto";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { eq } from "drizzle-orm";
import { AI_CONSENT_VERSION } from "@workspace/ai-consent";
import { db, usersTable, fightersTable, pushTokensTable, videoAnalysesTable } from "@workspace/db";
import apiRouter from "../routes";
import { signToken } from "../routes/auth";
import { drizzlePushStore } from "../lib/pushStore";
import { runPushJob, type PushSender } from "../lib/pushService";

let server: Server;
let base = "";
const users: { id: string; token: string }[] = [];
const T1 = "ExponentPushToken[aaaaaaaaaaaaaaaaaaaa1]";
const T2 = "ExponentPushToken[bbbbbbbbbbbbbbbbbbbb2]";
const T3 = "ExponentPushToken[cccccccccccccccccccc3]";

async function mk(tag: string) {
  const id = crypto.randomUUID();
  const email = `push-${tag}-${Date.now()}@example.com`;
  await db.insert(usersTable).values({
    id,
    email,
    hashedPassword: "x",
    aiAnalysisConsentVersion: AI_CONSENT_VERSION,
    aiAnalysisConsentAt: new Date(),
  });
  await db.insert(fightersTable).values({
    userId: id,
    name: tag,
    dateOfBirth: "1990-06-15",
    age: 36,
    art: "boxing",
    primarySport: "boxing",
    level: "amateur",
    trainingFrequency: "3-4",
    timezone: "UTC",
  } as typeof fightersTable.$inferInsert);
  const u = { id, token: await signToken(id, email) };
  users.push(u);
  return u;
}

async function call(u: { token: string }, method: string, path: string, payload?: unknown) {
  const r = await fetch(base + path, {
    method,
    headers: { "content-type": "application/json", authorization: `Bearer ${u.token}` },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });
  return { status: r.status, json: (await r.json().catch(() => null)) as any };
}

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use("/api", apiRouter);
  await new Promise<void>((resolve) => {
    server = app.listen(0, "127.0.0.1", () => resolve());
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  server?.close();
  for (const u of users) {
    await db.delete(fightersTable).where(eq(fightersTable.userId, u.id));
    await db.delete(usersTable).where(eq(usersTable.id, u.id)); // cascades tokens/prefs/sent
  }
});

describe("push token + preference routes", () => {
  it("registers, moves a token between users, and unregisters (owner only)", async () => {
    const a = await mk("tok-a");
    const b = await mk("tok-b");
    expect((await call(a, "POST", "/api/push/register", { token: "garbage" })).status).toBe(400);
    expect((await call(a, "POST", "/api/push/register", { token: T1, platform: "ios" })).json).toEqual({ ok: true });
    await call(b, "POST", "/api/push/register", { token: T1, platform: "android" });
    let rows = await db.select().from(pushTokensTable).where(eq(pushTokensTable.token, T1));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.userId).toBe(b.id);
    await call(a, "DELETE", "/api/push/register", { token: T1 }); // no longer a's: no-op
    expect(await db.select().from(pushTokensTable).where(eq(pushTokensTable.token, T1))).toHaveLength(1);
    await call(b, "DELETE", "/api/push/register", { token: T1 });
    rows = await db.select().from(pushTokensTable).where(eq(pushTokensTable.token, T1));
    expect(rows).toHaveLength(0);
  });

  it("preferences default, partial update, and validation", async () => {
    const a = await mk("prefs");
    expect((await call(a, "GET", "/api/push/preferences")).json).toEqual({ enabled: true, quietStartMin: 1260, quietEndMin: 480 });
    const r = await call(a, "PUT", "/api/push/preferences", { enabled: false });
    expect(r.json).toEqual({ enabled: false, quietStartMin: 1260, quietEndMin: 480 });
    expect((await call(a, "PUT", "/api/push/preferences", { quietStartMin: 600 })).json.quietStartMin).toBe(600);
    expect((await call(a, "PUT", "/api/push/preferences", {})).status).toBe(400);
    expect((await call(a, "PUT", "/api/push/preferences", { quietStartMin: 2000 })).status).toBe(400);
  });
});

describe("drizzlePushStore + runPushJob", () => {
  it("lists users with context; claim is idempotent; release re-opens; tokens removable", async () => {
    const a = await mk("store");
    await db.insert(pushTokensTable).values({ userId: a.id, token: T2, platform: "ios" });
    const me = (await drizzlePushStore.listUsers(new Date())).find((u) => u.userId === a.id)!;
    expect(me.tokens).toEqual([T2]);
    expect(me.enabled).toBe(true);
    expect(me.timeZone).toBe("UTC");
    expect(me.lastCheckinDate).toBeNull();
    expect(await drizzlePushStore.claim(a.id, "k", "dk1")).toBe(true);
    expect(await drizzlePushStore.claim(a.id, "k", "dk1")).toBe(false);
    await drizzlePushStore.release(a.id, "dk1");
    expect(await drizzlePushStore.claim(a.id, "k", "dk1")).toBe(true);
    await drizzlePushStore.removeTokens([T2]);
    expect(await db.select().from(pushTokensTable).where(eq(pushTokensTable.userId, a.id))).toHaveLength(0);
  });

  it("job sends once per event, dedupes on re-run, and purges dead tokens", async () => {
    const a = await mk("job");
    const [f] = await db.select().from(fightersTable).where(eq(fightersTable.userId, a.id));
    await db.insert(pushTokensTable).values({ userId: a.id, token: T3, platform: "ios" });
    const now = new Date();
    now.setUTCHours(13, 0, 0, 0); // midday UTC: outside quiet hours
    const fresh = new Date(now.getTime() - 3_600_000);
    await db.insert(videoAnalysesTable).values({
      fighterId: f!.id,
      subject: "self",
      kind: "shadowboxing",
      nervousSystemLoad: "low",
      summary: "s",
      findings: [],
      metrics: { framesAnalysed: 1, poseFrames: 1, durationSec: 1, loadBasis: "x", signals: [] },
      keyframes: [],
      createdAt: fresh,
    } as typeof videoAnalysesTable.$inferInsert);
    const sent: string[] = [];
    let dead = false;
    const sender: PushSender = {
      async send(tokens, msg) {
        if (tokens.includes(T3)) sent.push(msg.kind);
        return { invalidTokens: dead ? tokens.filter((t) => t === T3) : [], delivered: !dead };
      },
    };
    const first = await runPushJob({ store: drizzlePushStore, sender, now });
    expect(sent).toContain("analysis_finished");
    expect(first.sent).toBeGreaterThanOrEqual(1);
    const again = await runPushJob({ store: drizzlePushStore, sender, now });
    expect(sent.filter((k) => k === "analysis_finished")).toHaveLength(1);
    expect(again.skippedDuplicate).toBeGreaterThanOrEqual(1);
    // A different event with every token dead purges the token.
    dead = true;
    await db.insert(videoAnalysesTable).values({
      fighterId: f!.id,
      subject: "self",
      kind: "shadowboxing",
      nervousSystemLoad: "low",
      summary: "s2",
      findings: [],
      metrics: { framesAnalysed: 1, poseFrames: 1, durationSec: 1, loadBasis: "x", signals: [] },
      keyframes: [],
      createdAt: fresh,
    } as typeof videoAnalysesTable.$inferInsert);
    await runPushJob({ store: drizzlePushStore, sender, now });
    expect(await db.select().from(pushTokensTable).where(eq(pushTokensTable.userId, a.id))).toHaveLength(0);
  });
});
