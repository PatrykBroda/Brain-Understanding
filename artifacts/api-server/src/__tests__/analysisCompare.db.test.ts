/** GET /analysis/compare against a REAL Postgres: FRAME+ gate, validation, own self-rows only. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import express from "express";
import crypto from "node:crypto";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { eq } from "drizzle-orm";
import { db, usersTable, fightersTable, videoAnalysesTable } from "@workspace/db";
import { AI_CONSENT_VERSION } from "@workspace/ai-consent";
import apiRouter from "../routes";
import { signToken } from "../routes/auth";

let server: Server;
let base = "";
const users: { id: string; token: string; fighterId: number }[] = [];

async function mk(tag: string, premium: boolean) {
  const id = crypto.randomUUID();
  const email = `cmp-${tag}-${Date.now()}@example.com`;
  await db.insert(usersTable).values({ id, email, hashedPassword: "x" });
  await db
    .update(usersTable)
    .set({
      aiAnalysisConsentVersion: AI_CONSENT_VERSION,
      aiAnalysisConsentAt: new Date(),
      ...(premium
        ? { plan: "frame_plus" as const, subscriptionStatus: "active", currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000) }
        : {}),
    })
    .where(eq(usersTable.id, id));
  const [f] = await db
    .insert(fightersTable)
    .values({
      userId: id,
      name: tag,
      dateOfBirth: "1990-06-15",
      age: 36,
      art: "boxing",
      primarySport: "boxing",
      level: "amateur",
      trainingFrequency: "3-4",
    } as typeof fightersTable.$inferInsert)
    .returning();
  const u = { id, token: await signToken(id, email), fighterId: f!.id };
  users.push(u);
  return u;
}

async function seed(fighterId: number, daysAgo: number, score: number, subject: "self" | "opponent" = "self") {
  const [r] = await db
    .insert(videoAnalysesTable)
    .values({
      fighterId,
      subject,
      kind: "shadowboxing",
      nervousSystemLoad: "low",
      sessionScore: score,
      summary: "s",
      findings: [{ title: "Guard drops", observation: "o", nervousSystemFraming: "n", severity: "medium", area: "guard" }],
      scores: [{ key: "balance", label: "Balance", value: score, basis: "pose" }],
      metrics: { framesAnalysed: 1, poseFrames: 1, durationSec: 1, loadBasis: "x", signals: [] },
      keyframes: [],
      createdAt: new Date(Date.now() - daysAgo * 86_400_000),
    } as typeof videoAnalysesTable.$inferInsert)
    .returning();
  return r!.id;
}

async function get(u: { token: string }, q: string) {
  const r = await fetch(`${base}/api/analysis/compare${q}`, { headers: { authorization: `Bearer ${u.token}` } });
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
    await db.delete(fightersTable).where(eq(fightersTable.userId, u.id)); // cascades analyses
    await db.delete(usersTable).where(eq(usersTable.id, u.id));
  }
});

describe("GET /api/analysis/compare", () => {
  it("free user gets the 402 FRAME+ upsell", async () => {
    const f = await mk("free", false);
    const a = await seed(f.fighterId, 28, 50);
    const b = await seed(f.fighterId, 0, 60);
    const r = await get(f, `?a=${a}&b=${b}`);
    expect(r.status).toBe(402);
    expect(r.json).toMatchObject({ code: "FRAME_PLUS_REQUIRED", feature: "analysis_history" });
  });

  it("400 on a bad pair", async () => {
    const p = await mk("badpair", true);
    expect((await get(p, "?a=1&b=1")).status).toBe(400);
    expect((await get(p, "?a=x&b=2")).status).toBe(400);
    expect((await get(p, "")).status).toBe(400);
  });

  it("premium compares two own reads, oldest first", async () => {
    const p = await mk("prem", true);
    const newer = await seed(p.fighterId, 0, 70);
    const older = await seed(p.fighterId, 28, 55);
    const r = await get(p, `?a=${newer}&b=${older}`);
    expect(r.status).toBe(200);
    expect(r.json.earlierId).toBe(older);
    expect(r.json.laterId).toBe(newer);
    expect(r.json.daysApart).toBeGreaterThanOrEqual(27);
    expect(r.json.sessionScore).toMatchObject({ before: 55, after: 70, delta: 15 });
  });

  it("404 for another athlete's or opponent analyses", async () => {
    const p = await mk("mine", true);
    const o = await mk("theirs", true);
    const mine = await seed(p.fighterId, 5, 50);
    const theirs = await seed(o.fighterId, 1, 60);
    const opp = await seed(p.fighterId, 2, 60, "opponent");
    expect((await get(p, `?a=${mine}&b=${theirs}`)).status).toBe(404);
    expect((await get(p, `?a=${mine}&b=${opp}`)).status).toBe(404);
  });
});
