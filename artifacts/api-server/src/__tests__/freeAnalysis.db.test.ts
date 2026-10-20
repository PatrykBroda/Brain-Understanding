/**
 * Free-tier video analysis gate against a REAL Postgres, Claude mocked: 2 free saved self
 * analyses (lifetime, per user), then the FRAME+ paywall; generic errors, never SQL.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const { createMock } = vi.hoisted(() => ({ createMock: vi.fn() }));

vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn(function () {
    return { messages: { create: createMock } };
  }),
}));

import express from "express";
import crypto from "node:crypto";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { eq } from "drizzle-orm";
import { db, usersTable, fightersTable, videoAnalysesTable } from "@workspace/db";
import { AI_CONSENT_VERSION } from "@workspace/ai-consent";
import apiRouter from "../routes";
import { signToken } from "../routes/auth";

const EMAIL = `analysis-free-${Date.now()}@example.com`;
let server: Server;
let base = "";
let token = "";
let userId = "";
let fighterId = 0;

function toolUse(name: string, input: unknown) {
  return { content: [{ type: "tool_use", id: "tu", name, input }] };
}

const SELF_NARRATIVE = {
  contentValid: true,
  styleProfile: "Pressure Forward",
  aiComment: "Hands sink when you commit.",
  summary: "A forward fighter whose guard leaves the line.",
  findings: [
    {
      title: "Guard drops after the jab",
      observation: "Hands sink below the chin.",
      nervousSystemFraming: "Output narrows defence.",
      severity: "high",
      area: "guard",
      keyframeIndex: 0,
      bodyRegion: "head",
    },
  ],
  replay: [{ role: "best_decision", keyframeIndex: 0, note: "Clean reset." }],
};

function body(over: Record<string, unknown> = {}) {
  return {
    kind: "sparring",
    load: "moderate",
    fragmentationRisk: "moderate",
    durationSec: 7.5,
    framesAnalysed: 30,
    poseFrames: 30,
    loadBasis: "test",
    signals: [{ key: "guard", label: "Guard", value: "mid", detail: "hands at 0.4 shoulder widths" }],
    scores: [
      { key: "aggression", label: "Aggression", value: 60, basis: "b" },
      { key: "composure", label: "Composure", value: 55, basis: "b" },
      { key: "reaction_speed", label: "Reaction speed", value: 50, basis: "b" },
      { key: "defensive_recovery", label: "Defensive recovery", value: 45, basis: "b" },
    ],
    detectedEvents: [{ timestamp: 2, type: "guard_drop", label: "Guard drop", severity: "high" }],
    keyframes: [{ timestamp: 2, imageBase64: "data:image/jpeg;base64," + "A".repeat(200), caption: "guard drop", eventType: "guard_drop" }],
    ...over,
  };
}

async function call(method: string, path: string, payload?: unknown) {
  const r = await fetch(base + path, {
    method,
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });
  const text = await r.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* not json */
  }
  return { status: r.status, json, text };
}

async function postSelf(over: Record<string, unknown> = {}) {
  createMock.mockResolvedValueOnce(toolUse("emit_analysis", SELF_NARRATIVE));
  return call("POST", "/api/analysis", body(over));
}

