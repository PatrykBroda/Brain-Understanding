/**
 * Coach chat end to end against a REAL Postgres and a local stand-in for both AI
 * providers: the provider toggle then follow-ups (the "FRAME is under heavy load"
 * report), retries, fallback, readiness reaching the coach, the first reply, and the
 * input budget. The stand-in speaks the providers' real streaming formats so the
 * real SDKs run; it is NOT a model, so nothing here says anything about reply quality.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import express from "express";
import crypto from "node:crypto";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { eq, sql } from "drizzle-orm";
import { db, usersTable, fightersTable, conversationsTable, messagesTable } from "@workspace/db";
import { AI_CONSENT_VERSION } from "@workspace/ai-consent";
import { signToken } from "../routes/auth";
import { startMockProviders, type MockProviders } from "./helpers/mockProviders";

const EMAIL = `coach-chat-${Date.now()}@example.com`;
let mock: MockProviders;
let server: Server;
let base = "";
let token = "";
let userId = "";
let fighterId = 0;

const NOW = "2026-10-20T11:00:00Z"; // 18:00 on 20 Oct in Asia/Bangkok

async function call(method: string, path: string, payload?: unknown, now = NOW) {
  const r = await fetch(base + path, {
    method,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
      "x-test-now": now,
      "x-timezone": "Asia/Bangkok",
    },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });
  return { status: r.status, json: (await r.json().catch(() => null)) as any };
}

/** POST /coach/chat and read the SSE stream into events. */
async function chat(content: string, now = NOW) {
  const t0 = Date.now();
  const r = await fetch(`${base}/coach/chat`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
      "x-test-now": now,
      "x-timezone": "Asia/Bangkok",
    },
    body: JSON.stringify({ content }),
  });
  const text = await r.text();
  const events = text
    .split("\n\n")
    .filter((b) => b.startsWith("data: "))
    .map((b) => JSON.parse(b.slice(6)) as Record<string, any>);
  return {
    status: r.status,
    events,
    text: events.filter((e) => e.content).map((e) => e.content).join(""),
    done: events.find((e) => e.done) as { done: true; provider?: string; fallback?: boolean } | undefined,
    error: events.find((e) => e.error) as { error: string; code: string } | undefined,
    ms: Date.now() - t0,
  };
}

/** The coach's own streamed calls to a provider (not the background memory writer). */
const coachCalls = (provider: "anthropic" | "openai") => mock.requests.filter((q) => q.provider === provider && q.stream);

async function resetConversation() {
  await db.delete(conversationsTable).where(eq(conversationsTable.fighterId, fighterId));
}

beforeAll(async () => {
  mock = await startMockProviders();
  process.env["AI_INTEGRATIONS_ANTHROPIC_BASE_URL"] = mock.anthropicBase;
  process.env["AI_INTEGRATIONS_OPENAI_BASE_URL"] = mock.openaiBase;
  process.env["FRAME_ALLOW_TEST_CLOCK"] = "1";
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
      name: "Chat Test",
      dateOfBirth: "1990-06-15",
      age: 36,
      art: "BJJ",
      primarySport: "bjj",
      level: "Blue",
      trainingFrequency: "3-4x / week",
      goals: "win my first comp",
      weaknesses: "guard retention",
      personality: "Under fatigue they raise the pace instead of dropping it — pressure-forward.",
    } as typeof fightersTable.$inferInsert)
    .returning();
  fighterId = f!.id;
  token = await signToken(userId, EMAIL);
  const app = express();
  app.use(express.json());
  // The real app mounts pino-http, which gives every request a logger.
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
  delete process.env["FRAME_ALLOW_TEST_CLOCK"];
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await mock.close();
  await db.delete(usersTable).where(eq(usersTable.id, userId));
});

beforeEach(async () => {
  mock.reset();
  await resetConversation();
  await db.execute(sql`delete from daily_checkins where fighter_id = ${fighterId}`);
  await db.execute(sql`delete from daily_context where fighter_id = ${fighterId}`);
});

