/**
 * "Model observations not updating from previous days" (Harry, 17 Oct).
 *
 * Plays several days of an athlete's life against a REAL Postgres with the
 * model boundary stubbed (no Anthropic key in CI): footage findings via POST
 * /analysis, chat via the memory extractor's tool-call writer, and the card's
 * data via GET /memory. Time is simulated by backdating the evidence trail.
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
import { db, usersTable, fightersTable, athleteFactsTable, videoAnalysesTable } from "@workspace/db";
import { AI_CONSENT_VERSION } from "@workspace/ai-consent";
import apiRouter from "../routes";
import { signToken } from "../routes/auth";
import { applyMemoryToolCalls } from "../lib/memoryExtractor";
import { addFact } from "../lib/factsService";

const EMAIL = `obs-refresh-${Date.now()}@example.com`;
const log = { info() {}, warn() {}, error() {} } as never;
const DAY = 86_400_000;
let server: Server;
let base = "";
let token = "";
let userId = "";
let fighterId = 0;

const finding = (title: string, severity = "high") => ({
  title,
  observation: `${title} observed.`,
  nervousSystemFraming: "Output narrows defence.",
  severity,
  area: "guard",
  keyframeIndex: 0,
  bodyRegion: "head",
});
const narrative = (findings: unknown[]) => ({
  contentValid: true,
  styleProfile: "Pressure Forward",
  aiComment: "c",
  summary: "s",
  findings,
  replay: [{ role: "best_decision", keyframeIndex: 0, note: "n" }],
});

function analysisBody() {
  return {
    kind: "sparring",
    load: "moderate",
    fragmentationRisk: "moderate",
    durationSec: 7.5,
    framesAnalysed: 30,
    poseFrames: 30,
    loadBasis: "test",
    signals: [{ key: "guard", label: "Guard", value: "mid", detail: "d" }],
    scores: [
      { key: "aggression", label: "Aggression", value: 60, basis: "b" },
      { key: "composure", label: "Composure", value: 55, basis: "b" },
      { key: "reaction_speed", label: "Reaction speed", value: 50, basis: "b" },
      { key: "defensive_recovery", label: "Defensive recovery", value: 45, basis: "b" },
    ],
    detectedEvents: [{ timestamp: 2, type: "guard_drop", label: "Guard drop", severity: "high" }],
    keyframes: [{ timestamp: 2, imageBase64: "data:image/jpeg;base64," + "A".repeat(200), caption: "c", eventType: "guard_drop" }],
  };
}

async function call(method: string, path: string, payload?: unknown) {
  const r = await fetch(base + path, {
    method,
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });
  return { status: r.status, json: (await r.json().catch(() => null)) as any };
}

async function analyse(findings: unknown[]) {
  createMock.mockResolvedValueOnce({
    content: [{ type: "tool_use", id: "tu", name: "emit_analysis", input: narrative(findings) }],
  });
  const r = await call("POST", "/api/analysis", analysisBody());
  expect(r.status).toBe(200);
  return r.json;
}

/** Make a fact look like it was last seen `days` ago (evidence trail, creation and confirmation). */
async function ageFact(id: number, days: number) {
  const [row] = await db.select().from(athleteFactsTable).where(eq(athleteFactsTable.id, id));
  const at = new Date(Date.now() - days * DAY);
  await db
    .update(athleteFactsTable)
    .set({
      createdAt: at,
      lastConfirmedAt: row!.lastConfirmedAt ? at : null,
      sources: row!.sources.map((s) => ({ ...s, at: at.toISOString() })),
    })
    .where(eq(athleteFactsTable.id, id));
}

const memory = async () => (await call("GET", "/api/memory")).json.facts as any[];