beforeAll(async () => {
  userId = crypto.randomUUID();
  await db.insert(usersTable).values({ id: userId, email: EMAIL, hashedPassword: "x" });
  await db
    .update(usersTable)
    .set({ aiAnalysisConsentVersion: AI_CONSENT_VERSION, aiAnalysisConsentAt: new Date() })
    .where(eq(usersTable.id, userId));
  const [f] = await db
    .insert(fightersTable)
    .values({
      userId,
      name: "Free Tester",
      dateOfBirth: "1990-06-15",
      age: 36,
      art: "boxing",
      primarySport: "boxing",
      level: "amateur",
      trainingFrequency: "3-4",
    } as typeof fightersTable.$inferInsert)
    .returning();
  fighterId = f!.id;
  token = await signToken(userId, EMAIL);
  const app = express();
  app.use(express.json({ limit: "20mb" }));
  app.use((req, _res, next) => {
    const noop = () => {};
    (req as unknown as { log: object }).log = { error: noop, warn: noop, info: noop, debug: noop };
    next();
  });
  app.use("/api", apiRouter);
  await new Promise<void>((resolve) => {
    server = app.listen(0, "127.0.0.1", () => resolve());
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  server?.close();
  await db.delete(fightersTable).where(eq(fightersTable.userId, userId)); // cascades analyses
  await db.delete(usersTable).where(eq(usersTable.id, userId));
});

describe("free video analysis allowance (real Postgres)", () => {
  it("reports 2 left, allows two saved analyses, then answers 402 FRAME_PLUS_REQUIRED", async () => {
    const s0 = await call("GET", "/api/billing/status");
    expect(s0.json.plan).toBe("free");
    expect(s0.json.freeAnalyses).toEqual({ limit: 2, used: 0, remaining: 2 });

    expect((await postSelf()).status).toBe(200);
    expect((await call("GET", "/api/billing/status")).json.freeAnalyses.remaining).toBe(1);
    expect((await postSelf()).status).toBe(200);
    expect((await call("GET", "/api/billing/status")).json.freeAnalyses.remaining).toBe(0);

    createMock.mockClear();
    const third = await call("POST", "/api/analysis", body());
    expect(third.status).toBe(402);
    expect(third.json.code).toBe("FRAME_PLUS_REQUIRED");
    expect(createMock).not.toHaveBeenCalled();
  });

  it("keeps opponent scouting FRAME+ only, even with free analyses left", async () => {
    await db.delete(videoAnalysesTable).where(eq(videoAnalysesTable.fighterId, fighterId));
    const r = await call("POST", "/api/analysis", body({ subject: "opponent", opponentName: "X" }));
    expect(r.status).toBe(402);
    expect(r.json.feature).toBe("opponent_analysis");
  });

  it("counts a user's existing past analyses, and only saved self rows", async () => {
    await db.delete(videoAnalysesTable).where(eq(videoAnalysesTable.fighterId, fighterId));
    const row = {
      fighterId,
      kind: "sparring",
      focus: "",
      nervousSystemLoad: "low",
      fragmentationRisk: "low",
      sessionScore: 50,
      styleProfile: "x",
      aiComment: "",
      summary: "x",
      findings: [],
      scores: [],
      styleParallels: [],
      detectedEvents: [],
      metrics: { framesAnalysed: 0, poseFrames: 0, durationSec: 0, loadBasis: "", signals: [] },
      keyframes: [],
      durationSec: 0,
    };
    await db.insert(videoAnalysesTable).values([
      { ...row, subject: "self" },
      { ...row, subject: "opponent" }, // scouting never uses the free allowance
      { ...row, subject: "self" },
    ] as (typeof videoAnalysesTable.$inferInsert)[]);
    expect((await call("GET", "/api/billing/status")).json.freeAnalyses).toEqual({ limit: 2, used: 2, remaining: 0 });
    expect((await call("POST", "/api/analysis", body())).status).toBe(402);
  });

  it("FRAME+ stays unlimited and has no allowance block", async () => {
    await db
      .update(usersTable)
      .set({ plan: "frame_plus", subscriptionStatus: "active", currentPeriodEnd: new Date(Date.now() + 86400_000) })
      .where(eq(usersTable.id, userId));
    expect((await postSelf()).status).toBe(200);
    expect((await call("GET", "/api/billing/status")).json.freeAnalyses).toBeUndefined();
    await db
      .update(usersTable)
      .set({ plan: "free", subscriptionStatus: null, currentPeriodEnd: null })
      .where(eq(usersTable.id, userId));
  });
});

describe("a failed save never leaks SQL and does not spend the allowance (real Postgres)", () => {
  it("answers a generic ANALYSIS_SAVE_FAILED after one retry", async () => {
    await db.delete(videoAnalysesTable).where(eq(videoAnalysesTable.fighterId, fighterId));
    const real = db.insert.bind(db);
    const spy = vi.spyOn(db, "insert").mockImplementation(((table: unknown) => {
      if (table === videoAnalysesTable) throw new Error('Failed query: insert into "video_analyses" (...) params: 28,6,sparring');
      return real(table as never);
    }) as never);
    createMock.mockResolvedValueOnce(toolUse("emit_analysis", SELF_NARRATIVE));
    const r = await call("POST", "/api/analysis", body());
    spy.mockRestore();
    expect(r.status).toBe(500);
    expect(r.json.code).toBe("ANALYSIS_SAVE_FAILED");
    expect(r.text).not.toMatch(/insert into|params|video_analyses/i);
    expect((await call("GET", "/api/billing/status")).json.freeAnalyses.used).toBe(0);
  });

  it("answers a generic ANALYSIS_FAILED when the AI call blows up", async () => {
    createMock.mockRejectedValueOnce(new Error("secret upstream detail"));
    const r = await call("POST", "/api/analysis", body());
    expect(r.status).toBe(500);
    expect(r.text).not.toContain("secret upstream detail");
  });
});