describe("provider toggle, then follow-ups (the heavy-load report)", () => {
  it("toggling to OpenAI while OpenAI is rate-limiting no longer strands every follow-up", async () => {
    // Model a tokens-per-minute limit: OpenAI refuses anything big, Claude is fine.
    mock.openai = { mode: "too-big", maxChars: 50_000 };
    const toggle = await call("PATCH", "/conversation/active/provider", { provider: "openai" });
    expect(toggle.status).toBe(200);
    expect(toggle.json.conversation.aiProvider).toBe("openai");

    for (const msg of ["How should I train today?", "And what about tomorrow?", "Thanks, one more thing"]) {
      const r = await chat(msg);
      expect(r.error).toBeUndefined();
      expect(r.text).toContain("Mock reply");
      expect(r.done).toMatchObject({ provider: "claude", fallback: true });
    }
    // The athlete's setting is untouched, so it can recover when OpenAI does.
    const [conv] = await db.select().from(conversationsTable).where(eq(conversationsTable.fighterId, fighterId));
    expect(conv!.aiProvider).toBe("openai");
    // ...and once OpenAI accepts the request again, it is used again.
    mock.openai = { mode: "ok", reply: "From OpenAI." };
    const back = await chat("Back on the first choice?");
    expect(back.done).toMatchObject({ provider: "openai", fallback: false });
    expect(back.text).toContain("From OpenAI");
  }, 40_000);

  it("a one-off 529 is retried and the athlete never sees an error", async () => {
    mock.anthropic = { mode: "status-once", status: 529, reply: "Recovered." };
    const r = await chat("Plain follow-up");
    expect(r.error).toBeUndefined();
    expect(r.text).toContain("Recovered");
    expect(coachCalls("anthropic").filter((q) => q.status === 529)).toHaveLength(1);
    expect(r.done).toMatchObject({ provider: "claude", fallback: false });
  }, 20_000);

  it("when BOTH providers are rate-limited it still ends cleanly with the busy message and a bounded wait", async () => {
    mock.anthropic = { mode: "status", status: 429 };
    mock.openai = { mode: "status", status: 429 };
    const r = await chat("Anyone there?");
    expect(r.error).toMatchObject({ code: "AI_BUSY" });
    expect(r.ms).toBeLessThan(25_000);
    // Nothing half-written was saved as a coach reply.
    const msgs = await db.select().from(messagesTable);
    expect(msgs.filter((m) => m.role === "assistant" && m.content === "").length).toBe(0);
  }, 40_000);

  it("never retries after text has reached the athlete", async () => {
    // A 4xx is not retryable at all: one call, then the error.
    mock.anthropic = { mode: "status", status: 400 };
    mock.openai = { mode: "status", status: 400 };
    const r = await chat("bad request");
    expect(r.error).toBeDefined();
    expect(coachCalls("anthropic")).toHaveLength(1);
  });

  it("validates the toggle request", async () => {
    expect((await call("PATCH", "/conversation/active/provider", { provider: "gemini" })).status).toBe(400);
    expect((await call("PATCH", "/conversation/active/provider", { provider: "claude" })).status).toBe(200);
  });
});

describe("what the coach is told about today", () => {
  it("a logged readiness score reaches the coach with the rule that it must change the advice", async () => {
    await call("POST", "/checkin", { sleep: 30, energy: 35, soreness: 40, stress: 45 });
    const r = await chat("Give me training advice for tonight");
    expect(r.error).toBeUndefined();
    const sys = coachCalls("anthropic")[0]!.system;
    expect(sys).toContain("# Today");
    expect(sys).toContain("Readiness check-in logged TODAY");
    expect(sys).toContain("sleep 30");
    expect(sys).toContain("38/100");
    expect(sys).toContain("no hard sparring");
    expect(sys).toContain("must alter what you prescribe");
    expect(sys).toContain("Recovering");
  });

  it("yesterday's check-in is dated and explicitly NOT today's state", async () => {
    await call("POST", "/checkin", { sleep: 80, energy: 80, soreness: 80, stress: 80 }, "2026-10-19T11:00:00Z");
    const r = await chat("What should I do today?", "2026-10-20T11:00:00Z");
    expect(r.error).toBeUndefined();
    const sys = coachCalls("anthropic")[0]!.system;
    expect(sys).toContain("No readiness check-in has been logged today");
    expect(sys).toContain("Mon 19 Oct");
    expect(sys).toContain("That is NOT today's state");
    expect(sys).toContain("invite them to log one on Home");
    expect(sys).toContain("no fresh read");
  });

  it("with no check-in ever, says so rather than assuming one", async () => {
    await chat("Hi");
    const sys = coachCalls("anthropic")[0]!.system;
    expect(sys).toContain("No readiness check-in has ever been logged");
  });
});

describe("first coaching reply", () => {
  it("the first message after onboarding carries the onboarding answers and a next-step instruction; later ones do not", async () => {
    await chat("Hey coach, where do I start?");
    const first = coachCalls("anthropic").at(-1)!.system;
    expect(first).toContain("# First coaching reply");
    expect(first).toContain("ONE clear next step");
    expect(first).toContain("win my first comp");
    expect(first).toContain("guard retention");
    expect(first).toContain("raise the pace");
    await chat("ok, and then?");
    const second = coachCalls("anthropic").at(-1)!.system;
    expect(second).not.toContain("# First coaching reply");
  });
});

describe("input budget", () => {
  it("a long conversation is trimmed to a bounded history that still starts with the athlete", async () => {
    const [conv] = await db.insert(conversationsTable).values({ fighterId }).returning();
    const big = "x".repeat(2_000);
    const rows = [] as { conversationId: number; role: "user" | "assistant"; content: string; createdAt: Date }[];
    for (let i = 0; i < 80; i++) {
      rows.push({
        conversationId: conv!.id,
        role: i % 2 === 0 ? "user" : "assistant",
        content: `${i}: ${big}`,
        createdAt: new Date(Date.now() - (200 - i) * 1000),
      });
    }
    await db.insert(messagesTable).values(rows);
    const r = await chat("latest question");
    expect(r.error).toBeUndefined();
    const sent = coachCalls("anthropic")[0]!;
    const histChars = sent.messages.reduce((n, m) => n + String(typeof m.content === "string" ? m.content : JSON.stringify(m.content)).length, 0);
    expect(histChars).toBeLessThanOrEqual(48_000 + 2_100);
    expect(sent.messages[0]!.role).toBe("user");
    expect(sent.messages.at(-1)!.content).toContain("latest question");
  });
});