beforeAll(async () => {
  userId = crypto.randomUUID();
  await db.insert(usersTable).values({ id: userId, email: EMAIL, hashedPassword: "x" });
  await db
    .update(usersTable)
    .set({
      plan: "frame_plus",
      subscriptionStatus: "active",
      currentPeriodEnd: new Date(Date.now() + 365 * DAY),
      aiAnalysisConsentVersion: AI_CONSENT_VERSION,
      aiAnalysisConsentAt: new Date(),
    })
    .where(eq(usersTable.id, userId));
  const [f] = await db
    .insert(fightersTable)
    .values({
      userId,
      name: "Harry Test",
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
  app.use("/api", apiRouter);
  await new Promise<void>((resolve) => {
    server = app.listen(0, "127.0.0.1", () => resolve());
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  server?.close();
  await db.delete(videoAnalysesTable).where(eq(videoAnalysesTable.fighterId, fighterId));
  await db.delete(fightersTable).where(eq(fightersTable.userId, userId));
  await db.delete(usersTable).where(eq(usersTable.id, userId));
});

describe("the athlete model keeps up with the athlete", () => {
  it("a re-seen observation strengthens and moves to 'last seen', new ones appear, old ones fade then resolve", async () => {
    // Day 0 — footage: two observations recorded.
    await analyse([finding("Shoulder brace on entry"), finding("Output rhythm bursty", "medium")]);
    let facts = await memory();
    const brace = facts.find((f) => f.topic.includes("Shoulder brace"))!;
    const rhythm = facts.find((f) => f.topic.includes("Output rhythm"))!;
    expect(facts).toHaveLength(2);

    // ...then the clock runs: 45 days later neither has been re-seen, so both fade.
    await ageFact(brace.id, 45);
    await ageFact(rhythm.id, 45);
    await db.update(athleteFactsTable).set({ confidence: 3 }).where(eq(athleteFactsTable.id, rhythm.id));
    facts = await memory();
    expect(facts.find((f) => f.id === rhythm.id)!.confidence).toBe(2);

    // Day 45 — chat re-sees the shoulder brace and the athlete mentions a new weakness.
    const tally = await applyMemoryToolCalls(
      fighterId,
      [
        { type: "tool_use", name: "confirm_fact", input: { id: brace.id } },
        { type: "tool_use", name: "add_fact", input: { category: "weakness", topic: "Gas tank late in rounds", content: "Fades in round 3." } },
      ],
      log,
    );
    expect(tally).toMatchObject({ confirmed: 1, added: 1 });
    facts = await memory();
    const strengthened = facts.find((f) => f.id === brace.id)!;
    expect(strengthened.evidenceCount).toBe(2);
    expect(strengthened.confidence).toBeGreaterThan(brace.confidence);
    expect(new Date(strengthened.lastConfirmedAt).getTime()).toBeGreaterThan(Date.now() - DAY);
    expect(facts.some((f) => f.topic === "Gas tank late in rounds")).toBe(true);

    // Day 130 for the one nobody re-saw: no longer shown, and resolved (not deleted).
    await ageFact(rhythm.id, 130);
    facts = await memory();
    expect(facts.some((f) => f.id === rhythm.id)).toBe(false);
    const [row] = await db.select().from(athleteFactsTable).where(eq(athleteFactsTable.id, rhythm.id));
    expect(row!.status).toBe("resolved");
    expect(row!.resolvedReason).toMatch(/not seen/);
  });

  it("footage that re-shows a recorded observation (matchesFactId) strengthens it instead of duplicating", async () => {
    const seeded = await addFact(fighterId, {
      category: "weakness",
      topic: "Sparring: guard abandonment",
      content: "Guard leaves the line under pressure.",
      source: { type: "video", ref: "video:0" },
    });
    await ageFact(seeded.id, 20);
    await analyse([{ ...finding("Guard abandonment again"), matchesFactId: seeded.id }]);
    const facts = await memory();
    const after = facts.find((f) => f.id === seeded.id)!;
    expect(after.evidenceCount).toBe(2);
    expect(facts.filter((f) => f.topic.toLowerCase().includes("guard abandonment"))).toHaveLength(1);
  });

  it("chat add_fact for a topic already on the card strengthens it instead of creating a near-duplicate", async () => {
    const first = await addFact(fighterId, {
      category: "pattern",
      topic: "Base drift",
      content: "Base narrows in scrambles.",
      source: { type: "video", ref: "video:1" },
    });
    const tally = await applyMemoryToolCalls(
      fighterId,
      [{ type: "tool_use", name: "add_fact", input: { category: "pattern", topic: "base  drift", content: "Base narrows when scrambling." } }],
      log,
    );
    expect(tally).toMatchObject({ added: 0, confirmed: 1 });
    const same = (await memory()).filter((f) => f.topic.toLowerCase() === "base drift");
    expect(same).toHaveLength(1);
    expect(same[0].id).toBe(first.id);
    expect(same[0].evidenceCount).toBe(2);
  });

  it("a confirm for an unknown or closed observation is a no-op, not reported as an update", async () => {
    const tally = await applyMemoryToolCalls(
      fighterId,
      [{ type: "tool_use", name: "confirm_fact", input: { id: 999_999_999 } }],
      log,
    );
    expect(tally).toEqual({ added: 0, confirmed: 0, superseded: 0, resolved: 0 });
  });

  it("goals do not age out", async () => {
    const goal = await addFact(fighterId, {
      category: "goal",
      topic: "Compete in March",
      content: "First amateur bout.",
      source: { type: "chat" },
    });
    await ageFact(goal.id, 400);
    const kept = (await memory()).find((f) => f.id === goal.id);
    expect(kept).toBeTruthy();
    expect(kept.confidence).toBe(goal.confidence);
  });
});
