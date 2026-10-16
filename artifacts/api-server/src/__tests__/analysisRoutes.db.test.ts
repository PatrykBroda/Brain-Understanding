/**
 * Analysis routes against a REAL Postgres (DATABASE_URL), Claude mocked.
 *
 * Covers the paths that previously only had unit tests: POST /analysis with a
 * pose_track (self + opponent half), GET /analysis/:id, the list endpoint not
 * leaking the track, GET /analysis/:id/compare-track (opp stripped, ownership,
 * ?withId), bad/oversize tracks degrading to "saved without visuals", the
 * Opponent Mode (scout) insert, and that the AI is told when an opponent was
 * tracked in the clip.
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
import { eq, inArray } from "drizzle-orm";
import { db, usersTable, fightersTable, videoAnalysesTable } from "@workspace/db";
import { AI_CONSENT_VERSION } from "@workspace/ai-consent";
import apiRouter from "../routes";
import { signToken } from "../routes/auth";

const EMAIL = `analysis-db-${Date.now()}@example.com`;
let server: Server;
let base = "";
let token = "";
let userId = "";
const createdIds: number[] = [];

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

const OPP_NARRATIVE = {
  styleProfile: "Reactive Counter",
  styleParallels: [],
  summary: "Waits and counters.",
  findings: [{ title: "Drops the rear hand", observation: "Rear hand low.", nervousSystemFraming: "Opening.", severity: "medium", area: "guard" }],
  matchup: { summary: "x", advantages: [], risks: [], gamePlan: [] },
};

// Wire format v1 (owned by artifacts/coach/src/lib/pose-track.ts; the coach contract test keeps the
// two in step): per frame 33 landmarks x (x u16 LE, y u16 LE, vis u8). Built here without importing
// the coach so the api-server's own typecheck stays self-contained.
function packFrames(n: number, phase: number) {
  const buf = Buffer.alloc(n * 33 * 5);
  let o = 0;
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < 33; k++) {
      buf.writeUInt16LE(Math.round((0.3 + 0.4 * ((k + i + phase) % 7) / 7) * 65535), o);
      buf.writeUInt16LE(Math.round((0.1 + 0.8 * k / 33) * 65535), o + 2);
      buf[o + 4] = 230;
      o += 5;
    }
  }
  return { t: Array.from({ length: n }, (_, i) => i * 250), d: buf.toString("base64") };
}

function wireTrack(opts: { opp?: boolean; n?: number } = {}) {
  const n = opts.n ?? 30;
  const main = packFrames(n, 0);
  return {
    v: 1,
    w: 1280,
    h: 720,
    lead: "left" as const,
    ...main,
    ...(opts.opp ? { opp: { lead: null, ...packFrames(n, 3) } } : {}),
  };
}

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
  const r = await call("POST", "/api/analysis", body(over));
  if (r.json?.analysis?.id) createdIds.push(r.json.analysis.id);
  return r;
}

beforeAll(async () => {
  userId = crypto.randomUUID();
  await db.insert(usersTable).values({ id: userId, email: EMAIL, hashedPassword: "x" });
  await db
    .update(usersTable)
    .set({
      plan: "frame_plus",
      subscriptionStatus: "active",
      currentPeriodEnd: new Date(Date.now() + 365 * 86400_000),
      aiAnalysisConsentVersion: AI_CONSENT_VERSION,
      aiAnalysisConsentAt: new Date(),
    })
    .where(eq(usersTable.id, userId));
  await db.insert(fightersTable).values({
    userId,
    name: "Route Tester",
    dateOfBirth: "1990-06-15",
    age: 36,
    art: "boxing",
    primarySport: "boxing",
    level: "amateur",
    trainingFrequency: "3-4",
  } as typeof fightersTable.$inferInsert);
  token = await signToken(userId, EMAIL);
  const app = express();
  app.use(express.json({ limit: "20mb" }));
  app.use("/api", apiRouter);
  await new Promise<void>((resolve) => {
    server = app.listen(0, "127.0.0.1", () => resolve());
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  server?.close();
  if (createdIds.length) await db.delete(videoAnalysesTable).where(inArray(videoAnalysesTable.id, createdIds));
  await db.delete(fightersTable).where(eq(fightersTable.userId, userId));
  await db.delete(usersTable).where(eq(usersTable.id, userId));
});

describe("POST /analysis with a pose track (real Postgres)", () => {
  it("stores the athlete + opponent track, serves it on GET :id, and keeps it out of the list", async () => {
    const posted = await postSelf({ poseTrack: wireTrack({ opp: true }) });
    expect(posted.status).toBe(200);
    const id = posted.json.analysis.id as number;
    expect(posted.json.analysis.poseTrack.opp).toBeTruthy();

    const got = await call("GET", `/api/analysis/${id}`);
    expect(got.status).toBe(200);
    expect(got.json.analysis.poseTrack.v).toBe(1);
    expect(got.json.analysis.poseTrack.opp.d.length).toBeGreaterThan(0);

    const list = await call("GET", "/api/analysis");
    expect(list.status).toBe(200);
    expect(JSON.stringify(list.json)).not.toContain('"poseTrack"');
    expect(list.json.analyses.some((a: { id: number }) => a.id === id)).toBe(true);
  });

  it("tells the AI an opponent was tracked, and only then", async () => {
    createMock.mockClear();
    await postSelf({ poseTrack: wireTrack({ opp: true }) });
    const withOpp = JSON.stringify(createMock.mock.calls[0]![0].system);
    expect(withOpp).toContain("two fighters in this clip");
    expect(withOpp).toContain("ATHLETE only");

    createMock.mockClear();
    await postSelf({ poseTrack: wireTrack() });
    expect(JSON.stringify(createMock.mock.calls[0]![0].system)).not.toContain("two fighters in this clip");
  });

  it("saves the analysis without visuals when the track is malformed or oversize", async () => {
    const bad = await postSelf({ poseTrack: { v: 1, w: 1280, h: 720, lead: "left", t: [0, 1, 2], d: "!!!" } });
    expect(bad.status).toBe(200);
    expect(bad.json.analysis.poseTrack).toBeNull();

    const huge = await postSelf({ poseTrack: { ...wireTrack(), d: "A".repeat(400_000) } });
    expect(huge.status).toBe(200);
    expect(huge.json.analysis.poseTrack).toBeNull();

    const none = await postSelf();
    expect(none.status).toBe(200);
    expect(none.json.analysis.poseTrack).toBeNull();
  });

  it("drops only a bad opponent half, keeping the athlete track", async () => {
    const t = wireTrack({ opp: true });
    const r = await postSelf({ poseTrack: { ...t, opp: { ...t.opp!, d: "###" } } });
    expect(r.status).toBe(200);
    expect(r.json.analysis.poseTrack.d.length).toBeGreaterThan(0);
    expect(r.json.analysis.poseTrack.opp).toBeUndefined();
  });

  it("rejects a clip with no signals and a self read without the four attributes", async () => {
    createMock.mockClear();
    expect((await call("POST", "/api/analysis", body({ signals: [] }))).status).toBe(400);
    expect((await call("POST", "/api/analysis", body({ scores: [] }))).status).toBe(400);
    expect(createMock).not.toHaveBeenCalled();
  });
});

describe("GET /analysis/:id/compare-track (real Postgres)", () => {
  it("returns the previous same-kind track with the opponent half stripped, and honours withId", async () => {
    const first = await postSelf({ poseTrack: wireTrack({ opp: true }) });
    const second = await postSelf({ poseTrack: wireTrack({ n: 24 }) });
    const firstId = first.json.analysis.id as number;
    const secondId = second.json.analysis.id as number;

    const cmp = await call("GET", `/api/analysis/${secondId}/compare-track`);
    expect(cmp.status).toBe(200);
    expect(cmp.json.baseline).toBeTruthy();
    expect(cmp.json.baseline.poseTrack.v).toBe(1);
    expect(cmp.json.baseline.poseTrack.opp).toBeUndefined();

    const pinned = await call("GET", `/api/analysis/${secondId}/compare-track?withId=${firstId}`);
    expect(pinned.json.baseline.id).toBe(firstId);
    expect(pinned.json.baseline.poseTrack.opp).toBeUndefined();

    const self = await call("GET", `/api/analysis/${secondId}/compare-track?withId=${secondId}`);
    expect(self.json.baseline).toBeNull();
  });

  it("is 404 for an unknown or someone else's analysis, 400 for a bad id", async () => {
    expect((await call("GET", "/api/analysis/99999999/compare-track")).status).toBe(404);
    expect((await call("GET", "/api/analysis/abc/compare-track")).status).toBe(400);
    const otherUser = crypto.randomUUID();
    await db.insert(usersTable).values({ id: otherUser, email: `other-${EMAIL}`, hashedPassword: "x" });
    const [otherFighter] = await db
      .insert(fightersTable)
      .values({
        userId: otherUser,
        name: "Other",
        dateOfBirth: "1990-01-01",
        age: 36,
        art: "boxing",
        primarySport: "boxing",
        level: "amateur",
        trainingFrequency: "3-4",
      } as typeof fightersTable.$inferInsert)
      .returning();
    const [foreign] = await db
      .insert(videoAnalysesTable)
      .values({
        fighterId: otherFighter!.id,
        subject: "self",
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
      } as typeof videoAnalysesTable.$inferInsert)
      .returning();
    try {
      expect((await call("GET", `/api/analysis/${foreign!.id}/compare-track`)).status).toBe(404);
      expect((await call("GET", `/api/analysis/${foreign!.id}`)).status).toBe(404);
    } finally {
      await db.delete(videoAnalysesTable).where(eq(videoAnalysesTable.id, foreign!.id));
      await db.delete(fightersTable).where(eq(fightersTable.userId, otherUser));
      await db.delete(usersTable).where(eq(usersTable.id, otherUser));
    }
  });

  it("an opponent scout compares against the athlete's most recent tracked read", async () => {
    createMock.mockResolvedValueOnce(toolUse("emit_opponent_read", OPP_NARRATIVE));
    const scout = await call("POST", "/api/analysis", body({ subject: "opponent", opponentName: "Rival", poseTrack: wireTrack(), scores: [] }));
    expect(scout.status).toBe(200);
    createdIds.push(scout.json.analysis.id);
    expect(scout.json.analysis.subject).toBe("opponent");
    expect(scout.json.analysis.poseTrack.v).toBe(1);
    const cmp = await call("GET", `/api/analysis/${scout.json.analysis.id}/compare-track`);
    expect(cmp.status).toBe(200);
    expect(cmp.json.baseline.poseTrack.opp).toBeUndefined();
  });
});

describe("PATCH /analysis/:id/notes (real Postgres)", () => {
  it("saves keyframe notes that come back on GET", async () => {
    const posted = await postSelf({ poseTrack: wireTrack() });
    const id = posted.json.analysis.id as number;
    const patched = await call("PATCH", `/api/analysis/${id}/notes`, { notes: { "0": "my note" } });
    expect(patched.status).toBe(200);
    const got = await call("GET", `/api/analysis/${id}`);
    expect(got.json.analysis.keyframeNotes?.["0"]).toBe("my note");
  });
});

describe("deleting an athlete removes their analyses and pose tracks (real Postgres)", () => {
  it("cascades from the fighter row, leaving other users' analyses alone", async () => {
    const gone = crypto.randomUUID();
    await db.insert(usersTable).values({ id: gone, email: `gone-${EMAIL}`, hashedPassword: "x" });
    const [f] = await db
      .insert(fightersTable)
      .values({
        userId: gone,
        name: "Leaver",
        dateOfBirth: "1990-01-01",
        age: 36,
        art: "boxing",
        primarySport: "boxing",
        level: "amateur",
        trainingFrequency: "3-4",
      } as typeof fightersTable.$inferInsert)
      .returning();
    const [row] = await db
      .insert(videoAnalysesTable)
      .values({
        fighterId: f!.id,
        subject: "self",
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
        poseTrack: wireTrack({ opp: true }),
        durationSec: 0,
      } as typeof videoAnalysesTable.$inferInsert)
      .returning({ id: videoAnalysesTable.id });
    const mine = createdIds[0]!;
    await db.delete(fightersTable).where(eq(fightersTable.id, f!.id));
    await db.delete(usersTable).where(eq(usersTable.id, gone));
    const left = await db.select({ id: videoAnalysesTable.id }).from(videoAnalysesTable).where(inArray(videoAnalysesTable.id, [row!.id, mine]));
    expect(left.map((r) => r.id)).toEqual([mine]);
  });
});
