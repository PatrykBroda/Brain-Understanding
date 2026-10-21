/**
 * Coach chat reliability against a REAL Postgres and the local provider stand-in:
 * the cache warm-up, idempotent sends (clientMessageId), a retry attaching to an
 * in-flight turn, and the provider call being aborted when the app hangs up.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import express from "express";
import crypto from "node:crypto";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { asc, eq, sql } from "drizzle-orm";
import { db, usersTable, fightersTable, conversationsTable, messagesTable } from "@workspace/db";
import { AI_CONSENT_VERSION } from "@workspace/ai-consent";
import { signToken } from "../routes/auth";
import { startMockProviders, type MockProviders } from "./helpers/mockProviders";

const EMAIL = `coach-idem-${Date.now()}@example.com`;
let mock: MockProviders;
let server: Server;
let base = "";
let token = "";
let userId = "";
let fighterId = 0;

const headers = () => ({
  "content-type": "application/json",
  authorization: `Bearer ${token}`,
  "x-timezone": "Asia/Bangkok",
});

function parse(text: string) {
  const events = text
    .split("\n\n")
    .filter((b) => b.startsWith("data: "))
    .map((b) => JSON.parse(b.slice(6)) as Record<string, any>);
  return {
    events,
    text: events.filter((e) => e.content).map((e) => e.content).join(""),
    done: events.find((e) => e.done) as Record<string, any> | undefined,
    error: events.find((e) => e.error) as Record<string, any> | undefined,
  };
}

async function chat(content: string, clientMessageId?: string) {
  const r = await fetch(`${base}/coach/chat`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ content, clientMessageId }),
  });
  return { status: r.status, ...parse(await r.text()) };
}

const coachCalls = () => mock.requests.filter((q) => q.stream);

async function rows() {
  const [conv] = await db.select().from(conversationsTable).where(eq(conversationsTable.fighterId, fighterId));
  if (!conv) return [];
  return db
    .select()
    .from(messagesTable)
    .where(eq(messagesTable.conversationId, conv.id))
    .orderBy(asc(messagesTable.id));
}

const waitFor = async (cond: () => boolean | Promise<boolean>, ms = 5_000) => {
  const t0 = Date.now();
  while (!(await cond())) {
    if (Date.now() - t0 > ms) throw new Error("timed out waiting");
    await new Promise((r) => setTimeout(r, 25));
  }
};

beforeAll(async () => {
  mock = await startMockProviders();
  process.env["AI_INTEGRATIONS_ANTHROPIC_BASE_URL"] = mock.anthropicBase;
  process.env["AI_INTEGRATIONS_OPENAI_BASE_URL"] = mock.openaiBase;
  const { default: apiRouter } = await import("../routes");

  userId = crypto.randomUUID();
  await db.insert(usersTable).values({ id: userId, email: EMAIL, hashedPassword: "x", isAdmin: true });
  await db
    .update(usersTable)
    .set({ aiAnalysisConsentVersion: AI_CONSENT_VERSION, aiAnalysisConsentAt: new Date() })
    .where(eq(usersTable.id, userId));
  const [f] = await db
    .insert(fightersTable)
    .values({
      userId,
      name: "Idem Test",
      dateOfBirth: "1990-06-15",
      age: 36,
      art: "BJJ",
      primarySport: "bjj",
      level: "Blue",
      trainingFrequency: "3-4x / week",
      goals: "win my first comp",
      weaknesses: "guard retention",
      personality: "Steady.",
    } as typeof fightersTable.$inferInsert)
    .returning();
  fighterId = f!.id;
  token = await signToken(userId, EMAIL);
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as unknown as { log: Record<string, () => void> }).log = { info() {}, warn() {}, error() {}, debug() {} };
    next();
  });
  app.use("/api", apiRouter);
  await new Promise<void>((resolve) => {
    server = app.listen(0, "127.0.0.1", () => resolve());
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await mock.close();
  await db.delete(usersTable).where(eq(usersTable.id, userId));
});

beforeEach(async () => {
  mock.reset();
  await db.delete(conversationsTable).where(eq(conversationsTable.fighterId, fighterId));
  await db.execute(sql`delete from daily_context where fighter_id = ${fighterId}`);
});

// Runs first: the warm-up is skipped once a chat has touched the cache recently.
describe("prompt cache warm-up", () => {
  it("warms the shared static block with a 1-token call, at most once per 4 minutes per user", async () => {
    const r1 = await fetch(`${base}/coach/warm`, { method: "POST", headers: headers() });
    expect(r1.status).toBe(202);
    await waitFor(() => mock.requests.length > 0);
    const warm = mock.requests[0]!;
    expect(warm.stream).toBe(false);
    expect(warm.maxTokens).toBe(1);
    expect(warm.cacheControl).toEqual({ type: "ephemeral", ttl: "1h" });

    const r2 = await fetch(`${base}/coach/warm`, { method: "POST", headers: headers() });
    expect(r2.status).toBe(429);
    expect(mock.requests).toHaveLength(1);
  });

  it("chat uses the same cached static block (1h TTL)", async () => {
    const r = await chat("hello", "cm_cache_1");
    expect(r.done).toBeDefined();
    expect(coachCalls()[0]!.cacheControl).toEqual({ type: "ephemeral", ttl: "1h" });
  });
});

describe("idempotent sends", () => {
  it("a repeat of an answered send returns the saved reply without generating again", async () => {
    mock.anthropic = { mode: "ok", reply: "Keep your elbows in." };
    const first = await chat("how do I stop the guard pass?", "cm_replay_1");
    expect(first.text.trim()).toBe("Keep your elbows in.");
    expect(first.done).toMatchObject({ done: true });
    expect(coachCalls()).toHaveLength(1);

    const again = await chat("how do I stop the guard pass?", "cm_replay_1");
    expect(again.text.trim()).toBe("Keep your elbows in.");
    expect(again.done).toMatchObject({ done: true, replayed: true });
    expect(coachCalls()).toHaveLength(1);

    const stored = await rows();
    expect(stored.map((m) => [m.role, m.clientMessageId])).toEqual([
      ["user", "cm_replay_1"],
      ["assistant", "cm_replay_1"],
    ]);
  });

  it("the same words with a NEW id are a new message (not swallowed by the text dedup)", async () => {
    await chat("again", "cm_a");
    await chat("again", "cm_b");
    expect(coachCalls()).toHaveLength(2);
    expect((await rows()).filter((m) => m.role === "user")).toHaveLength(2);
  });

  it("a retry while the reply is still generating attaches to it: one generation, both get the reply", async () => {
    mock.anthropic = { mode: "ok", reply: "One reply only." };
    mock.firstByteDelayMs = 600;
    const [a, b] = await Promise.all([
      chat("double tap", "cm_race_1"),
      new Promise((r) => setTimeout(r, 150)).then(() => chat("double tap", "cm_race_1")),
    ]);
    expect(coachCalls()).toHaveLength(1);
    expect(a.text.trim()).toBe("One reply only.");
    expect(b.text.trim()).toBe("One reply only.");
    expect(a.done).toBeDefined();
    expect(b.done).toBeDefined();
    await waitFor(async () => (await rows()).length === 2);
    expect((await rows()).map((m) => m.role)).toEqual(["user", "assistant"]);
  });

  it("old clients without an id still get the text dedup on retry", async () => {
    mock.anthropic = { mode: "status", status: 400 };
    const failed = await chat("legacy retry");
    expect(failed.error).toBeDefined();
    mock.anthropic = { mode: "ok" };
    await chat("legacy retry");
    expect((await rows()).filter((m) => m.role === "user")).toHaveLength(1);
  });
});

describe("client disconnect", () => {
  it("aborts the provider stream, keeps the partial reply, and a retry replaces it with a full one", async () => {
    mock.anthropic = { mode: "ok", reply: "one two three four five six seven eight nine ten eleven twelve" };
    mock.wordDelayMs = 80;
    const ctl = new AbortController();
    const r = await fetch(`${base}/coach/chat`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ content: "long one please", clientMessageId: "cm_drop_1" }),
      signal: ctl.signal,
    });
    const reader = r.body!.getReader();
    const dec = new TextDecoder();
    let got = "";
    while (!got.includes('"content"')) {
      const { value } = await reader.read();
      got += dec.decode(value);
    }
    ctl.abort();

    // The server stops pulling from the provider instead of finishing the reply.
    await waitFor(() => coachCalls()[0]?.abortedEarly === true);
    // What did arrive is saved, unmarked (no client id) because it is not complete.
    await waitFor(async () => (await rows()).some((m) => m.role === "assistant"));
    const partial = (await rows()).find((m) => m.role === "assistant")!;
    expect(partial.clientMessageId).toBeNull();
    expect(partial.content.length).toBeGreaterThan(0);
    expect(partial.content.trim()).not.toBe("one two three four five six seven eight nine ten eleven twelve");

    // Retry with the same id: a fresh, complete reply replaces the partial.
    mock.wordDelayMs = 0;
    const retry = await chat("long one please", "cm_drop_1");
    expect(retry.done).toBeDefined();
    expect(retry.text.trim()).toBe("one two three four five six seven eight nine ten eleven twelve");
    // The retry's prompt did not include the partial reply.
    const retryCall = coachCalls().at(-1)!;
    expect(retryCall.messages.at(-1)).toMatchObject({ role: "user" });
    await waitFor(async () => (await rows()).filter((m) => m.role === "assistant").length === 1);
    const stored = await rows();
    expect(stored.map((m) => [m.role, m.clientMessageId])).toEqual([
      ["user", "cm_drop_1"],
      ["assistant", "cm_drop_1"],
    ]);
  });
});
